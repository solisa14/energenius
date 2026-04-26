# Run with: uvicorn backend.main:app --reload --port 8000
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routers import (
    availability_actions,
    chat,
    external_data,
    feedback,
    recommendations,
)

app = FastAPI(title="EnerGenius API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recommendations.router, prefix="/api", tags=["recommendations"])
app.include_router(feedback.router, prefix="/api", tags=["feedback"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(availability_actions.router, prefix="/api", tags=["availability"])
app.include_router(external_data.router, prefix="/api", tags=["external_data"])


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}
