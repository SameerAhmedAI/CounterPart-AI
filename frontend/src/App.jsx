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

const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
const EMPTY_CUSTOM_SCENARIO = {
  title: "",
  context: "",
  persona_name: "",
  persona_role: "",
  personality_traits: "",
  batna: "",
  opening_move_hint: "",
};

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

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
  const [deletingScenarioId, setDeletingScenarioId] = useState("");
  const [isCustomFormOpen, setIsCustomFormOpen] = useState(false);
  const [isSavingCustom, setIsSavingCustom] = useState(false);
  const [customForm, setCustomForm] = useState({ ...EMPTY_CUSTOM_SCENARIO });
  const [customError, setCustomError] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function loadScenarios() {
    try {
      const response = await fetch(apiUrl("/api/scenarios"));
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Scenario table unavailable.");
      }

      setScenarios(data.scenarios || []);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Scenario table unavailable. ${err.message} Check that the backend is running.`
          : "Scenario table unavailable. Check that the backend is running.",
      );
    }
  }

  useEffect(() => {
    loadScenarios();
  }, []);

  async function startSession(scenarioId) {
    setLoadingScenarioId(scenarioId);
    setError("");

    try {
      const response = await fetch(apiUrl("/api/start-session"), {
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

  async function createCustomScenario(event) {
    event.preventDefault();

    if (isSavingCustom) {
      return;
    }

    setIsSavingCustom(true);
    setCustomError("");

    try {
      const response = await fetch(apiUrl("/api/custom-scenarios"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customForm),
      });
      const data = await response.json();

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(" ")
          : data.detail;
        throw new Error(detail || "Custom scenario could not be saved.");
      }

      await loadScenarios();
      setCustomForm({ ...EMPTY_CUSTOM_SCENARIO });
      setIsCustomFormOpen(false);
    } catch (err) {
      setCustomError(
        err instanceof Error
          ? `Custom scenario could not be saved. ${err.message}`
          : "Custom scenario could not be saved. Check the fields and try again.",
      );
    } finally {
      setIsSavingCustom(false);
    }
  }

  async function deleteCustomScenario(scenarioId) {
    if (!scenarioId || deletingScenarioId) {
      return;
    }

    setDeletingScenarioId(scenarioId);
    setError("");

    try {
      const response = await fetch(
        apiUrl(`/api/custom-scenarios/${encodeURIComponent(scenarioId)}`),
        { method: "DELETE" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Custom scenario could not be deleted.");
      }

      await loadScenarios();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Custom scenario could not be deleted. ${err.message}`
          : "Custom scenario could not be deleted. Check the backend and try again.",
      );
    } finally {
      setDeletingScenarioId("");
    }
  }

  return (
    <ScenarioScreen
      scenarios={scenarios}
      loadingScenarioId={loadingScenarioId}
      deletingScenarioId={deletingScenarioId}
      isCustomFormOpen={isCustomFormOpen}
      isSavingCustom={isSavingCustom}
      customForm={customForm}
      customError={customError}
      error={error}
      onStartSession={startSession}
      onOpenCustomForm={() => {
        setCustomError("");
        setIsCustomFormOpen(true);
      }}
      onCloseCustomForm={() => {
        if (!isSavingCustom) {
          setCustomError("");
          setIsCustomFormOpen(false);
        }
      }}
      onCustomFormChange={(field, value) =>
        setCustomForm((current) => ({ ...current, [field]: value }))
      }
      onCreateCustomScenario={createCustomScenario}
      onDeleteCustomScenario={deleteCustomScenario}
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
  const [scenarios, setScenarios] = useState([]);
  const [isScenarioMenuOpen, setIsScenarioMenuOpen] = useState(false);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true);
  const [switchingScenarioId, setSwitchingScenarioId] = useState("");
  const [scenarioMenuError, setScenarioMenuError] = useState("");
  const [error, setError] = useState("");
  const [inputError, setInputError] = useState("");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const latestMessageRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadSession() {
      setIsLoadingSession(true);
      setError("");
      setInputError("");
      setDraftMessage("");
      setLatestCoaching(null);
      setIsScenarioMenuOpen(false);
      setScenarioMenuError("");

      if (routedSession) {
        setSelectedSession(getSessionState(routedSession, sessionId));
        setMessages([
          {
            role: "assistant",
            content: routedSession.opening_message,
          },
        ]);
      } else {
        setSelectedSession(null);
        setMessages([]);
      }

      try {
        const response = await fetch(apiUrl(`/api/sessions/${sessionId}`));
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
    let isCurrent = true;

    async function loadScenarios() {
      setIsLoadingScenarios(true);

      try {
        const response = await fetch(apiUrl("/api/scenarios"));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Scenario table unavailable.");
        }

        if (isCurrent) {
          setScenarios(data.scenarios || []);
          setScenarioMenuError("");
        }
      } catch (err) {
        if (isCurrent) {
          setScenarioMenuError(
            err instanceof Error
              ? `Scenario list unavailable. ${err.message}`
              : "Scenario list unavailable. Check that the backend is running.",
          );
        }
      } finally {
        if (isCurrent) {
          setIsLoadingScenarios(false);
        }
      }
    }

    loadScenarios();

    return () => {
      isCurrent = false;
    };
  }, []);

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
      const response = await fetch(apiUrl("/api/negotiate"), {
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
      const response = await fetch(apiUrl("/api/end-session"), {
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

  async function switchScenario(scenarioId) {
    if (!scenarioId || switchingScenarioId || isSending || isEnding) {
      return;
    }

    setSwitchingScenarioId(scenarioId);
    setScenarioMenuError("");

    try {
      const response = await fetch(apiUrl("/api/start-session"), {
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

      setSelectedSession(getSessionState(data, data.session_id));
      setMessages([
        {
          role: "assistant",
          content: data.opening_message,
        },
      ]);
      setLatestCoaching(null);
      setDraftMessage("");
      setInputError("");
      setError("");
      setIsScenarioMenuOpen(false);

      navigate(`/negotiate/${data.session_id}`, {
        state: {
          session: data,
        },
      });
    } catch (err) {
      setScenarioMenuError(
        err instanceof Error
          ? `Scenario could not be switched. ${err.message}`
          : "Scenario could not be switched. Check that the backend is running.",
      );
    } finally {
      setSwitchingScenarioId("");
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
      scenarios={scenarios}
      isScenarioMenuOpen={isScenarioMenuOpen}
      isLoadingScenarios={isLoadingScenarios}
      switchingScenarioId={switchingScenarioId}
      scenarioMenuError={scenarioMenuError}
      latestMessageRef={latestMessageRef}
      formatLabel={formatLabel}
      getCoachingStyle={getCoachingStyle}
      onToggleScenarioMenu={() => setIsScenarioMenuOpen((isOpen) => !isOpen)}
      onSwitchScenario={switchScenario}
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
          const response = await fetch(apiUrl("/api/end-session"), {
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
      const response = await fetch(apiUrl("/api/start-session"), {
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
  const landingCardClass =
    "h-full border border-[#4A3F33] bg-[#252321] px-6 py-6 transition duration-200 hover:-translate-y-0.5 hover:border-[#B8863E] hover:bg-[#2B2825] hover:shadow-[0_14px_30px_rgba(0,0,0,0.18)]";

  return (
    <section className="screen-panel w-full">
      <div className="flex min-h-[calc(100svh-3rem)] w-full flex-col items-center justify-center pb-14 pt-10 sm:pb-16 sm:pt-14 xl:min-h-[calc(100vh-3rem)]">
        <div className="flex w-full max-w-6xl flex-col items-center text-center">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-[#B8863E]">
            Counterpart
          </p>
          <h1 className="mt-4 max-w-5xl font-serif text-5xl font-semibold leading-[0.95] text-[#F1E7DA] sm:text-6xl lg:text-7xl xl:text-8xl">
            Practice at the table before the stakes are real.
          </h1>
          <p className="mt-6 max-w-3xl font-sans text-base leading-8 text-[#D0C3B4] sm:text-lg">
            Counterpart puts you across from a resistant AI negotiator with a clear role, leverage, and walk-away point. Pick a scenario, make your case, then read the pressure, tactics, and concessions as they happen.
          </p>
          <button
            type="button"
            onClick={onStart}
            className="mt-8 w-fit rounded-md bg-[#B8863E] px-6 py-3 font-sans text-sm font-bold uppercase tracking-[0.12em] text-[#1C1B1A] transition duration-200 hover:bg-[#D0A15A] focus:outline-none focus:ring-2 focus:ring-[#E8DED2] focus:ring-offset-2 focus:ring-offset-[#1C1B1A]"
          >
            Start Practicing
          </button>
        </div>

      </div>

      <section className="mx-auto w-full max-w-6xl border-t border-[#B8863E]/45 py-14 sm:py-16">
        <aside className="flex flex-col items-center text-center text-[#E8DED2]">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.18em] text-[#B8863E]">
            Table read
          </p>
          <div className="mt-7 grid w-full max-w-5xl gap-5 sm:grid-cols-3">
            {[
              ["Anchor", "Open with a number and a reason."],
              ["Pressure", "Spot when the other side is testing resolve."],
              ["Trade", "Move only when value moves with you."],
            ].map(([title, copy]) => (
              <div key={title} className={`${landingCardClass} border-l-2 pl-4`}>
                <p className="font-serif text-2xl font-semibold">{title}</p>
                <p className="mt-1 font-sans text-sm leading-6 text-[#B9AB99]">{copy}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <LandingSection eyebrow="How it works" title="Train the full negotiation loop.">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            [
              "1. Pick your scenario",
              "Choose a realistic negotiation table with a counterpart who has incentives, constraints, and leverage.",
            ],
            [
              "2. Negotiate live",
              "Make your case in chat while the AI counterpart pushes back with role-specific pressure and tactics.",
            ],
            [
              "3. Get a scored transcript",
              "End the session to review your moves, concessions, tactics faced, and concrete takeaways.",
            ],
          ].map(([title, copy]) => (
            <article key={title} className={landingCardClass}>
              <p className="font-serif text-2xl font-semibold leading-tight text-[#F1E7DA]">{title}</p>
              <p className="mt-3 font-sans text-sm leading-6 text-[#B9AB99]">{copy}</p>
            </article>
          ))}
        </div>
      </LandingSection>

      <LandingSection eyebrow="Scenario preview" title="Practice against different kinds of pressure.">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Salary Negotiation",
              "Your manager has a budget ceiling they won't admit to.",
            ],
            [
              "Rent Negotiation",
              "Your landlord wants an increase while avoiding a vacancy.",
            ],
            [
              "Freelance Contract Pricing",
              "A client values the work but keeps pushing the fee down.",
            ],
            [
              "Vendor Price Dispute",
              "A supplier defends a higher quote while you protect margin.",
            ],
          ].map(([title, copy]) => (
            <article key={title} className={landingCardClass}>
              <p className="font-serif text-2xl font-semibold leading-tight text-[#F1E7DA]">{title}</p>
              <p className="mt-3 font-sans text-sm leading-6 text-[#B9AB99]">{copy}</p>
            </article>
          ))}
        </div>
      </LandingSection>

      <footer className="mx-auto mt-14 grid w-full max-w-6xl gap-5 border-t border-[#B8863E]/45 py-8 text-center sm:grid-cols-3 sm:items-center sm:text-left">
        <Link
          to="/"
          className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-[#B8863E] transition duration-200 hover:text-[#D0A15A]"
        >
          Counterpart
        </Link>
        <p className="hidden">
          Practice the hard conversations before they happen. Counterpart © 2026
        </p>
        <p className="font-sans text-sm leading-6 text-[#B9AB99] sm:whitespace-nowrap sm:text-center">
          Practice the hard conversations before they happen.{" "}
          <Link to="/" className="transition duration-200 hover:text-[#D0A15A]">
            Counterpart
          </Link>{" "}
          © 2026
        </p>
        <a
          href="https://github.com/SameerAhmedAI/CounterPart-AI"
          target="_blank"
          rel="noreferrer"
          aria-label="Counterpart GitHub repository"
          className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#4A3F33] text-[#D0C3B4] transition duration-200 hover:border-[#B8863E] hover:text-[#F1E7DA] sm:mx-0 sm:ml-auto"
        >
          <GithubIcon />
        </a>
      </footer>
    </section>
  );
}

function LandingSection({ eyebrow, title, children }) {
  return (
    <section className="mx-auto w-full max-w-6xl border-t border-[#B8863E]/45 py-14 sm:py-16">
      <div className="mx-auto mb-7 max-w-3xl text-center">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-[#B8863E]">
          {eyebrow}
        </p>
        <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight text-[#F1E7DA] sm:text-4xl">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function GithubIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.71.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.98c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.16 10.16 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function ScenarioScreen({
  scenarios,
  loadingScenarioId,
  deletingScenarioId,
  isCustomFormOpen,
  isSavingCustom,
  customForm,
  customError,
  error,
  onStartSession,
  onOpenCustomForm,
  onCloseCustomForm,
  onCustomFormChange,
  onCreateCustomScenario,
  onDeleteCustomScenario,
}) {
  const customScenarioCount = scenarios.filter((scenario) => scenario.is_custom).length;
  const customLimitReached = customScenarioCount >= 3;

  return (
    <>
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
              <article
                key={scenario.id}
                className="group relative flex min-h-64 h-full flex-col rounded-md border border-[#4A3F33] bg-[#252321] text-center text-[#E8DED2] transition duration-200 hover:-translate-y-0.5 hover:border-[#B8863E]"
              >
                {scenario.is_custom ? (
                  <button
                    type="button"
                    onClick={() => onDeleteCustomScenario(scenario.id)}
                    disabled={Boolean(deletingScenarioId) || Boolean(loadingScenarioId)}
                    aria-label={`Delete ${scenario.title}`}
                    className="absolute right-3 top-3 z-10 rounded-md border border-[#4A3F33] bg-[#1C1B1A] px-2.5 py-1.5 font-sans text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[#B9AB99] transition duration-200 hover:border-[#9C4A3C] hover:text-[#F1B8AE] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingScenarioId === scenario.id ? "Deleting..." : "Delete"}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => onStartSession(scenario.id)}
                  disabled={Boolean(loadingScenarioId) || Boolean(deletingScenarioId)}
                  className="flex h-full min-h-64 w-full flex-col items-center justify-between rounded-md px-7 py-7 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex flex-1 flex-col items-center justify-center">
                    {scenario.is_custom ? (
                      <span className="mb-3 font-sans text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#B8863E]">
                        Custom scenario
                      </span>
                    ) : null}
                    <span className="font-serif text-2xl font-semibold leading-tight">
                      {scenario.title}
                    </span>
                    <span className="mt-4 block max-w-sm font-sans text-sm leading-6 text-[#B9AB99]">
                      {scenario.context}
                    </span>
                  </span>
                  <span className="mt-5 block font-sans text-xs font-bold uppercase tracking-[0.16em] text-[#B8863E]">
                    {loadingScenarioId === scenario.id ? "Opening table..." : "Start scenario"}
                  </span>
                </button>
              </article>
            ))}

            <button
              type="button"
              onClick={onOpenCustomForm}
              disabled={customLimitReached || Boolean(loadingScenarioId) || Boolean(deletingScenarioId)}
              className="group flex min-h-64 h-full flex-col items-center justify-center rounded-md border border-dashed border-[#B8863E]/75 bg-[#1F1D1B] px-7 py-7 text-center text-[#E8DED2] transition duration-200 hover:-translate-y-0.5 hover:border-[#D0A15A] hover:bg-[#252321] active:translate-y-0 disabled:cursor-not-allowed disabled:border-[#4A3F33] disabled:bg-[#1F1D1B] disabled:opacity-60"
            >
              <span className="font-serif text-3xl font-semibold leading-tight text-[#F1E7DA]">
                {customLimitReached ? "Custom limit reached" : "+ Add Custom Scenario"}
              </span>
              <span className="mt-4 max-w-sm font-sans text-sm leading-6 text-[#B9AB99]">
                {customLimitReached
                  ? "Three custom scenarios saved. Delete one to open another slot."
                  : "Define the counterpart, their leverage, and their opening move."}
              </span>
              <span className="mt-5 font-sans text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#B8863E]">
                {customScenarioCount} of 3 saved
              </span>
            </button>
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}
      </section>

      {isCustomFormOpen ? (
        <CustomScenarioModal
          values={customForm}
          error={customError}
          isSaving={isSavingCustom}
          onChange={onCustomFormChange}
          onClose={onCloseCustomForm}
          onSubmit={onCreateCustomScenario}
        />
      ) : null}
    </>
  );
}

function CustomScenarioModal({ values, error, isSaving, onChange, onClose, onSubmit }) {
  const fieldClass =
    "mt-2 w-full rounded-md border border-[#4A3F33] bg-[#1C1B1A] px-3 py-2.5 font-sans text-sm text-[#E8DED2] outline-none transition duration-200 placeholder:text-[#6F6255] focus:border-[#B8863E]";
  const labelClass =
    "font-sans text-[0.68rem] font-bold uppercase tracking-[0.13em] text-[#B9AB99]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#11100F]/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-scenario-title"
    >
      <div className="themed-scrollbar max-h-[calc(100svh-2rem)] w-full max-w-3xl overflow-y-auto rounded-md border border-[#4A3F33] bg-[#252321] p-5 shadow-2xl shadow-black/40 sm:p-7">
        <div className="flex items-start justify-between gap-5 border-b border-[#4A3F33] pb-4">
          <div>
            <p className="font-sans text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[#B8863E]">
              Custom table
            </p>
            <h2 id="custom-scenario-title" className="mt-2 font-serif text-3xl font-semibold text-[#F1E7DA]">
              Build a counterpart.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-md border border-[#4A3F33] px-3 py-2 font-sans text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#B9AB99] transition duration-200 hover:border-[#B8863E] hover:text-[#F1E7DA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>
            Scenario title
            <input
              required
              maxLength={120}
              value={values.title}
              onChange={(event) => onChange("title", event.target.value)}
              className={fieldClass}
              placeholder="Partnership renewal"
            />
          </label>

          <label className={labelClass}>
            Persona name
            <input
              required
              maxLength={80}
              value={values.persona_name}
              onChange={(event) => onChange("persona_name", event.target.value)}
              className={fieldClass}
              placeholder="Jordan Lee"
            />
          </label>

          <label className={`${labelClass} sm:col-span-2`}>
            User-facing context
            <textarea
              required
              maxLength={1200}
              rows={3}
              value={values.context}
              onChange={(event) => onChange("context", event.target.value)}
              className={`${fieldClass} resize-y`}
              placeholder="Describe what the user is negotiating and what is at stake."
            />
          </label>

          <label className={labelClass}>
            Persona role
            <input
              required
              maxLength={160}
              value={values.persona_role}
              onChange={(event) => onChange("persona_role", event.target.value)}
              className={fieldClass}
              placeholder="Procurement director"
            />
          </label>

          <label className={labelClass}>
            Personality traits
            <textarea
              required
              maxLength={1000}
              rows={3}
              value={values.personality_traits}
              onChange={(event) => onChange("personality_traits", event.target.value)}
              className={`${fieldClass} resize-y`}
              placeholder="Analytical, patient, skeptical of unsupported claims"
            />
          </label>

          <label className={`${labelClass} sm:col-span-2`}>
            BATNA and walk-away point
            <textarea
              required
              maxLength={1500}
              rows={3}
              value={values.batna}
              onChange={(event) => onChange("batna", event.target.value)}
              className={`${fieldClass} resize-y`}
              placeholder="State the best alternative and the terms this counterpart will not cross."
            />
          </label>

          <label className={`${labelClass} sm:col-span-2`}>
            Opening move hint
            <textarea
              required
              maxLength={1200}
              rows={3}
              value={values.opening_move_hint}
              onChange={(event) => onChange("opening_move_hint", event.target.value)}
              className={`${fieldClass} resize-y`}
              placeholder="Describe the anchor, framing, or first demand they should make."
            />
          </label>

          {error ? (
            <div className="sm:col-span-2">
              <ErrorBanner message={error} compact />
            </div>
          ) : null}

          <div className="flex justify-end border-t border-[#4A3F33] pt-5 sm:col-span-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md border border-[#B8863E] bg-[#B8863E] px-5 py-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-[#1C1B1A] transition duration-200 hover:bg-[#D0A15A] disabled:cursor-not-allowed disabled:border-[#4A3F33] disabled:bg-[#3A342E] disabled:text-[#8C7B66]"
            >
              {isSaving ? "Saving scenario..." : "Save custom scenario"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  scenarios,
  isScenarioMenuOpen,
  isLoadingScenarios,
  switchingScenarioId,
  scenarioMenuError,
  latestMessageRef,
  formatLabel,
  getCoachingStyle,
  onToggleScenarioMenu,
  onSwitchScenario,
  onEndSession,
  onDraftChange,
  onInputKeyDown,
  onSend,
}) {
  const otherScenarios = scenarios.filter(
    (scenario) => scenario.id !== selectedSession.scenario.id,
  );

  return (
    <section className="screen-panel flex h-[calc(100svh-3rem)] min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 border-b border-[#4A3F33] pb-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="truncate font-serif text-2xl font-semibold text-[#F1E7DA]">
              {selectedSession.scenario.title}
            </h1>
            <p
              className="max-w-full truncate font-sans text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#B8863E]"
              title={selectedSession.session_id}
            >
              Session {selectedSession.session_id}
            </p>
          </div>
          <p
            className="mt-1 max-w-4xl truncate font-sans text-sm text-[#B9AB99]"
            title={selectedSession.scenario.context}
          >
            {selectedSession.scenario.context}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={onToggleScenarioMenu}
              disabled={isSending || isEnding || Boolean(switchingScenarioId)}
              aria-expanded={isScenarioMenuOpen}
              aria-haspopup="menu"
              className="h-10 rounded-md border border-[#4A3F33] bg-[#252321] px-4 font-sans text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#D0C3B4] transition duration-200 hover:border-[#B8863E] hover:text-[#F1E7DA] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {switchingScenarioId ? "Opening scenario..." : "Choose Another Scenario"}
            </button>

            {isScenarioMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-2 w-[min(23rem,calc(100vw-2.5rem))] rounded-md border border-[#4A3F33] bg-[#252321] p-2 shadow-2xl shadow-black/30"
              >
                <p className="px-3 py-2 font-sans text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[#8C7B66]">
                  Open a fresh table
                </p>

                {isLoadingScenarios ? (
                  <p className="px-3 py-3 font-sans text-sm text-[#B9AB99]">Loading scenarios...</p>
                ) : null}

                {!isLoadingScenarios && otherScenarios.length ? (
                  <div className="space-y-1">
                    {otherScenarios.map((scenario) => (
                      <button
                        key={scenario.id}
                        type="button"
                        role="menuitem"
                        onClick={() => onSwitchScenario(scenario.id)}
                        disabled={Boolean(switchingScenarioId)}
                        className="w-full rounded-md border border-transparent px-3 py-3 text-left transition duration-200 hover:border-[#B8863E] hover:bg-[#2A2825] disabled:cursor-wait disabled:opacity-50"
                      >
                        <span className="block font-serif text-lg font-semibold text-[#F1E7DA]">
                          {scenario.title}
                        </span>
                        <span className="mt-1 block truncate font-sans text-xs text-[#B9AB99]">
                          {scenario.context}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {scenarioMenuError ? (
                  <p className="m-2 rounded-md border border-[#9C4A3C] bg-[#9C4A3C]/15 p-3 font-sans text-xs leading-5 text-[#F1B8AE]">
                    {scenarioMenuError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onEndSession}
            disabled={isEnding || isSending || Boolean(switchingScenarioId) || messages.length < 2}
            className="h-10 rounded-md border border-[#B8863E] bg-[#B8863E] px-4 font-sans text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#1C1B1A] transition duration-200 hover:bg-[#D0A15A] active:translate-y-px disabled:cursor-not-allowed disabled:border-[#4A3F33] disabled:bg-[#3A342E] disabled:text-[#8C7B66]"
          >
            {isEnding ? "Preparing report..." : "End negotiation"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1.35fr)_minmax(10rem,0.75fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#4A3F33] bg-[#252321]">
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
    <aside className="themed-scrollbar min-h-0 overflow-y-auto rounded-md border border-[#4A3F33] bg-[#252321] p-5 text-[#E8DED2]">
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
