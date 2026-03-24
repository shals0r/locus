const TOKEN_KEY = "locus_token";

/**
 * Fetch wrapper that attaches JWT Authorization header.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, {
    ...options,
    headers,
  });
}

/**
 * Build a WebSocket URL with token as query parameter.
 */
export function getWsUrl(path: string): string {
  const token = localStorage.getItem(TOKEN_KEY);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const url = `${protocol}//${host}${path}`;

  if (token) {
    return `${url}?token=${encodeURIComponent(token)}`;
  }

  return url;
}
