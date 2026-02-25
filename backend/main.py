import os
import pickle
import re
from typing import List

from fastapi import FastAPI, HTTPException
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)


class SolutionCreate(BaseModel):
    question: str
    answer: str


class Solution(SolutionCreate):
    id: int


class SearchRequest(BaseModel):
    query: str


class SearchResult(BaseModel):
    text: str
    image_path: str | None
    audio_path: str | None
    similarity: float


solutions: List[Solution] = []
next_solution_id = 1
media_index: list[dict[str, str | list[float] | None]] = []
indexed_basenames: set[str] = set()
embedding_model: SentenceTransformer | None = None


def clean_filename_text(text: str) -> str:
    cleaned = re.sub(r"[_\-]+", " ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or text


def get_embedding_model() -> SentenceTransformer:
    global embedding_model
    if embedding_model is None:
        embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return embedding_model


def generate_embedding(text: str) -> list[float]:
    model = get_embedding_model()
    return model.encode(text).tolist()


# 🔥 Improved tokenization for math-heavy text
def tokenize_text(text: str) -> set[str]:
    normalized_text = re.sub(r"[+\-=^(),]", " ", text.lower())
    return {
        token
        for token in normalized_text.split()
        if len(token) >= 2
    }


def extract_numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+", text))


def calculate_keyword_score(query: str, document_text: str) -> float:
    query_tokens = tokenize_text(query)
    if not query_tokens:
        return 0.0

    document_tokens = tokenize_text(document_text)
    overlap_count = len(query_tokens & document_tokens)
    keyword_score = overlap_count / len(query_tokens)

    # numeric bonus
    query_numbers = extract_numbers(query)
    if query_numbers:
        document_numbers = extract_numbers(document_text)
        matching_numbers = query_numbers & document_numbers
        if matching_numbers:
            keyword_score += 0.1 * (len(matching_numbers) / len(query_numbers))

    return min(keyword_score, 1.0)


def save_embedding_cache() -> None:
    with open(CACHE_FILE, "wb") as cache_file:
        pickle.dump({"media_index": media_index}, cache_file)


def load_embedding_cache() -> bool:
    global media_index, indexed_basenames

    if not os.path.exists(CACHE_FILE):
        return False

    with open(CACHE_FILE, "rb") as cache_file:
        cache_data = pickle.load(cache_file)

    cached_media_index = cache_data.get("media_index", [])
    if not isinstance(cached_media_index, list):
        return False

    media_index = cached_media_index
    indexed_basenames = {
        item["base_name"]
        for item in media_index
        if isinstance(item, dict) and item.get("base_name")
    }
    return True


def scan_media_folders() -> int:
    image_files_by_base: dict[str, str] = {}
    audio_files_by_base: dict[str, str] = {}

    if os.path.isdir(IMAGE_DIR):
        for filename in os.listdir(IMAGE_DIR):
            full_path = os.path.join(IMAGE_DIR, filename)
            if not os.path.isfile(full_path):
                continue
            base_name, _ = os.path.splitext(filename)
            image_files_by_base[base_name] = full_path

    if os.path.isdir(AUDIO_DIR):
        for filename in os.listdir(AUDIO_DIR):
            full_path = os.path.join(AUDIO_DIR, filename)
            if not os.path.isfile(full_path):
                continue
            base_name, _ = os.path.splitext(filename)
            audio_files_by_base[base_name] = full_path

    new_items_added = 0
    all_base_names = set(image_files_by_base) | set(audio_files_by_base)

    for base_name in sorted(all_base_names):
        if base_name in indexed_basenames:
            continue

        text = clean_filename_text(base_name)

        media_index.append(
            {
                "base_name": base_name,
                "text": text,
                "image_path": image_files_by_base.get(base_name),
                "audio_path": audio_files_by_base.get(base_name),
                "embedding": generate_embedding(text),
            }
        )
        indexed_basenames.add(base_name)
        new_items_added += 1

    return new_items_added


@app.on_event("startup")
def startup_event() -> None:
    get_embedding_model()

    cache_loaded = load_embedding_cache()
    new_items_added = scan_media_folders()

    if (not cache_loaded) or new_items_added:
        save_embedding_cache()

    print(f"Total indexed media items: {len(media_index)}")


@app.post("/search", response_model=List[SearchResult])
def search_solutions(payload: SearchRequest) -> List[SearchResult]:
    if not media_index:
        return []

    query_embedding = generate_embedding(payload.query)
    scored_results: list[SearchResult] = []

    for item in media_index:
        item_embedding = item.get("embedding")
        if not item_embedding:
            continue

        cosine_score = float(
            cosine_similarity([query_embedding], [item_embedding])[0][0]
        )

        document_text = str(item.get("text") or item.get("base_name") or "")
        keyword_score = calculate_keyword_score(payload.query, document_text)

        # 🔥 Updated weighting
        final_score = 0.3 * cosine_score + 0.7 * keyword_score

        scored_results.append(
            SearchResult(
                text=document_text,
                image_path=item.get("image_path"),
                audio_path=item.get("audio_path"),
                similarity=round(final_score * 100, 1),
            )
        )

    scored_results.sort(key=lambda result: result.similarity, reverse=True)
    return scored_results[:3]


@app.post("/update-index")
def update_index() -> dict[str, int]:
    new_items_added = scan_media_folders()
    if new_items_added:
        save_embedding_cache()
    return {"new_items_added": new_items_added}


@app.get("/solutions", response_model=List[Solution])
def get_solutions() -> List[Solution]:
    return solutions


@app.post("/solutions", response_model=Solution)
def create_solution(payload: SolutionCreate) -> Solution:
    global next_solution_id

    solution = Solution(
        id=next_solution_id,
        question=payload.question,
        answer=payload.answer,
    )
    solutions.append(solution)
    next_solution_id += 1
    return solution


@app.delete("/solutions/{id}")
def delete_solution(id: int) -> dict[str, str]:
    for idx, solution in enumerate(solutions):
        if solution.id == id:
            del solutions[idx]
            return {"message": "Solution deleted"}

    raise HTTPException(status_code=404, detail="Solution not found")
