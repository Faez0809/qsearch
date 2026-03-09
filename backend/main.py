import difflib
import json
import os
import pickle
import re
import threading
import math
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from routes.health import router as health_router

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

IMAGE_DIR = PROJECT_ROOT / "QnA"
AUDIO_DIR = PROJECT_ROOT / "Udvash"

CACHE_FILE = BASE_DIR / "embeddings_cache.pkl"
SOLUTIONS_FILE = BASE_DIR / "solutions.json"

REMOTE_DATA = os.getenv("REMOTE_DATA", "false").strip().lower() == "true"
DATA_SOURCE = "remote" if REMOTE_DATA else "local"

if REMOTE_DATA:
    EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
else:
    EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

MODEL_CACHE_DIR = os.getenv("HF_MODEL_CACHE", "/tmp/hf_models")
HF_BASE_URL = "https://huggingface.co/datasets/Faez0809/qsearch-media/resolve/main/"
HF_API_BASE = "https://huggingface.co/api/datasets/Faez0809/qsearch-media/tree/main/"
HF_TOKEN = os.getenv("HF_TOKEN", "").strip()

app = FastAPI()

allowed_origins = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://qsearch-faez.vercel.app",
}

# Optional: add comma-separated origins via env, e.g.
# CORS_ORIGINS=https://your-vercel-domain.vercel.app,https://app.example.com
extra_cors_origins = os.getenv("CORS_ORIGINS", "").strip()
if extra_cors_origins:
    for origin in extra_cors_origins.split(","):
        cleaned = origin.strip()
        if cleaned:
            allowed_origins.add(cleaned)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if REMOTE_DATA else sorted(allowed_origins),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False if REMOTE_DATA else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)

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


media_index: list[dict[str, Any]] = []
indexed_basenames: set[str] = set()
embedding_model: Any | None = None
model_ready = False
model_warmup_started = False
model_warmup_lock = threading.Lock()
cache_needs_save = False
solutions: list[dict[str, Any]] = []
init_lock = threading.Lock()
is_initialized = False
init_error: str | None = None


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


def tokenize(text: str) -> list[str]:
    return [token for token in normalize_text(text).split() if len(token) >= 2]


def fuzzy_token_match_score(query: str, document: str) -> float:
    query_tokens = tokenize(query)
    doc_tokens = tokenize(document)
    if not query_tokens:
        return 0.0

    matched = 0
    for query_token in query_tokens:
        for doc_token in doc_tokens:
            ratio = difflib.SequenceMatcher(None, query_token, doc_token).ratio()
            if ratio >= 0.75:
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
    return 1.0 if normalize_text(query) in normalize_text(document) else 0.0


def get_embedding_model() -> Any:
    global embedding_model, model_ready
    if embedding_model is None:
        from sentence_transformers import SentenceTransformer

        Path(MODEL_CACHE_DIR).mkdir(parents=True, exist_ok=True)
        embedding_model = SentenceTransformer(
            EMBEDDING_MODEL_NAME,
            cache_folder=MODEL_CACHE_DIR,
        )
    model_ready = True
    return embedding_model


def generate_embedding(text: str) -> list[float]:
    return get_embedding_model().encode(text).tolist()


def cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def build_media_url(folder: str, filename: str) -> str:
    if REMOTE_DATA:
        return HF_BASE_URL + folder + "/" + quote(filename)
    return f"/media/{folder.lower()}/{quote(filename)}"


def get_hf_files(folder: str) -> list[str]:
    files: list[str] = []
    cursor = None
    headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else None
    try:
        while True:
            params = {"cursor": cursor} if cursor else None
            response = requests.get(
                HF_API_BASE + folder,
                params=params,
                headers=headers,
                timeout=20,
            )
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


def save_cache() -> None:
    payload = {"media_index": media_index, "data_source": DATA_SOURCE}
    with open(CACHE_FILE, "wb") as file:
        pickle.dump(payload, file)


def load_cache() -> bool:
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
        elif isinstance(raw_cache, list):
            media_index = raw_cache
        else:
            media_index = []

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


def scan_media() -> int:
    global cache_needs_save

    image_map: dict[str, str] = {}
    audio_map: dict[str, str] = {}

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
                    image_map[base] = build_media_url("qna", filename)

        if AUDIO_DIR.is_dir():
            for filename in os.listdir(AUDIO_DIR):
                path = AUDIO_DIR / filename
                if path.is_file():
                    base, _ = os.path.splitext(filename)
                    audio_map[base] = build_media_url("udvash", filename)

    new_items = 0
    all_bases = set(image_map) | set(audio_map)
    by_base = {
        item.get("base_name"): item for item in media_index if isinstance(item, dict)
    }

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
        new_items += 1

    return new_items


def save_solutions() -> None:
    with open(SOLUTIONS_FILE, "w", encoding="utf-8") as file:
        json.dump(solutions, file, ensure_ascii=False, indent=2)


def load_solutions() -> bool:
    global solutions
    if not SOLUTIONS_FILE.exists():
        solutions = []
        return False
    try:
        with open(SOLUTIONS_FILE, "r", encoding="utf-8") as file:
            raw = json.load(file)
        if isinstance(raw, list):
            solutions = [item for item in raw if isinstance(item, dict)]
        else:
            solutions = []
        return True
    except Exception:
        solutions = []
        return False


def initialize_search_state() -> None:
    global is_initialized, init_error
    if is_initialized:
        return

    with init_lock:
        if is_initialized:
            return

        try:
            loaded_cache = load_cache()
            # Fast path: if a cache for this data source already exists, mark ready
            # immediately and defer heavy model load until first search request.
            if loaded_cache and media_index and not cache_needs_save:
                is_initialized = True
                init_error = None
                load_solutions()
                print(f"Initialization complete from cache. Indexed items: {len(media_index)}")
                return

            get_embedding_model()
            new_items = scan_media()
            load_solutions()

            if not loaded_cache or new_items > 0 or cache_needs_save:
                save_cache()

            is_initialized = True
            init_error = None
            print(f"Initialization complete. Indexed items: {len(media_index)}")
        except Exception as exc:
            init_error = str(exc)
            print(f"Initialization failed: {init_error}")
            raise


def _background_warmup() -> None:
    try:
        initialize_search_state()
    except Exception:
        # Keep server alive; /search will return explicit error until warmup succeeds.
        pass


def _background_model_warmup() -> None:
    try:
        get_embedding_model()
        print("Embedding model warmup complete")
    except Exception as exc:
        print(f"Embedding model warmup failed: {exc}")


def start_model_warmup_once() -> None:
    global model_warmup_started
    with model_warmup_lock:
        if model_warmup_started:
            return
        model_warmup_started = True
        threading.Thread(target=_background_model_warmup, daemon=True).start()


@app.on_event("startup")
def startup() -> None:
    print(f"Starting backend in {DATA_SOURCE} mode")
    print(f"Embedding model: {EMBEDDING_MODEL_NAME}")
    load_solutions()
    threading.Thread(target=_background_warmup, daemon=True).start()
    start_model_warmup_once()
    print("Application startup complete")
    print("Background warmup started")


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "message": f"qsearch backend running ({DATA_SOURCE} mode)"}


@app.get("/ready")
def ready() -> dict[str, Any]:
    return {
        "ready": is_initialized,
        "error": init_error,
        "indexed_items": len(media_index),
        "mode": DATA_SOURCE,
    }


@app.post("/search", response_model=list[SearchResult])
def search(payload: SearchRequest) -> list[SearchResult]:
    if not is_initialized:
        try:
            initialize_search_state()
        except Exception:
            raise HTTPException(
                status_code=503,
                detail="Search is initializing. Please try again in a few seconds.",
            )

    if not media_index:
        return []

    query = normalize_text(payload.query)
    query_embedding: list[float] | None = None
    if model_ready:
        try:
            query_embedding = generate_embedding(query)
        except Exception:
            query_embedding = None
    else:
        start_model_warmup_once()
    results: list[SearchResult] = []

    for item in media_index:
        doc_text = item["text"]
        cosine = 0.0
        if query_embedding is not None and "embedding" in item:
            cosine = float(cosine_sim(query_embedding, item["embedding"]))
        fuzzy_score = fuzzy_token_match_score(query, doc_text)
        number_score = numeric_match_bonus(query, doc_text)
        p_bonus = phrase_bonus(query, doc_text)

        final = (
            (0.15 * cosine)
            + (0.55 * fuzzy_score)
            + (0.15 * number_score)
            + (0.15 * p_bonus)
        )

        results.append(
            SearchResult(
                text=item["base_name"],
                normalized_text=doc_text,
                image_path=item.get("image_path"),
                audio_path=item.get("audio_path"),
                similarity=round(final * 100, 1),
            )
        )

    results.sort(key=lambda result: result.similarity, reverse=True)
    return results[:3]


@app.get("/solutions", response_model=list[Solution])
def get_solutions() -> list[Solution]:
    return [Solution(**item) for item in solutions]


@app.post("/solutions", response_model=Solution)
def create_solution(payload: SolutionIn) -> Solution:
    next_id = max((int(item["id"]) for item in solutions), default=0) + 1
    entry = {"id": next_id, "question": payload.question, "answer": payload.answer}
    solutions.append(entry)
    save_solutions()
    return Solution(**entry)


@app.put("/solutions/{solution_id}", response_model=Solution)
def update_solution(solution_id: int, payload: SolutionIn) -> Solution:
    for item in solutions:
        if int(item.get("id", -1)) == solution_id:
            item["question"] = payload.question
            item["answer"] = payload.answer
            save_solutions()
            return Solution(**item)
    raise HTTPException(status_code=404, detail="Solution not found")


@app.delete("/solutions/{solution_id}")
def delete_solution(solution_id: int) -> dict[str, str]:
    for index, item in enumerate(solutions):
        if int(item.get("id", -1)) == solution_id:
            solutions.pop(index)
            save_solutions()
            return {"message": "Deleted"}
    raise HTTPException(status_code=404, detail="Solution not found")
