from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI, OpenAIError
from pydantic import BaseModel
from uuid import uuid4

from app.config import get_settings
from app.scenarios import get_scenario, list_scenarios


settings = get_settings()
sessions: dict[str, dict[str, object]] = {}

app = FastAPI(title="Counterpart API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartSessionRequest(BaseModel):
    scenario_id: str


class NegotiateRequest(BaseModel):
    session_id: str
    message: str


def get_groq_client() -> OpenAI:
    return OpenAI(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1",
    )


@app.post("/api/ping-gpt")
def ping_gpt():
    client = get_groq_client()

    try:
        response = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a concise API connectivity test for Counterpart.",
                },
                {
                    "role": "user",
                    "content": "Reply with one sentence confirming the Groq connection works.",
                },
            ],
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return response.model_dump(mode="json")


@app.get("/api/scenarios")
def scenarios():
    return {"scenarios": list_scenarios()}


@app.post("/api/start-session")
def start_session(payload: StartSessionRequest):
    scenario = get_scenario(payload.scenario_id)

    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found.")

    client = get_groq_client()

    try:
        response = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {
                    "role": "system",
                    "content": scenario.system_prompt,
                },
                {
                    "role": "user",
                    "content": (
                        "Begin the negotiation now with your opening move. "
                        "Speak directly to me in character."
                    ),
                },
            ],
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    opening_message = response.choices[0].message.content or ""
    session_id = str(uuid4())

    sessions[session_id] = {
        "scenario_id": scenario.id,
        "system_prompt": scenario.system_prompt,
        "opening_message": opening_message,
        "history": [
            {
                "role": "user",
                "content": (
                    "Begin the negotiation now with your opening move. "
                    "Speak directly to me in character."
                ),
            },
            {
                "role": "assistant",
                "content": opening_message,
            },
        ],
    }

    return {
        "session_id": session_id,
        "scenario": {
            "id": scenario.id,
            "title": scenario.title,
            "context": scenario.context,
        },
        "opening_message": opening_message,
    }


@app.post("/api/negotiate")
def negotiate(payload: NegotiateRequest):
    session = sessions.get(payload.session_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session expired or invalid. Start a new scenario.",
        )

    user_message = payload.message.strip()

    if not user_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    history = session["history"]

    if not isinstance(history, list):
        raise HTTPException(status_code=500, detail="Session history is invalid.")

    history.append({"role": "user", "content": user_message})

    system_prompt = (
        f"{session['system_prompt']}\n\n"
        "Continue this negotiation using the full conversation history. Remember "
        "earlier statements, concessions, anchors, constraints, and commitments. "
        "Do not agree to terms worse than your stated walk-away point unless the "
        "user has genuinely persuaded you with concrete value, tradeoffs, or leverage."
    )

    client = get_groq_client()

    try:
        response = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                *history,
            ],
        )
    except OpenAIError as exc:
        history.pop()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    reply = response.choices[0].message.content or ""
    history.append({"role": "assistant", "content": reply})

    return {
        "session_id": payload.session_id,
        "reply": reply,
    }
