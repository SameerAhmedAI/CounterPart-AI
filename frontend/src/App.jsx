import { useState } from "react";

function App() {
  const [responseText, setResponseText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <section className="mx-auto flex max-w-3xl flex-col gap-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Counterpart
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Groq connection test
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
            Run a simple backend call before building the negotiation sparring flow.
          </p>
        </div>

        <button
          type="button"
          onClick={testGroqConnection}
          disabled={isLoading}
          className="w-fit rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {isLoading ? "Testing..." : "Test Groq Connection"}
        </button>

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
