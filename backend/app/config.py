from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel
import os


ROOT_DIR = Path(__file__).resolve().parents[2]
LOCAL_ENV_FILE = ROOT_DIR / ".env"

if LOCAL_ENV_FILE.exists():
    load_dotenv(LOCAL_ENV_FILE, override=False)


class Settings(BaseModel):
    groq_api_key: str
    groq_model: str
    frontend_origins: list[str]


def get_frontend_origins() -> list[str]:
    configured_origins = os.environ.get("FRONTEND_ORIGINS") or os.environ.get("FRONTEND_ORIGIN")
    local_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

    if not configured_origins:
        return local_origins

    production_origins = [
        origin.strip()
        for origin in configured_origins.split(",")
        if origin.strip()
    ]

    return list(dict.fromkeys([*local_origins, *production_origins]))


@lru_cache
def get_settings() -> Settings:
    api_key = os.environ.get("GROQ_API_KEY")
    model = os.environ.get("GROQ_MODEL")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing. Set it in the backend environment.")

    if not model:
        raise RuntimeError("GROQ_MODEL is missing. Set it in the backend environment.")

    return Settings(
        groq_api_key=api_key,
        groq_model=model,
        frontend_origins=get_frontend_origins(),
    )
