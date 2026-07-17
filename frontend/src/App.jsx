import { useEffect, useRef, useState } from "react";

function App() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [latestCoaching, setLatestCoaching] = useState(null);
  const [sessionReport, setSessionReport] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [responseText, setResponseText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [loadingScenarioId, setLoadingScenarioId] = useState("");
  const [error, setError] = useState("");
  const latestMessageRef = useRef(null);

  useEffect(() => {
    async function loadScenarios() {
      try {
        const response = await fetch("/api/scenarios");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Could not load scenarios.");
        }

        setScenarios(data.scenarios || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load scenarios.");
      }
    }

    loadScenarios();
  }, []);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function testGroqConnection() {
    setIsLoading(true);
    setError("");
    setResponseText("");

    try {
      const response = await fetch("/api/ping-gpt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || "Groq connection test failed.");
      }

      setResponseText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  async function startSession(scenarioId) {
    setLoadingScenarioId(scenarioId);
    setError("");
    setResponseText("");
    setSessionReport(null);

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
        throw new Error(data.detail || "Could not start the scenario.");
      }

      setSelectedSession(data);
      setMessages([
        {
          role: "assistant",
          content: data.opening_message,
        },
      ]);
      setLatestCoaching(null);
      setDraftMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoadingScenarioId("");
    }
  }

  function resetSession() {
    setSelectedSession(null);
    setMessages([]);
    setLatestCoaching(null);
    setSessionReport(null);
    setDraftMessage("");
    setError("");
  }

  function formatLabel(value) {
    return value
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  async function sendMessage(event) {
    event.preventDefault();

    const trimmedMessage = draftMessage.trim();

    if (!trimmedMessage || isSending || !selectedSession) {
      return;
    }

    setIsSending(true);
    setError("");
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
          session_id: selectedSession.session_id,
          message: trimmedMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not send message.");
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
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "system",
          content: "Message failed. Your session may have expired; try starting again.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function endSession() {
    if (!selectedSession || isEnding) {
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
          session_id: selectedSession.session_id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not generate report.");
      }

      setSessionReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsEnding(false);
    }
  }

  function tryAgain() {
    if (!selectedSession) {
      return;
    }

    startSession(selectedSession.scenario.id);
  }

  if (sessionReport && selectedSession) {
    const report = sessionReport.report;
    const anchoringPercent = `${Number(report.anchoring_quality || 0) * 10}%`;
    const paceSteps = ["too fast", "appropriate", "too slow"];

    return (
      <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
        <section className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Session report
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {selectedSession.scenario.title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
                Review your negotiation performance, the tactics you faced, and the moments to improve.
              </p>
            </div>

            <button
              type="button"
              onClick={tryAgain}
              disabled={Boolean(loadingScenarioId)}
              className="w-fit rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loadingScenarioId ? "Starting..." : "Try Again"}
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Overall grade
              </p>
              <p className="mt-3 text-7xl font-bold tracking-tight text-white">
                {report.overall_grade}
              </p>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                {report.concession_count} concessions, pace: {report.concession_pace}
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Anchoring quality
                </p>
                <div className="mt-5 h-3 rounded-full bg-zinc-800">
                  <div
                    className="h-3 rounded-full bg-emerald-400"
                    style={{ width: anchoringPercent }}
                  />
                </div>
                <p className="mt-3 text-sm font-semibold text-zinc-200">
                  {report.anchoring_quality}/10
                </p>
              </div>

              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Concession pace
                </p>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {paceSteps.map((step) => (
                    <div
                      key={step}
                      className={`rounded-md px-3 py-2 text-center text-xs font-semibold ${
                        report.concession_pace === step
                          ? "bg-emerald-400 text-zinc-950"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {formatLabel(step.replace(" ", "_"))}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm text-zinc-300">
                  Tactics countered: {report.tactics_successfully_countered}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Takeaways
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {report.takeaways.map((takeaway, index) => (
                  <li
                    key={`${takeaway}-${index}`}
                    className="rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-200"
                  >
                    {takeaway}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Tactics faced
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {report.tactics_faced.length ? (
                  report.tactics_faced.map((tactic) => (
                    <span
                      key={tactic}
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-emerald-200"
                    >
                      {formatLabel(tactic)}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-zinc-400">No explicit tactics logged.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Transcript
            </p>
            <div className="mt-5 flex flex-col gap-5">
              <div className="rounded-md border border-emerald-500/30 bg-emerald-950/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                  Opening move
                </p>
                <div className="mt-3 flex justify-start">
                  <div className="max-w-[82%] rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-100">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Counterpart
                    </p>
                    <p className="whitespace-pre-wrap">
                      {sessionReport.opening_message}
                    </p>
                  </div>
                </div>
              </div>

              {sessionReport.turns.map((turn, index) => (
                <div
                  key={`${turn.user_message}-${index}`}
                  className="rounded-md border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex justify-end">
                    <div className="max-w-[82%] rounded-md bg-emerald-400 px-4 py-3 text-sm leading-6 text-zinc-950">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] opacity-70">
                        You
                      </p>
                      <p className="whitespace-pre-wrap">{turn.user_message}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-start">
                    <div className="max-w-[82%] rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-100">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Counterpart
                      </p>
                      <p className="whitespace-pre-wrap">{turn.ai_reply}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Tactic: {formatLabel(turn.tactic_used)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">
                        {turn.tactic_explanation}
                      </p>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Coaching: {formatLabel(turn.mistake_type)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">
                        {turn.coaching_note}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (selectedSession) {
    const isGoodMove = latestCoaching?.mistakeType === "good_move";
    const isResistedPressure = latestCoaching?.mistakeType === "resisted_pressure";
    const hasMistake =
      latestCoaching &&
      latestCoaching.mistakeType !== "none" &&
      latestCoaching.mistakeType !== "good_move" &&
      latestCoaching.mistakeType !== "resisted_pressure";

    return (
      <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
        <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={resetSession}
              className="w-fit rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-emerald-300 hover:text-emerald-200"
            >
              Back to scenarios
            </button>
            <button
              type="button"
              onClick={endSession}
              disabled={isEnding || isSending || messages.length < 2}
              className="w-fit rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {isEnding ? "Generating..." : "End Negotiation"}
            </button>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Session {selectedSession.session_id}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {selectedSession.scenario.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
              {selectedSession.scenario.context}
            </p>
          </div>

          <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-h-0 flex-col rounded-md border border-zinc-800 bg-zinc-900">
              <div className="flex max-h-[56vh] min-h-80 flex-col gap-4 overflow-y-auto p-5">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const isSystem = message.role === "system";

                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      ref={index === messages.length - 1 ? latestMessageRef : null}
                    >
                      <div
                        className={`max-w-[82%] rounded-md px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[70%] ${
                          isUser
                            ? "bg-emerald-400 text-zinc-950"
                            : isSystem
                              ? "border border-red-500/40 bg-red-950/40 text-red-100"
                              : "border border-zinc-700 bg-zinc-950 text-zinc-100"
                        }`}
                      >
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] opacity-70">
                          {isUser ? "You" : isSystem ? "System" : "Counterpart"}
                        </p>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </div>
                  );
                })}

                {isSending ? (
                  <div className="flex justify-start" ref={latestMessageRef}>
                    <div className="rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                      Counterpart is thinking...
                    </div>
                  </div>
                ) : null}
              </div>

              {error ? (
                <pre className="mx-5 mb-4 overflow-auto rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
                  {error}
                </pre>
              ) : null}

              <form
                onSubmit={sendMessage}
                className="flex flex-col gap-3 border-t border-zinc-800 p-4 sm:flex-row"
              >
                <label className="sr-only" htmlFor="negotiation-message">
                  Your negotiation message
                </label>
                <textarea
                  id="negotiation-message"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  disabled={isSending}
                  rows={2}
                  placeholder="Type your reply..."
                  className="min-h-12 flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={isSending || !draftMessage.trim()}
                  className="rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </form>
            </div>

            <aside className="rounded-md border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Live coaching
              </p>

              {latestCoaching ? (
                <div className="mt-5 flex flex-col gap-4">
                  <div
                    className="rounded-md border border-zinc-700 bg-zinc-950 p-4"
                    title={latestCoaching.tacticExplanation}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      AI tactic
                    </p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {formatLabel(latestCoaching.tacticUsed)}
                    </p>
                    <details className="mt-3 text-sm leading-6 text-zinc-300">
                      <summary className="cursor-pointer text-emerald-300">
                        Explanation
                      </summary>
                      <p className="mt-2">{latestCoaching.tacticExplanation}</p>
                    </details>
                  </div>

                  <div
                    className={`rounded-md border p-4 ${
                      isGoodMove
                        ? "border-emerald-500/50 bg-emerald-950/30"
                        : isResistedPressure
                          ? "border-sky-500/50 bg-sky-950/30"
                        : hasMistake
                          ? "border-amber-500/50 bg-amber-950/30"
                          : "border-zinc-700 bg-zinc-950"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Your move
                    </p>
                    <p
                      className={`mt-2 text-sm font-semibold ${
                        isGoodMove
                          ? "text-emerald-200"
                          : isResistedPressure
                            ? "text-sky-200"
                          : hasMistake
                            ? "text-amber-200"
                            : "text-zinc-200"
                      }`}
                    >
                      {formatLabel(latestCoaching.mistakeType)}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-zinc-200">
                      {latestCoaching.coachingNote}
                    </p>
                  </div>

                  {latestCoaching.usedFallback ? (
                    <p className="rounded-md border border-amber-500/40 bg-amber-950/30 p-3 text-sm leading-6 text-amber-100">
                      Coaching metadata used a fallback because the model response was not valid JSON.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 text-sm leading-6 text-zinc-400">
                  Send your first reply to see the tactic used and coaching on your move.
                </p>
              )}
            </aside>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Counterpart
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Choose your negotiation sparring match
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
            Pick a scenario and Counterpart will generate an in-character opening move from a resistant counterpart.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => startSession(scenario.id)}
              disabled={Boolean(loadingScenarioId)}
              className="rounded-md border border-zinc-800 bg-zinc-900 p-5 text-left transition hover:border-emerald-300 hover:bg-zinc-900/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-lg font-semibold text-white">
                {scenario.title}
              </span>
              <span className="mt-3 block text-sm leading-6 text-zinc-300">
                {scenario.context}
              </span>
              <span className="mt-5 block text-sm font-semibold text-emerald-300">
                {loadingScenarioId === scenario.id ? "Starting..." : "Start scenario"}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-zinc-800 pt-6">
          <button
            type="button"
            onClick={testGroqConnection}
            disabled={isLoading}
            className="w-fit rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isLoading ? "Testing..." : "Test Groq Connection"}
          </button>
        </div>

        {error ? (
          <pre className="overflow-auto rounded-md border border-red-500/40 bg-red-950/40 p-4 text-sm leading-6 text-red-100">
            {error}
          </pre>
        ) : null}

        {responseText ? (
          <pre className="min-h-64 overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-4 text-sm leading-6 text-zinc-100">
            {responseText}
          </pre>
        ) : null}
      </section>
    </main>
  );
}

export default App;
