import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { apiPost } from "../../hooks/useApi";

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiPost<{ access_token: string; token_type: string }>(
        "/api/auth/login",
        { password },
      );
      setToken(data.access_token);
    } catch {
      setError("Incorrect password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-dominant">
      <div className="w-full max-w-sm" style={{ marginTop: "-64px" }}>
        <h1 className="mb-4 text-center text-lg font-semibold text-primary-text">
          Locus
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="h-9 rounded border border-border bg-secondary px-3 text-sm text-primary-text placeholder:text-muted focus:border-accent focus:outline-none"
          />

          {error && (
            <p className="text-sm text-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="h-9 rounded bg-accent text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log in to Locus"}
          </button>
        </form>
      </div>
    </div>
  );
}
