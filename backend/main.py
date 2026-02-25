from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from routes.health import router as health_router

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


solutions: List[Solution] = []
next_solution_id = 1


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
