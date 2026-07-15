import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI, OpenAIError
from pydantic import BaseModel
from uuid import uuid4

from app.config import get_settings
from app.scenarios import get_scenario, list_scenarios


settings = get_settings()
sessions: dict[str, dict[str, object]] = {}
TACTIC_VALUES = {
    "anchoring",
    "false_scarcity",
    "reciprocity_pressure",
    "good_cop_bad_cop",
    "silence_pressure",
    "reframing",
    "none",
}
MISTAKE_VALUES = {
    "unearned_concession",
    "weak_anchor",
    "no_anchor",
    "good_move",
    "missed_reframe",
    "none",
}

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


def coerce_choice(value: object, allowed_values: set[str]) -> str:
    if isinstance(value, str) and value in allowed_values:
        return value

    return "none"


def parse_negotiation_response(raw_content: str) -> dict[str, str | bool]:
    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError:
        return {
            "reply": raw_content.strip()
            or "I need to hold my current position unless you bring concrete leverage.",
            "tactic_used": "none",
            "tactic_explanation": "The model did not return valid tactic metadata.",
            "coaching_note": "No coaching note is available because the model response was not valid JSON.",
            "mistake_type": "none",
            "used_fallback": True,
        }

    if not isinstance(parsed, dict):
        return {
            "reply": "I need to hold my current position unless you bring concrete leverage.",
            "tactic_used": "none",
            "tactic_explanation": "The model returned JSON, but not the expected object shape.",
            "coaching_note": "No coaching note is available because the model response format was unexpected.",
            "mistake_type": "none",
            "used_fallback": True,
        }

    reply = parsed.get("reply")
    tactic_explanation = parsed.get("tactic_explanation")
    coaching_note = parsed.get("coaching_note")

    return {
        "reply": reply.strip()
        if isinstance(reply, str) and reply.strip()
        else "I need to hold my current position unless you bring concrete leverage.",
        "tactic_used": coerce_choice(parsed.get("tactic_used"), TACTIC_VALUES),
        "tactic_explanation": tactic_explanation.strip()
        if isinstance(tactic_explanation, str) and tactic_explanation.strip()
        else "No tactic explanation was provided.",
        "coaching_note": coaching_note.strip()
        if isinstance(coaching_note, str) and coaching_note.strip()
        else "No coaching note was provided.",
        "mistake_type": coerce_choice(parsed.get("mistake_type"), MISTAKE_VALUES),
        "used_fallback": False,
    }


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
        "user has genuinely persuaded you with concrete value, tradeoffs, or leverage.\n\n"
        "Return only a valid JSON object with this exact shape: "
        '{"reply":"string","tactic_used":"anchoring|false_scarcity|'
        'reciprocity_pressure|good_cop_bad_cop|silence_pressure|reframing|none",'
        '"tactic_explanation":"string","coaching_note":"string",'
        '"mistake_type":"unearned_concession|weak_anchor|no_anchor|good_move|'
        'missed_reframe|none"}. The reply must be the in-character negotiation '
        "response only. tactic_used must describe the tactic you used in that reply. "
        "tactic_explanation must be one plain-language sentence. coaching_note must "
        "directly analyze only the user's most recent message in one sentence. "
        "mistake_type must classify that latest user message. none and good_move "
        "are not the same thing: none should be rare and only used for neutral "
        "or filler messages with no negotiation content, such as small talk or a "
        "clarifying question. If the user provides a specific number backed by "
        "real leverage such as market data, a competing offer, demonstrated value, "
        "or a clear business justification, mistake_type must be good_move, not "
        "none. Examples of good_move: 'Market data shows this role pays $145k-$160k, "
        "and with my six years of relevant experience I am targeting $152k.' "
        "Another good_move: 'I have a competing offer at $148k, so I would need "
        "$150k or a signing bonus to accept this week.' Another good_move: "
        "'If I commit to a 12-month contract and reduce scope to these three "
        "deliverables, I can do it for $8,500.'"
    )

    client = get_groq_client()

    try:
        response = client.chat.completions.create(
            model=settings.groq_model,
            response_format={"type": "json_object"},
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

    raw_content = response.choices[0].message.content or ""
    structured_response = parse_negotiation_response(raw_content)
    reply = structured_response["reply"]
    history.append({"role": "assistant", "content": reply})

    return {
        "session_id": payload.session_id,
        "reply": reply,
        "tactic_used": structured_response["tactic_used"],
        "tactic_explanation": structured_response["tactic_explanation"],
        "coaching_note": structured_response["coaching_note"],
        "mistake_type": structured_response["mistake_type"],
        "used_fallback": structured_response["used_fallback"],
    }
