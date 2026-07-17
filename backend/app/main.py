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
    "resisted_pressure",
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


class EndSessionRequest(BaseModel):
    session_id: str


def serialize_scenario(scenario_id: object) -> dict[str, str]:
    scenario = get_scenario(str(scenario_id))

    if scenario is None:
        return {
            "id": str(scenario_id),
            "title": "Negotiation Session",
            "context": "This session is still active, but its scenario metadata could not be loaded.",
        }

    return {
        "id": scenario.id,
        "title": scenario.title,
        "context": scenario.context,
    }


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


def coerce_int(value: object, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        coerced = int(value)
    except (TypeError, ValueError):
        coerced = default

    if minimum is not None:
        coerced = max(minimum, coerced)

    if maximum is not None:
        coerced = min(maximum, coerced)

    return coerced


def coerce_grade(value: object) -> str:
    if isinstance(value, str) and value.upper() in {"A", "B", "C", "D", "F"}:
        return value.upper()

    return "C"


def coerce_pace(value: object) -> str:
    if isinstance(value, str) and value in {"too fast", "appropriate", "too slow"}:
        return value

    return "appropriate"


def coerce_takeaways(value: object) -> list[str]:
    if isinstance(value, list):
        takeaways = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    else:
        takeaways = []

    fallback_takeaways = [
        "Use a specific anchor backed by concrete leverage before asking for movement.",
        "Avoid concessions that are not tied to a clear tradeoff from the other side.",
        "Name and counter the counterpart's tactic instead of reacting only to the surface offer.",
    ]

    return (takeaways + fallback_takeaways)[:3]


def is_resolved_reframe(turn: object) -> bool:
    if not isinstance(turn, dict):
        return False

    if turn.get("mistake_type") != "missed_reframe":
        return False

    coaching_note = turn.get("coaching_note")

    if not isinstance(coaching_note, str):
        return False

    resolved_terms = ("countered", "reframed", "redirected", "handled", "responded well")
    lowered_note = coaching_note.lower()

    return any(term in lowered_note for term in resolved_terms)


def compute_tactics_successfully_countered(turns: list[object]) -> int:
    total = 0

    for index, turn in enumerate(turns[:-1]):
        if not isinstance(turn, dict) or turn.get("tactic_used") == "none":
            continue

        following_turn = turns[index + 1]

        if not isinstance(following_turn, dict):
            continue

        if following_turn.get("mistake_type") == "good_move" or is_resolved_reframe(following_turn):
            total += 1

    return total


def parse_report_response(
    raw_content: str,
    tactics_faced: list[str],
    concession_count: int,
    tactics_successfully_countered: int,
) -> dict[str, object]:
    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError:
        parsed = {}

    if not isinstance(parsed, dict):
        parsed = {}

    return {
        "overall_grade": coerce_grade(parsed.get("overall_grade")),
        "anchoring_quality": coerce_int(
            parsed.get("anchoring_quality"),
            default=5,
            minimum=1,
            maximum=10,
        ),
        "concession_count": coerce_int(
            concession_count,
            default=concession_count,
            minimum=0,
        ),
        "concession_pace": coerce_pace(parsed.get("concession_pace")),
        "tactics_faced": tactics_faced,
        "tactics_successfully_countered": coerce_int(
            tactics_successfully_countered,
            default=tactics_successfully_countered,
            minimum=0,
        ),
        "takeaways": coerce_takeaways(parsed.get("takeaways")),
        "used_fallback": not bool(parsed),
    }


@app.get("/api/scenarios")
def scenarios():
    return {"scenarios": list_scenarios()}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    session = sessions.get(session_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session expired or invalid. Start a new scenario.",
        )

    turns = session.get("turns")

    if not isinstance(turns, list):
        raise HTTPException(status_code=500, detail="Session turn log is invalid.")

    messages = [
        {
            "role": "assistant",
            "content": session.get("opening_message", ""),
        }
    ]

    for turn in turns:
        if not isinstance(turn, dict):
            continue

        messages.extend(
            [
                {
                    "role": "user",
                    "content": turn.get("user_message", ""),
                },
                {
                    "role": "assistant",
                    "content": turn.get("ai_reply", ""),
                },
            ]
        )

    latest_turn = turns[-1] if turns and isinstance(turns[-1], dict) else None

    return {
        "session_id": session_id,
        "scenario": serialize_scenario(session.get("scenario_id")),
        "opening_message": session.get("opening_message", ""),
        "messages": messages,
        "latest_coaching": {
            "tactic_used": latest_turn.get("tactic_used", "none"),
            "tactic_explanation": latest_turn.get(
                "tactic_explanation",
                "No tactic explanation available.",
            ),
            "coaching_note": latest_turn.get("coaching_note", "No coaching note available."),
            "mistake_type": latest_turn.get("mistake_type", "none"),
            "used_fallback": latest_turn.get("used_fallback", False),
        }
        if latest_turn
        else None,
    }


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
        "turns": [],
    }

    return {
        "session_id": session_id,
        "scenario": serialize_scenario(scenario.id),
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

    turns = session["turns"]

    if not isinstance(turns, list):
        raise HTTPException(status_code=500, detail="Session turn log is invalid.")

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
        'missed_reframe|resisted_pressure|none"}. The reply must be the in-character negotiation '
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
        "deliverables, I can do it for $8,500.' If your reply as the AI counterpart "
        "concedes any ground, such as moving the number, adding value, or softening "
        "your position, in direct response to the user's message, and the user's "
        "message did not introduce new leverage, no new data, no new competing "
        "offer, no new value trade, and no new justification beyond repeating or "
        "rephrasing a prior request, then mistake_type must be unearned_concession. "
        "This applies regardless of whether the user phrased it as a direct demand, "
        "casual pressure like 'meet me halfway', a repeated ask, or 'just give me X'. "
        "Do not default to none just because the message does not resemble a bare "
        "number or emotional appeal. Pressure tactics without leverage are also "
        "unearned_concession when your own reply concedes in response; classify the "
        "user's move based on whether your same-turn reply gave ground without new "
        "leverage, not only on the surface phrasing of the user's message. Use "
        "resisted_pressure when the user attempted to gain ground through pressure "
        "alone, such as a repeated ask, 'meet me halfway', or casual pressure with "
        "no new leverage, and your same-turn reply correctly held firm without "
        "conceding. resisted_pressure is positive but distinct from good_move: it "
        "means the user's pressure move failed because it lacked leverage, not that "
        "the user made a strong, well-supported negotiation move. When mistake_type "
        "is resisted_pressure, coaching_note must explain that the move did not work "
        "because it was pressure without new leverage and therefore did not move the "
        "offer or terms. Keep none reserved only for genuinely neutral or low-content "
        "messages."
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
    turns.append(
        {
            "user_message": user_message,
            "ai_reply": reply,
            "tactic_used": structured_response["tactic_used"],
            "tactic_explanation": structured_response["tactic_explanation"],
            "coaching_note": structured_response["coaching_note"],
            "mistake_type": structured_response["mistake_type"],
            "used_fallback": structured_response["used_fallback"],
        }
    )

    return {
        "session_id": payload.session_id,
        "reply": reply,
        "tactic_used": structured_response["tactic_used"],
        "tactic_explanation": structured_response["tactic_explanation"],
        "coaching_note": structured_response["coaching_note"],
        "mistake_type": structured_response["mistake_type"],
        "used_fallback": structured_response["used_fallback"],
    }


@app.post("/api/end-session")
def end_session(payload: EndSessionRequest):
    session = sessions.get(payload.session_id)

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Session expired or invalid. Start a new scenario.",
        )

    turns = session["turns"]

    if not isinstance(turns, list):
        raise HTTPException(status_code=500, detail="Session turn log is invalid.")

    if not turns:
        raise HTTPException(
            status_code=400,
            detail="No negotiation turns found. Send at least one message before ending.",
        )

    tactics_faced = sorted(
        {
            turn.get("tactic_used")
            for turn in turns
            if isinstance(turn, dict)
            and isinstance(turn.get("tactic_used"), str)
            and turn.get("tactic_used") != "none"
        }
    )
    concession_count = sum(
        1
        for turn in turns
        if isinstance(turn, dict) and turn.get("mistake_type") == "unearned_concession"
    )
    tactics_successfully_countered = compute_tactics_successfully_countered(turns)

    report_prompt = (
        "You are Counterpart's negotiation coach. Generate an end-of-session "
        "report from the provided turn log. Return only a valid JSON object with "
        "this exact shape: "
        '{"overall_grade":"A|B|C|D|F","anchoring_quality":1,'
        '"concession_pace":"too fast|appropriate|too slow",'
        '"takeaways":["string","string","string"]}. '
        "Do not calculate or invent concession_count, tactics_faced, or "
        "tactics_successfully_countered; those exact values are provided as known "
        "facts for you to reference. The three takeaways must be specific, actionable, "
        "and reference actual user messages or counterpart replies from this "
        "conversation rather than generic negotiation advice."
    )

    report_input = {
        "scenario_id": session["scenario_id"],
        "opening_message": session["opening_message"],
        "known_facts": {
            "concession_count": concession_count,
            "tactics_faced": tactics_faced,
            "tactics_successfully_countered": tactics_successfully_countered,
        },
        "tactics_faced": tactics_faced,
        "turns": turns,
    }

    client = get_groq_client()

    try:
        response = client.chat.completions.create(
            model=settings.groq_model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": report_prompt,
                },
                {
                    "role": "user",
                    "content": json.dumps(report_input),
                },
            ],
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    raw_content = response.choices[0].message.content or ""
    report = parse_report_response(
        raw_content,
        tactics_faced,
        concession_count,
        tactics_successfully_countered,
    )

    return {
        "session_id": payload.session_id,
        "scenario_id": session["scenario_id"],
        "scenario": serialize_scenario(session["scenario_id"]),
        "opening_message": session["opening_message"],
        "report": report,
        "turns": turns,
    }
