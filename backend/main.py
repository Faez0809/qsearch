import os
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from routes.health import router as health_router

IMAGE_DIR = "../QnA"
AUDIO_DIR = "../Udvash"

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


solutions: List[Solution] = []
next_solution_id = 1
media_index: list[dict[str, str | None]] = []
indexed_basenames: set[str] = set()


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

        media_index.append(
            {
                "base_name": base_name,
                "image_path": image_files_by_base.get(base_name),
                "audio_path": audio_files_by_base.get(base_name),
            }
        )
        indexed_basenames.add(base_name)
        new_items_added += 1

    return new_items_added


@app.on_event("startup")
def startup_event() -> None:
    scan_media_folders()
    print(f"Total indexed media items: {len(media_index)}")


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


@app.post("/search", response_model=List[Solution])
def search_solutions(payload: SearchRequest) -> List[Solution]:
    query = payload.query.lower()
    return [solution for solution in solutions if query in solution.question.lower()]


@app.post("/update-index")
def update_index() -> dict[str, int]:
    new_items_added = scan_media_folders()
    return {"new_items_added": new_items_added}


@app.delete("/solutions/{id}")
def delete_solution(id: int) -> dict[str, str]:
    for idx, solution in enumerate(solutions):
        if solution.id == id:
            del solutions[idx]
            return {"message": "Solution deleted"}

    raise HTTPException(status_code=404, detail="Solution not found")
