import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

const coachingStyles = {
  good_move: {
    label: "Good Move",
    border: "border-[#5C7A5C]",
    background: "bg-[#5C7A5C]/20",
    text: "text-[#B8C9B0]",
    signal: "bg-[#5C7A5C]",
    meter: "82%",
  },
  resisted_pressure: {
    label: "Resisted Pressure",
    border: "border-[#B8863E]",
    background: "bg-[#B8863E]/16",
    text: "text-[#F3D49B]",
    signal: "bg-[#B8863E]",
    meter: "56%",
  },
  none: {
    label: "Neutral",
    border: "border-[#4A3F33]",
    background: "bg-[#2A2825]",
    text: "text-[#E8DED2]",
    signal: "bg-[#8C7B66]",
    meter: "22%",
  },
  mistake: {
    label: "Mistake",
    border: "border-[#9C4A3C]",
    background: "bg-[#9C4A3C]/20",
    text: "text-[#E1A096]",
    signal: "bg-[#9C4A3C]",
    meter: "72%",
  },
};

function formatLabel(value) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getCoachingStyle(mistakeType) {
  if (mistakeType === "good_move") {
    return coachingStyles.good_move;
  }

  if (mistakeType === "resisted_pressure") {
    return coachingStyles.resisted_pressure;
  }

  if (!mistakeType || mistakeType === "none") {
    return coachingStyles.none;
  }

  return coachingStyles.mistake;
}

function App() {
  return (
    <BrowserRouter>
      <main className="min-h-screen bg-[#1C1B1A] text-[#E8DED2]">
        <div className="min-h-screen w-full px-5 py-6 sm:px-8 lg:px-12">
          <Routes>
            <Route path="/" element={<IntroRoute />} />
            <Route path="/scenarios" element={<ScenarioRoute />} />
            <Route path="/negotiate/:sessionId" element={<NegotiationRoute />} />
            <Route path="/report/:sessionId" element={<ReportRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </BrowserRouter>
  );
}

function IntroRoute() {
  const navigate = useNavigate();

  return <IntroScreen onStart={() => navigate("/scenarios")} />;
}

function ScenarioRoute() {
  const [scenarios, setScenarios] = useState([]);
  const [loadingScenarioId, setLoadingScenarioId] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function loadScenarios() {
      try {
        const response = await fetch("/api/scenarios");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Scenario table unavailable.");
        }

        setScenarios(data.scenarios || []);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Scenario table unavailable. ${err.message} Check that the backend is running.`
            : "Scenario table unavailable. Check that the backend is running.",
        );
      }
    }

    loadScenarios();
  }, []);

  async function startSession(scenarioId) {
    setLoadingScenarioId(scenarioId);
    setError("");

    try {
      const response = await fetch("/api/start-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scenario_id: scenarioId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Session could not be opened.");
      }

      navigate(`/negotiate/${data.session_id}`, {
        state: {
          session: data,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Session could not be opened. ${err.message} Try again after checking the backend.`
          : "Session could not be opened. Try again after checking the backend.",
      );
    } finally {
      setLoadingScenarioId("");
    }
  }

  return (
    <ScenarioScreen
      scenarios={scenarios}
      loadingScenarioId={loadingScenarioId}
      error={error}
      onStartSession={startSession}
    />
  );
}

function normalizeCoaching(coaching) {
  if (!coaching) {
    return null;
  }

  return {
    tacticUsed: coaching.tactic_used || "none",
    tacticExplanation: coaching.tactic_explanation || "No tactic explanation available.",
    coachingNote: coaching.coaching_note || "No coaching note available.",
    mistakeType: coaching.mistake_type || "none",
    usedFallback: Boolean(coaching.used_fallback),
  };
}

function getSessionState(session, fallbackSessionId) {
  return {
    session_id: session.session_id || fallbackSessionId,
    scenario: session.scenario,
    opening_message: session.opening_message,
  };
}

function NegotiationRoute() {
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routedSession =
    location.state?.session?.session_id === sessionId ? location.state.session : null;
  const [selectedSession, setSelectedSession] = useState(
    routedSession ? getSessionState(routedSession, sessionId) : null,
  );
  const [messages, setMessages] = useState(
    routedSession
      ? [
          {
            role: "assistant",
            content: routedSession.opening_message,
          },
        ]
      : [],
  );
  const [latestCoaching, setLatestCoaching] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState("");
  const [inputError, setInputError] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const latestMessageRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadSession() {
      setIsLoadingSession(true);
      setError("");

      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Session expired or invalid. Start a new scenario.");
        }

        if (!isCurrent) {
          return;
        }

        setSelectedSession(getSessionState(data, sessionId));
        setMessages(data.messages || []);
        setLatestCoaching(normalizeCoaching(data.latest_coaching));
      } catch (err) {
        if (!isCurrent) {
          return;
        }

        setSelectedSession(null);
        setMessages([]);
        setLatestCoaching(null);
        setError(
          err instanceof Error
            ? `Session not found. ${err.message}`
            : "Session not found. Start a new scenario.",
        );
      } finally {
        if (isCurrent) {
          setIsLoadingSession(false);
        }
      }
    }

    loadSession();

    return () => {
      isCurrent = false;
    };
  }, [sessionId]);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage(event) {
    event.preventDefault();

    const trimmedMessage = draftMessage.trim();

    if (!trimmedMessage) {
      setInputError("Enter a negotiation move before sending.");
      return;
    }

    if (isSending || !selectedSession || !sessionId) {
      return;
    }

    setIsSending(true);
    setError("");
    setInputError("");
    setDraftMessage("");
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        role: "user",
        content: trimmedMessage,
      },
    ]);

    try {
      const response = await fetch("/api/negotiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: trimmedMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Turn could not be processed.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: data.reply,
        },
      ]);
      setLatestCoaching({
        tacticUsed: data.tactic_used || "none",
        tacticExplanation: data.tactic_explanation || "No tactic explanation available.",
        coachingNote: data.coaching_note || "No coaching note available.",
        mistakeType: data.mistake_type || "none",
        usedFallback: Boolean(data.used_fallback),
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Turn failed. ${err.message} Keep the session open and send again after checking the backend.`
          : "Turn failed. Keep the session open and send again after checking the backend.",
      );
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "system",
          content: "Turn failed. The session is still open; retry after checking the backend.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function endSession() {
    if (!selectedSession || isEnding || !sessionId) {
      return;
    }

    setIsEnding(true);
    setError("");

    try {
      const response = await fetch("/api/end-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Report could not be generated.");
      }

      navigate(`/report/${sessionId}`, {
        state: {
          reportData: data,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Report could not be generated. ${err.message} Send another turn or check the backend.`
          : "Report could not be generated. Send another turn or check the backend.",
      );
    } finally {
      setIsEnding(false);
    }
  }

  if (isLoadingSession && !selectedSession) {
    return <LoadingPanel message="Loading negotiation session." />;
  }

  if (!selectedSession) {
    return <SessionNotFound message={error} />;
  }

  return (
    <ChatScreen
      selectedSession={selectedSession}
      messages={messages}
      latestCoaching={latestCoaching}
      draftMessage={draftMessage}
      error={error}
      inputError={inputError}
      isSending={isSending}
      isEnding={isEnding}
      latestMessageRef={latestMessageRef}
      formatLabel={formatLabel}
      getCoachingStyle={getCoachingStyle}
      onBack={() => navigate("/scenarios")}
      onEndSession={endSession}
      onDraftChange={(value) => {
        setDraftMessage(value);
        if (inputError && value.trim()) {
          setInputError("");
        }
      }}
      onInputKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
      onSend={sendMessage}
    />
  );
}

function ReportRoute() {
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [reportData, setReportData] = useState(location.state?.reportData || null);
  const [loadingScenarioId, setLoadingScenarioId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (reportData || !sessionId) {
      return;
    }

    let isCurrent = true;

    async function loadReport() {
      try {
        const response = await fetch("/api/end-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: sessionId,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Report could not be generated.");
        }

        if (isCurrent) {
          setReportData(data);
        }
      } catch (err) {
        if (isCurrent) {
          setError(
            err instanceof Error
              ? `Report could not be loaded. ${err.message}`
              : "Report could not be loaded. Start a new scenario.",
          );
        }
      }
    }

    loadReport();

    return () => {
      isCurrent = false;
    };
  }, [reportData, sessionId]);

  async function tryAgain() {
    const scenarioId = reportData?.scenario?.id || reportData?.scenario_id;

    if (!scenarioId) {
      setError("Scenario could not be restarted from this report.");
      return;
    }

    setLoadingScenarioId(scenarioId);
    setError("");

    try {
      const response = await fetch("/api/start-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scenario_id: scenarioId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Session could not be opened.");
      }

      navigate(`/negotiate/${data.session_id}`, {
        state: {
          session: data,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Session could not be opened. ${err.message} Try again after checking the backend.`
          : "Session could not be opened. Try again after checking the backend.",
      );
    } finally {
      setLoadingScenarioId("");
    }
  }

  if (!reportData && !error) {
    return <LoadingPanel message="Loading session report." />;
  }

  if (!reportData) {
    return <SessionNotFound message={error} />;
  }

  return (
    <>
      {error ? <ErrorBanner message={error} /> : null}
      <ReportScreen
        reportData={reportData}
        selectedSession={{
          session_id: sessionId,
          scenario: reportData.scenario,
        }}
        loadingScenarioId={loadingScenarioId}
        formatLabel={formatLabel}
        onTryAgain={tryAgain}
      />
    </>
  );
}

function LoadingPanel({ message }) {
  return (
    <section className="screen-panel flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <p className="rounded-md border border-[#4A3F33] bg-[#252321] px-5 py-4 font-sans text-sm font-semibold text-[#B9AB99]">
        {message}
      </p>
    </section>
  );
}

function SessionNotFound({ message }) {
  return (
    <section className="screen-panel flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center gap-5 text-center">
      <ErrorBanner message={message || "Session not found. Start a new scenario."} />
      <Link
        to="/scenarios"
        className="rounded-md bg-[#B8863E] px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#1C1B1A] transition duration-200 hover:bg-[#D0A15A]"
      >
        Back to scenarios
      </Link>
    </section>
  );
}

function IntroScreen({ onStart }) {
  return (
    <section className="screen-panel flex min-h-[calc(100vh-3rem)] w-full flex-col items-center justify-center gap-12 py-10">
      <div className="flex max-w-5xl flex-col items-center text-center">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-[#B8863E]">
          Counterpart
        </p>
        <h1 className="mt-4 max-w-5xl font-serif text-5xl font-semibold leading-[0.95] text-[#F1E7DA] sm:text-6xl lg:text-7xl xl:text-8xl">
          Practice at the table before the stakes are real.
        </h1>
        <p className="mt-6 max-w-3xl font-sans text-base leading-8 text-[#D0C3B4] sm:text-lg">
          Counterpart puts you across from a resistant AI negotiator with a clear role, leverage, and walk-away point. Pick a scenario, make your case, then read the pressure, tactics, and concessions as they happen.
        </p>
        <p className="mt-4 max-w-3xl font-sans text-base leading-8 text-[#B9AB99]">
          At the end, you get a scored transcript that shows where you anchored well, where you gave ground, and how to improve the next pass.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-8 w-fit rounded-md bg-[#B8863E] px-6 py-3 font-sans text-sm font-bold uppercase tracking-[0.12em] text-[#1C1B1A] transition duration-200 hover:bg-[#D0A15A] focus:outline-none focus:ring-2 focus:ring-[#E8DED2] focus:ring-offset-2 focus:ring-offset-[#1C1B1A]"
        >
          Start Practicing
        </button>
      </div>

      <aside className="grid w-full max-w-5xl gap-5 border-t border-[#4A3F33] bg-[#252321] px-6 py-6 text-[#E8DED2] sm:grid-cols-3 lg:px-8">
        <p className="font-sans text-xs font-bold uppercase tracking-[0.18em] text-[#B8863E]">
          Table read
        </p>
        <div className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
          {[
            ["Anchor", "Open with a number and a reason."],
            ["Pressure", "Spot when the other side is testing resolve."],
            ["Trade", "Move only when value moves with you."],
          ].map(([title, copy]) => (
            <div key={title} className="border-l-2 border-[#B8863E] pl-4">
              <p className="font-serif text-2xl font-semibold">{title}</p>
              <p className="mt-1 font-sans text-sm leading-6 text-[#B9AB99]">{copy}</p>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function ScenarioScreen({ scenarios, loadingScenarioId, error, onStartSession }) {
  return (
    <section className="screen-panel py-8 lg:py-10">
      <div className="flex flex-col items-center">
        <div className="flex max-w-3xl flex-col items-center gap-3 text-center">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-[#B8863E]">
            Choose the other side
          </p>
          <h1 className="font-serif text-4xl font-semibold text-[#F1E7DA] sm:text-5xl">
            Select a negotiation table.
          </h1>
          <p className="max-w-2xl font-sans text-base leading-7 text-[#D0C3B4]">
            Each scenario opens with a counterpart who has their own incentives, limits, and pressure tactics.
          </p>
        </div>

        <div className="mt-12 grid w-full max-w-5xl auto-rows-fr gap-5 sm:grid-cols-2">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onStartSession(scenario.id)}
              disabled={Boolean(loadingScenarioId)}
              className="group flex min-h-64 h-full flex-col items-center justify-between rounded-md border border-[#4A3F33] bg-[#252321] px-7 py-7 text-center text-[#E8DED2] transition duration-200 hover:-translate-y-0.5 hover:border-[#B8863E] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex flex-1 flex-col items-center justify-center">
                <span className="font-serif text-2xl font-semibold leading-tight">{scenario.title}</span>
                <span className="mt-4 block max-w-sm font-sans text-sm leading-6 text-[#B9AB99]">
                  {scenario.context}
                </span>
              </span>
              <span className="mt-5 block font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#B8863E]">
                {loadingScenarioId === scenario.id ? "Opening table..." : "Start scenario"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
    </section>
  );
}

function ChatScreen({
  selectedSession,
  messages,
  latestCoaching,
  draftMessage,
  error,
  inputError,
  isSending,
  isEnding,
  latestMessageRef,
  formatLabel,
  getCoachingStyle,
  onBack,
  onEndSession,
  onDraftChange,
  onInputKeyDown,
  onSend,
}) {
  return (
    <section className="screen-panel flex min-h-[calc(100vh-3rem)] flex-col gap-5 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 w-fit rounded-md border border-[#4A3F33] bg-[#252321] px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#D0C3B4] transition duration-200 hover:border-[#B8863E] hover:text-[#F1E7DA] active:translate-y-px"
        >
          Back to scenarios
        </button>
        <button
          type="button"
          onClick={onEndSession}
          disabled={isEnding || isSending || messages.length < 2}
          className="min-h-11 w-fit rounded-md border border-[#B8863E] bg-[#B8863E] px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#1C1B1A] transition duration-200 hover:bg-[#D0A15A] active:translate-y-px disabled:cursor-not-allowed disabled:border-[#4A3F33] disabled:bg-[#3A342E] disabled:text-[#8C7B66]"
        >
          {isEnding ? "Preparing report..." : "End negotiation"}
        </button>
      </div>

      <div>
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-[#B8863E]">
          Session {selectedSession.session_id}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold text-[#F1E7DA]">
          {selectedSession.scenario.title}
        </h1>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-[#B9AB99]">
          {selectedSession.scenario.context}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-h-0 flex-col rounded-md border border-[#4A3F33] bg-[#252321]">
          <div className="themed-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 pr-3 sm:p-5 sm:pr-4">
            {messages.map((message, index) => (
              <MessageBubble
                key={`${message.role}-${index}`}
                message={message}
                refValue={index === messages.length - 1 ? latestMessageRef : null}
              />
            ))}

            {isSending ? (
              <div className="flex justify-start" ref={latestMessageRef}>
                <div className="rounded-md border border-[#4A3F33] bg-[#1C1B1A] px-4 py-3 font-sans text-sm text-[#B9AB99]">
                  Counterpart is weighing the table.
                </div>
              </div>
            ) : null}
          </div>

          {error ? <ErrorBanner message={error} compact /> : null}

          <form onSubmit={onSend} className="mt-auto border-t border-[#4A3F33] p-3">
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="negotiation-message">
                Your negotiation message
              </label>
              <textarea
                id="negotiation-message"
                value={draftMessage}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={onInputKeyDown}
                disabled={isSending}
                rows={1}
                placeholder="Make your next move..."
                className="max-h-28 min-h-10 flex-1 resize-none rounded-md border border-[#4A3F33] bg-[#1F1D1B] px-3 py-2 font-sans text-sm leading-5 text-[#E8DED2] outline-none transition duration-200 placeholder:text-[#8C7B66] focus:border-[#B8863E] disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isSending}
                aria-label={isSending ? "Sending message" : "Send message"}
                title={isSending ? "Sending" : "Send"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#B8863E] bg-[#B8863E] text-[#1C1B1A] transition duration-200 hover:bg-[#D0A15A] active:translate-y-px disabled:cursor-not-allowed disabled:border-[#4A3F33] disabled:bg-[#3A342E] disabled:text-[#8C7B66]"
              >
                <SendIcon />
              </button>
            </div>
            {inputError ? (
              <p className="mt-3 font-sans text-sm font-semibold text-[#F1B8AE]">{inputError}</p>
            ) : null}
          </form>
        </div>

        <CoachingReadout
          latestCoaching={latestCoaching}
          formatLabel={formatLabel}
          getCoachingStyle={getCoachingStyle}
        />
      </div>
    </section>
  );
}

function MessageBubble({ message, refValue }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} ref={refValue}>
      <div
        className={`max-w-[82%] rounded-md px-5 py-4 sm:max-w-[68%] ${
          isUser
            ? "border border-[#B8863E] bg-[#2A2825] text-[#E8DED2]"
            : isSystem
              ? "border border-[#9C4A3C] bg-[#9C4A3C]/15 text-[#F1B8AE]"
            : "border border-[#4A3F33] bg-[#252321] text-[#E8DED2]"
        }`}
      >
        <p className="mb-1 font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] opacity-75">
          {isUser ? "You" : isSystem ? "System" : "Counterpart"}
        </p>
        <p className={`whitespace-pre-wrap leading-7 ${isUser ? "font-sans text-sm" : "font-serif text-lg"}`}>
          {message.content}
        </p>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function CoachingReadout({ latestCoaching, formatLabel, getCoachingStyle }) {
  const style = getCoachingStyle(latestCoaching?.mistakeType);
  const tacticLabel = latestCoaching ? formatLabel(latestCoaching.tacticUsed) : "Awaiting Move";
  const moveLabel = latestCoaching ? formatLabel(latestCoaching.mistakeType) : "No Signal";

  return (
    <aside className="rounded-md border border-[#4A3F33] bg-[#252321] p-5 text-[#E8DED2]">
      <p className="font-sans text-xs font-bold uppercase tracking-[0.18em] text-[#B8863E]">
        Live readout
      </p>

      {latestCoaching ? (
        <div className="mt-4 space-y-4">
          <div className="border border-[#4A3F33] bg-[#2A2825] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
                  Pressure signal
                </p>
                <p className="mt-1 font-serif text-2xl font-semibold">{style.label}</p>
              </div>
              <div className={`h-10 w-2 rounded-full ${style.signal}`} />
            </div>

            <div className="mt-5 h-2 rounded-full bg-[#3A342E]">
              <div className={`h-2 rounded-full ${style.signal} transition-all duration-300`} style={{ width: style.meter }} />
            </div>
          </div>

          <div className="border-l-2 border-[#B8863E] pl-4">
            <p className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
              Counterpart tactic
            </p>
            <p className="mt-1 font-serif text-xl font-semibold">{tacticLabel}</p>
            <details className="mt-2 font-sans text-sm leading-6 text-[#B9AB99]">
              <summary className="cursor-pointer font-bold text-[#B8863E]">
                Read tactic
              </summary>
              <p className="mt-2">{latestCoaching.tacticExplanation}</p>
            </details>
          </div>

          <div className={`rounded-md border p-4 ${style.border} ${style.background}`}>
            <p className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
              Your move
            </p>
            <p className={`mt-1 font-serif text-xl font-semibold ${style.text}`}>{moveLabel}</p>
            <p className="mt-3 font-sans text-sm leading-6 text-[#D0C3B4]">{latestCoaching.coachingNote}</p>
          </div>

          {latestCoaching.usedFallback ? (
            <p className="rounded-md border border-[#9C4A3C] bg-[#9C4A3C]/15 p-3 font-sans text-sm leading-6 text-[#E1A096]">
              Coaching metadata fell back because the model response was not valid JSON.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <p className="font-sans text-sm leading-6 text-[#B9AB99]">
            The readout activates after your first reply. It tracks whether pressure is rising, whether leverage is real, and whether the counterpart used a named tactic.
          </p>

          <div className="space-y-4">
            {[
              ["Anchor", "A number or position enters the room. Strong anchors are backed by leverage."],
              ["Pressure", "A demand, repeat ask, scarcity claim, or push to move without new value."],
              ["Trade", "Movement tied to a concession, term, timeline, or concrete business reason."],
            ].map(([title, copy]) => (
              <div key={title} className="border-l-2 border-[#B8863E] pl-4">
                <p className="font-serif text-xl font-semibold">{title}</p>
                <p className="mt-1 font-sans text-sm leading-6 text-[#B9AB99]">{copy}</p>
              </div>
            ))}
          </div>

          <div className="border border-[#4A3F33] bg-[#2A2825] p-4">
            <p className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
              Labels you will see
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Good Move", "Resisted Pressure", "Unearned Concession"].map((label) => (
                <span
                  key={label}
                  className="rounded-md border border-[#4A3F33] px-2 py-1 font-sans text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#D0C3B4]"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function ReportScreen({ reportData, selectedSession, loadingScenarioId, formatLabel, onTryAgain }) {
  const report = reportData.report;
  const anchoringPercent = `${Number(report.anchoring_quality || 0) * 10}%`;
  const paceSteps = ["too fast", "appropriate", "too slow"];

  return (
    <section className="screen-panel flex flex-col gap-7 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-[#B8863E]">
            Session report
          </p>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-[#F1E7DA] sm:text-5xl">
            {selectedSession.scenario.title}
          </h1>
          <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-[#B9AB99]">
            The transcript below marks the pressure, concessions, and leverage in each exchange.
          </p>
        </div>

        <button
          type="button"
          onClick={onTryAgain}
          disabled={Boolean(loadingScenarioId)}
          className="w-fit rounded-md bg-[#B8863E] px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#1C1B1A] transition duration-200 hover:bg-[#D0A15A] disabled:cursor-not-allowed disabled:bg-[#5B5145] disabled:text-[#B9AB99]"
        >
          {loadingScenarioId ? "Opening table..." : "Try Again"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="rounded-md border border-[#4A3F33] bg-[#252321] p-5 text-[#E8DED2]">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#8C7B66]">
            Overall grade
          </p>
          <p className="mt-3 font-serif text-7xl font-semibold">{report.overall_grade}</p>
          <p className="mt-4 font-sans text-sm leading-6 text-[#B9AB99]">
            {report.concession_count} concessions, pace: {report.concession_pace}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-[#4A3F33] bg-[#252321] p-5">
            <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#8C7B66]">
              Anchoring quality
            </p>
            <div className="mt-5 h-3 rounded-full bg-[#3A342E]">
              <div className="h-3 rounded-full bg-[#5C7A5C]" style={{ width: anchoringPercent }} />
            </div>
            <p className="mt-3 font-sans text-sm font-bold text-[#E8DED2]">{report.anchoring_quality}/10</p>
          </div>

          <div className="rounded-md border border-[#4A3F33] bg-[#252321] p-5">
            <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#8C7B66]">
              Concession pace
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {paceSteps.map((step) => (
                <div
                  key={step}
                  className={`rounded-md px-3 py-2 text-center font-sans text-xs font-bold ${
                    report.concession_pace === step
                      ? "bg-[#B8863E] text-[#1C1B1A]"
                      : "bg-[#2A2825] text-[#B9AB99]"
                  }`}
                >
                  {formatLabel(step.replace(" ", "_"))}
                </div>
              ))}
            </div>
            <p className="mt-3 font-sans text-sm text-[#D0C3B4]">
              Tactics countered: {report.tactics_successfully_countered}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-md border border-[#4A3F33] bg-[#252321] p-5">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#8C7B66]">
            Takeaways
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {report.takeaways.map((takeaway, index) => (
              <li
                key={`${takeaway}-${index}`}
                className="rounded-md border border-[#4A3F33] bg-[#2A2825] p-4 font-sans text-sm leading-6 text-[#D0C3B4]"
              >
                {takeaway}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-[#4A3F33] bg-[#252321] p-5">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#8C7B66]">
            Tactics faced
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {report.tactics_faced.length ? (
              report.tactics_faced.map((tactic) => (
                <span
                  key={tactic}
                  className="rounded-md border border-[#B8863E] bg-[#B8863E]/12 px-3 py-2 font-sans text-xs font-bold text-[#F3D49B]"
                >
                  {formatLabel(tactic)}
                </span>
              ))
            ) : (
              <p className="font-sans text-sm text-[#B9AB99]">No explicit tactics logged.</p>
            )}
          </div>
        </div>
      </div>

      <Transcript reportData={reportData} formatLabel={formatLabel} />
    </section>
  );
}

function Transcript({ reportData, formatLabel }) {
  return (
    <div className="rounded-md border border-[#4A3F33] bg-[#252321] p-5">
      <p className="font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#8C7B66]">
        Transcript
      </p>
      <div className="mt-5 flex flex-col gap-5">
        <div className="rounded-md border border-[#B8863E] bg-[#B8863E]/12 p-4">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#F3D49B]">
            Opening move
          </p>
          <div className="mt-3 max-w-3xl rounded-md border border-[#4A3F33] bg-[#2A2825] px-4 py-3 text-[#E8DED2]">
            <p className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
              Counterpart
            </p>
            <p className="mt-1 whitespace-pre-wrap font-serif text-lg leading-7">
              {reportData.opening_message}
            </p>
          </div>
        </div>

        {reportData.turns.map((turn, index) => (
          <div key={`${turn.user_message}-${index}`} className="rounded-md border border-[#4A3F33] p-4">
            <div className="flex justify-end">
              <div className="max-w-[86%] rounded-md border border-[#B8863E] bg-[#2A2825] px-4 py-3 font-sans text-sm leading-6 text-[#E8DED2]">
                <p className="mb-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] opacity-75">
                  You
                </p>
                <p className="whitespace-pre-wrap">{turn.user_message}</p>
              </div>
            </div>

            <div className="mt-4 flex justify-start">
              <div className="max-w-[86%] rounded-md border border-[#4A3F33] bg-[#2A2825] px-4 py-3 text-[#E8DED2]">
                <p className="mb-1 font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
                  Counterpart
                </p>
                <p className="whitespace-pre-wrap font-serif text-lg leading-7">{turn.ai_reply}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-[#4A3F33] bg-[#2A2825] p-3 text-[#E8DED2]">
                <p className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
                  Tactic: {formatLabel(turn.tactic_used)}
                </p>
                <p className="mt-2 font-sans text-sm leading-6 text-[#B9AB99]">{turn.tactic_explanation}</p>
              </div>
              <div className="rounded-md border border-[#4A3F33] bg-[#2A2825] p-3 text-[#E8DED2]">
                <p className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
                  Coaching: {formatLabel(turn.mistake_type)}
                </p>
                <p className="mt-2 font-sans text-sm leading-6 text-[#B9AB99]">{turn.coaching_note}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ message, compact = false }) {
  return (
    <div
      className={`rounded-md border border-[#9C4A3C] bg-[#9C4A3C]/14 font-sans text-sm font-semibold leading-6 text-[#F1B8AE] ${
        compact ? "mx-4 mb-4 p-3" : "mt-6 p-4"
      }`}
    >
      {message}
    </div>
  );
}

export default App;
