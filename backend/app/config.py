from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel
import os


ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


class Settings(BaseModel):
    groq_api_key: str
    groq_model: str
    frontend_origin: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing. Add it to the root .env file.")

    if not model:
        raise RuntimeError("GROQ_MODEL is missing. Add it to the root .env file.")

    return Settings(
        groq_api_key=api_key,
        groq_model=model,
        frontend_origin=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
    )
