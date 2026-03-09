import difflib
import json
import os
import pickle
import re
from pathlib import Path
from typing import List
from urllib.parse import quote

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from routes.health import router as health_router

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

IMAGE_DIR = PROJECT_ROOT / "QnA"
AUDIO_DIR = PROJECT_ROOT / "Udvash"

CACHE_FILE = BASE_DIR / "embeddings_cache.pkl"
SOLUTIONS_FILE = BASE_DIR / "solutions.json"

EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

# -----------------------
# Remote dataset config
# -----------------------

REMOTE_DATA = os.getenv("REMOTE_DATA", "false").lower() == "true"
DATA_SOURCE = "remote" if REMOTE_DATA else "local"

HF_BASE_URL = "https://huggingface.co/datasets/Faez0809/qsearch-media/resolve/main/"
HF_API_BASE = "https://huggingface.co/api/datasets/Faez0809/qsearch-media/tree/main/"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)

# Serve local media only if not remote
if not REMOTE_DATA:

    if IMAGE_DIR.is_dir():
        app.mount("/media/qna", StaticFiles(directory=str(IMAGE_DIR)), name="qna")

    if AUDIO_DIR.is_dir():
        app.mount("/media/udvash", StaticFiles(directory=str(AUDIO_DIR)), name="udvash")


class SearchRequest(BaseModel):
    query: str


class SearchResult(BaseModel):
    text: str
    normalized_text: str
    image_path: str | None
    audio_path: str | None
    similarity: float


class SolutionIn(BaseModel):
    question: str
    answer: str


class Solution(SolutionIn):
    id: int


media_index: list[dict] = []
indexed_basenames: set[str] = set()
embedding_model: SentenceTransformer | None = None
cache_needs_save = False
solutions: list[dict] = []


def normalize_text(text: str) -> str:
    text = text.lower()

    try:
        from indic_transliteration import sanscript
        from indic_transliteration.sanscript import transliterate

        text = transliterate(text, sanscript.BENGALI, sanscript.ITRANS)
    except Exception:
        pass

    text = text.replace("aa", "a")
    text = text.replace("ee", "i")
    text = text.replace("ii", "i")
    text = text.replace("oo", "o")
    text = text.replace("ou", "o")

    text = text.replace("n^", "n")
    text = text.replace("~n", "n")

    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text


def tokenize(text: str):
    text = normalize_text(text)
    return [t for t in text.split() if len(t) >= 2]


def fuzzy_token_match_score(query: str, document: str) -> float:
    query_tokens = tokenize(query)
    doc_tokens = tokenize(document)

    if not query_tokens:
        return 0.0

    matched = 0

    for query_token in query_tokens:
        for doc_token in doc_tokens:
            similarity = difflib.SequenceMatcher(None, query_token, doc_token).ratio()

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


def get_embedding_model():
    global embedding_model

    if embedding_model is None:
        embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)

    return embedding_model


def generate_embedding(text: str):
    model = get_embedding_model()

    return model.encode(text).tolist()


def build_media_url(folder: str, filename: str):

    if REMOTE_DATA:
        return HF_BASE_URL + folder + "/" + quote(filename)

    return f"/media/{folder.lower()}/{filename}"


def get_hf_files(folder: str):
    files: list[str] = []
    cursor = None

    try:
        while True:
            params = {"cursor": cursor} if cursor else None
            response = requests.get(HF_API_BASE + folder, params=params, timeout=15)

            if response.status_code != 200:
                return files

            data = response.json()

            if not isinstance(data, list) or not data:
                return files

            for item in data:
                if item.get("type") == "file":
                    files.append(item["path"].split("/")[-1])

            next_cursor = data[-1].get("oid")
            if not next_cursor or next_cursor == cursor:
                return files

            cursor = next_cursor

    except Exception:
        return files


def save_cache():
    payload = {"media_index": media_index, "data_source": DATA_SOURCE}
    with open(CACHE_FILE, "wb") as file:
        pickle.dump(payload, file)


def load_cache():
    global media_index, indexed_basenames, cache_needs_save

    if not CACHE_FILE.exists():
        return False

    try:
        with open(CACHE_FILE, "rb") as file:
            raw_cache = pickle.load(file)

        cache_data_source = None

        if isinstance(raw_cache, dict) and "media_index" in raw_cache:
            media_index = raw_cache.get("media_index", [])
            cache_data_source = raw_cache.get("data_source")
        else:
            media_index = raw_cache

        indexed_basenames = {
            item["base_name"]
            for item in media_index
            if isinstance(item, dict) and "base_name" in item
        }

        cache_needs_save = cache_data_source != DATA_SOURCE

        return True

    except Exception:

        media_index = []
        indexed_basenames = set()

        return False


def scan_media():
    global cache_needs_save

    image_map = {}
    audio_map = {}

    if REMOTE_DATA:

        image_files = get_hf_files("QnA")
        audio_files = get_hf_files("Udvash")

        for filename in image_files:
            base, _ = os.path.splitext(filename)
            image_map[base] = build_media_url("QnA", filename)

        for filename in audio_files:
            base, _ = os.path.splitext(filename)
            audio_map[base] = build_media_url("Udvash", filename)

    else:

        if IMAGE_DIR.is_dir():

            for filename in os.listdir(IMAGE_DIR):

                path = IMAGE_DIR / filename

                if path.is_file():
                    base, _ = os.path.splitext(filename)
                    image_map[base] = build_media_url("QnA", filename)

        if AUDIO_DIR.is_dir():

            for filename in os.listdir(AUDIO_DIR):

                path = AUDIO_DIR / filename

                if path.is_file():
                    base, _ = os.path.splitext(filename)
                    audio_map[base] = build_media_url("Udvash", filename)

    new = 0

    all_bases = set(image_map) | set(audio_map)
    by_base = {item.get("base_name"): item for item in media_index if isinstance(item, dict)}

    for base in sorted(all_bases):
        text = normalize_text(base)
        image_path = image_map.get(base)
        audio_path = audio_map.get(base)
        existing = by_base.get(base)

        if existing:
            if existing.get("text") != text:
                existing["text"] = text
                cache_needs_save = True
            if existing.get("image_path") != image_path:
                existing["image_path"] = image_path
                cache_needs_save = True
            if existing.get("audio_path") != audio_path:
                existing["audio_path"] = audio_path
                cache_needs_save = True
            if "embedding" not in existing:
                existing["embedding"] = generate_embedding(text)
                cache_needs_save = True
            continue

        media_index.append(
            {
                "base_name": base,
                "text": text,
                "image_path": image_path,
                "audio_path": audio_path,
                "embedding": generate_embedding(text),
            }
        )

        indexed_basenames.add(base)
        new += 1

    stale_bases = indexed_basenames - all_bases
    if stale_bases:
        media_index[:] = [
            item for item in media_index if item.get("base_name") not in stale_bases
        ]
        indexed_basenames.difference_update(stale_bases)
        cache_needs_save = True

    return new


def save_solutions():

    with open(SOLUTIONS_FILE, "w", encoding="utf-8") as file:
        json.dump(solutions, file, ensure_ascii=False, indent=2)


def load_solutions():
    global solutions

    if not SOLUTIONS_FILE.exists():
        solutions = []
        return

    try:

        with open(SOLUTIONS_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)

        solutions = data if isinstance(data, list) else []

    except Exception:
        solutions = []


@app.on_event("startup")
def startup():

    get_embedding_model()

    loaded = load_cache()

    new = scan_media()

    load_solutions()

    if not loaded or new or cache_needs_save:
        save_cache()

    print("Indexed items:", len(media_index))


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
            0.15 * cosine
            + 0.55 * fuzzy_score
            + 0.15 * number_score
            + 0.15 * p_bonus
        )

        results.append(
            SearchResult(
                text=item["base_name"],
                normalized_text=doc_text,
                image_path=item["image_path"],
                audio_path=item["audio_path"],
                similarity=round(final * 100, 1),
            )
        )

    results.sort(key=lambda x: x.similarity, reverse=True)

    return results[:3]


@app.get("/solutions", response_model=List[Solution])
def get_solutions():

    return solutions


@app.post("/solutions", response_model=Solution)
def create_solution(payload: SolutionIn):

    question = payload.question.strip()
    answer = payload.answer.strip()

    if not question or not answer:
        raise HTTPException(status_code=400, detail="Question and answer are required")

    next_id = max((item.get("id", 0) for item in solutions), default=0) + 1

    item = {"id": next_id, "question": question, "answer": answer}

    solutions.append(item)

    save_solutions()

    return item


@app.delete("/solutions/{solution_id}")
def delete_solution(solution_id: int):

    global solutions

    before = len(solutions)

    solutions = [item for item in solutions if item.get("id") != solution_id]

    if len(solutions) == before:
        raise HTTPException(status_code=404, detail="Solution not found")

    save_solutions()

    return {"ok": True}

