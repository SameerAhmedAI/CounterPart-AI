# Counterpart

Counterpart is an AI negotiation sparring partner. This scaffold sets up a FastAPI backend and a Vite + React + Tailwind frontend with scenario selection, persona-driven session starts, live coaching, and an end-of-session report.

## Why Groq

This project uses Groq through its OpenAI-compatible API instead of calling OpenAI directly. Groq's free tier keeps the hackathon budget at zero while still letting the app use a familiar chat-completions client shape.

## Project Structure

```text
backend/   FastAPI API server
frontend/  Vite + React + Tailwind client
```

## Environment

Copy `.env.example` to `.env` in the project root and fill in your Groq API key:

```bash
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
FRONTEND_ORIGIN=http://localhost:5173
```

Do not commit `.env`. It is ignored by `.gitignore`, and the API key/model value should be read from `.env` at runtime.

## Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend runs at `http://127.0.0.1:8000`.

Scenario endpoints:

```bash
GET  http://127.0.0.1:8000/api/scenarios
POST http://127.0.0.1:8000/api/start-session
POST http://127.0.0.1:8000/api/negotiate
POST http://127.0.0.1:8000/api/end-session
```

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

Choose a negotiation scenario to generate an in-character opening message, then continue the live negotiation in the chat interface. Each negotiation turn returns the AI reply, the tactic it used, and a coaching note on your last message. End the negotiation to generate a scored report with takeaways and an annotated transcript.
Note: tactic and coaching classification is generated per-turn by the
language model and may occasionally vary in consistency between similar
situations across different sessions. This is an inherent tradeoff of
LLM-based classification rather than a fixed rule engine.
