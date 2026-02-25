import os
import pickle
import re
import difflib
from typing import List

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from routes.health import router as health_router

IMAGE_DIR = "../QnA"
AUDIO_DIR = "../Udvash"
CACHE_FILE = "embeddings_cache.pkl"
EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

app = FastAPI()

app.mount("/QnA", StaticFiles(directory="../QnA"), name="QnA")
app.mount("/Udvash", StaticFiles(directory="../Udvash"), name="Udvash")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)


# -----------------------------
# 🔹 Models
# -----------------------------
class SearchRequest(BaseModel):
    query: str


class SearchResult(BaseModel):
    text: str
    image_path: str | None
    audio_path: str | None
    similarity: float


# -----------------------------
# 🔹 Global State
# -----------------------------
media_index: list[dict] = []
indexed_basenames: set[str] = set()
embedding_model: SentenceTransformer | None = None


# -----------------------------
# 🔹 Normalization
# -----------------------------
def normalize_text(text: str) -> str:
    text = text.lower()

    # Bangla → Roman transliteration
    try:
        from indic_transliteration import sanscript
        from indic_transliteration.sanscript import transliterate
        text = transliterate(text, sanscript.BENGALI, sanscript.ITRANS)
    except Exception:
        pass

    # Normalize vowels
    text = text.replace("aa", "a")
    text = text.replace("ee", "i")
    text = text.replace("ii", "i")
    text = text.replace("oo", "o")
    text = text.replace("ou", "o")

    # Remove nasal noise
    text = text.replace("n^", "n")
    text = text.replace("~n", "n")

    # Remove special characters
    text = re.sub(r"[^\w\s]", " ", text)

    # Remove extra spaces
    text = re.sub(r"\s+", " ", text).strip()

    return text


def tokenize(text: str):
    text = normalize_text(text)
    return [t for t in text.split() if len(t) >= 2]


# -----------------------------
# 🔹 Fuzzy Matching
# -----------------------------
def fuzzy_token_match_score(query: str, document: str) -> float:
    query_tokens = tokenize(query)
    doc_tokens = tokenize(document)

    if not query_tokens:
        return 0.0

    matched = 0

    for qt in query_tokens:
        for dt in doc_tokens:
            similarity = difflib.SequenceMatcher(None, qt, dt).ratio()
            if similarity >= 0.75:
                matched += 1
                break

    return matched / len(query_tokens)


def numeric_match_bonus(query: str, document: str) -> float:
    query_nums = set(re.findall(r"\d+", query))
    if not query_nums:
        return 0.0

    doc_nums = set(re.findall(r"\d+", document))
    matched = query_nums & doc_nums

    if not matched:
        return 0.0

    return len(matched) / len(query_nums)


def phrase_bonus(query: str, document: str) -> float:
    q = normalize_text(query)
    d = normalize_text(document)
    return 1.0 if q in d else 0.0


# -----------------------------
# 🔹 Embeddings
# -----------------------------
def get_embedding_model():
    global embedding_model
    if embedding_model is None:
        embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return embedding_model


def generate_embedding(text: str):
    model = get_embedding_model()
    return model.encode(text).tolist()


# -----------------------------
# 🔹 Cache
# -----------------------------
def save_cache():
    with open(CACHE_FILE, "wb") as f:
        pickle.dump(media_index, f)


def load_cache():
    global media_index, indexed_basenames

    if not os.path.exists(CACHE_FILE):
        return False

    try:
        with open(CACHE_FILE, "rb") as f:
            media_index = pickle.load(f)

        # Ensure structure is correct
        if not isinstance(media_index, list):
            media_index = []
            return False

        indexed_basenames = {
            item["base_name"]
            for item in media_index
            if isinstance(item, dict) and "base_name" in item
        }

        return True

    except Exception:
        media_index = []
        indexed_basenames = set()
        return False


# -----------------------------
# 🔹 Indexing
# -----------------------------
def scan_media():
    image_map = {}
    audio_map = {}

    if os.path.isdir(IMAGE_DIR):
        for f in os.listdir(IMAGE_DIR):
            path = os.path.join(IMAGE_DIR, f)
            if os.path.isfile(path):
                base, _ = os.path.splitext(f)
                image_map[base] = path

    if os.path.isdir(AUDIO_DIR):
        for f in os.listdir(AUDIO_DIR):
            path = os.path.join(AUDIO_DIR, f)
            if os.path.isfile(path):
                base, _ = os.path.splitext(f)
                audio_map[base] = path

    new = 0
    all_bases = set(image_map) | set(audio_map)

    for base in sorted(all_bases):
        if base in indexed_basenames:
            continue

        text = normalize_text(base)

        media_index.append({
            "base_name": base,
            "text": text,
            "image_path": image_map.get(base),
            "audio_path": audio_map.get(base),
            "embedding": generate_embedding(text),
        })

        indexed_basenames.add(base)
        new += 1

    return new


@app.on_event("startup")
def startup():
    get_embedding_model()
    loaded = load_cache()
    new = scan_media()

    if not loaded or new:
        save_cache()

    print("Indexed items:", len(media_index))


# -----------------------------
# 🔹 SEARCH
# -----------------------------
@app.post("/search", response_model=List[SearchResult])
def search(payload: SearchRequest):
    if not media_index:
        return []

    query = normalize_text(payload.query)
    query_embedding = generate_embedding(query)

    results = []

    for item in media_index:
        doc_text = item["text"]

        cosine = float(
            cosine_similarity([query_embedding], [item["embedding"]])[0][0]
        )

        fuzzy_score = fuzzy_token_match_score(query, doc_text)
        number_score = numeric_match_bonus(query, doc_text)
        p_bonus = phrase_bonus(query, doc_text)

        final = (
            0.15 * cosine +
            0.55 * fuzzy_score +
            0.15 * number_score +
            0.15 * p_bonus
        )

        results.append(
            SearchResult(
                text=doc_text,
                image_path=f"/QnA/{os.path.basename(item['image_path'])}" if item["image_path"] else None,
                audio_path=f"/Udvash/{os.path.basename(item['audio_path'])}" if item["audio_path"] else None,
                similarity=round(final * 100, 1),
            )
        )

    results.sort(key=lambda x: x.similarity, reverse=True)
    return results[:3]
