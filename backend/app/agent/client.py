"""Agent HTTP+WebSocket client for communicating with Locus host agents.

Wraps all agent REST endpoints (health, terminal, tmux, claude sessions)
and provides WebSocket URL builders for terminal and log streaming.
"""

from __future__ import annotations

import logging
from urllib.parse import urlencode, urlparse

import httpx

logger = logging.getLogger(__name__)


class AgentClient:
    """Client for communicating with a Locus host agent via REST and WebSocket.

    Usage::

        async with AgentClient("http://192.168.1.10:7700", token="abc") as client:
            health = await client.health()
            session = await client.create_terminal(cols=120, rows=40)
            ws_url = client.terminal_ws_url(session["session_id"])
    """

    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )

    # -- REST endpoints --

    async def health(self) -> dict:
        """GET /health -- agent health check."""
        resp = await self._http.get("/health")
        resp.raise_for_status()
        return resp.json()

    async def create_terminal(
        self,
        cols: int = 120,
        rows: int = 40,
        working_dir: str | None = None,
        tmux_session: str | None = None,
    ) -> dict:
        """POST /terminal -- create a new terminal session on the agent."""
        body: dict = {"cols": cols, "rows": rows}
        if working_dir is not None:
            body["working_dir"] = working_dir
        if tmux_session is not None:
            body["tmux_session"] = tmux_session
        resp = await self._http.post("/terminal", json=body)
        resp.raise_for_status()
        return resp.json()

    async def close_terminal(self, session_id: str) -> None:
        """DELETE /terminal/{session_id} -- close a terminal session."""
        resp = await self._http.delete(f"/terminal/{session_id}")
        resp.raise_for_status()

    async def list_terminals(self) -> list[dict]:
        """GET /terminal -- list active terminal sessions."""
        resp = await self._http.get("/terminal")
        resp.raise_for_status()
        data = resp.json()
        return data.get("sessions", [])

    async def list_tmux_sessions(self) -> list[dict]:
        """GET /tmux/sessions -- list tmux sessions on the agent host."""
        resp = await self._http.get("/tmux/sessions")
        resp.raise_for_status()
        data = resp.json()
        return data.get("sessions", [])

    async def create_tmux_session(
        self,
        name: str | None = None,
        working_dir: str | None = None,
    ) -> dict:
        """POST /tmux/sessions -- create a new tmux session."""
        body: dict = {}
        if name is not None:
            body["name"] = name
        if working_dir is not None:
            body["working_dir"] = working_dir
        resp = await self._http.post("/tmux/sessions", json=body)
        resp.raise_for_status()
        return resp.json()

    async def kill_tmux_session(self, name: str) -> bool:
        """DELETE /tmux/sessions/{name} -- kill a tmux session."""
        resp = await self._http.delete(f"/tmux/sessions/{name}")
        resp.raise_for_status()
        return True

    async def detect_claude_sessions(self) -> list[dict]:
        """GET /claude/sessions -- detect running Claude Code sessions."""
        resp = await self._http.get("/claude/sessions")
        resp.raise_for_status()
        data = resp.json()
        return data.get("sessions", [])

    async def run_command(self, command: str) -> str:
        """POST /exec -- run a command on the agent host.

        Backward-compatible with run_command_on_machine pattern.
        """
        resp = await self._http.post("/exec", json={"command": command})
        resp.raise_for_status()
        return resp.json().get("stdout", "")

    # -- File operations --

    async def read_file(self, path: str) -> dict:
        """GET /files/read -- read file content from the agent host."""
        resp = await self._http.get("/files/read", params={"path": path})
        resp.raise_for_status()
        return resp.json()

    async def write_file(self, path: str, content: str, encoding: str = "utf-8") -> dict:
        """POST /files/write -- write file content on the agent host."""
        resp = await self._http.post("/files/write", json={
            "path": path, "content": content, "encoding": encoding,
        })
        resp.raise_for_status()
        return resp.json()

    async def list_directory(self, path: str, recursive: bool = False) -> dict:
        """GET /files/list -- list directory entries on the agent host."""
        resp = await self._http.get("/files/list", params={
            "path": path, "recursive": recursive,
        })
        resp.raise_for_status()
        return resp.json()

    async def stat_file(self, path: str) -> dict:
        """GET /files/stat -- stat a file on the agent host."""
        resp = await self._http.get("/files/stat", params={"path": path})
        resp.raise_for_status()
        return resp.json()

    # -- Git operations --

    async def git_status(self, repo_path: str) -> dict:
        """GET /git/status -- repository status from the agent host."""
        resp = await self._http.get("/git/status", params={"repo_path": repo_path})
        resp.raise_for_status()
        return resp.json()

    async def git_branches(self, repo_path: str) -> dict:
        """GET /git/branches -- list branches from the agent host."""
        resp = await self._http.get("/git/branches", params={"repo_path": repo_path})
        resp.raise_for_status()
        return resp.json()

    async def git_log(self, repo_path: str, count: int = 20) -> dict:
        """GET /git/log -- commit log from the agent host."""
        resp = await self._http.get("/git/log", params={
            "repo_path": repo_path, "count": count,
        })
        resp.raise_for_status()
        return resp.json()

    async def git_diff(self, repo_path: str, ref: str | None = None, cached: bool = False) -> dict:
        """GET /git/diff -- diff from the agent host."""
        params: dict = {"repo_path": repo_path, "cached": cached}
        if ref:
            params["ref"] = ref
        resp = await self._http.get("/git/diff", params=params)
        resp.raise_for_status()
        return resp.json()

    async def git_exec(self, repo_path: str, args: list[str]) -> dict:
        """POST /git/exec -- run arbitrary git command on the agent host."""
        resp = await self._http.post("/git/exec", json={
            "repo_path": repo_path, "args": args,
        })
        resp.raise_for_status()
        return resp.json()

    # -- WebSocket URL builders --

    def terminal_ws_url(self, session_id: str) -> str:
        """Build WebSocket URL for terminal I/O streaming."""
        ws_base = self._http_to_ws(self.base_url)
        params = urlencode({"token": self.token})
        return f"{ws_base}/ws/terminal/{session_id}?{params}"

    def logs_ws_url(self) -> str:
        """Build WebSocket URL for agent log streaming."""
        ws_base = self._http_to_ws(self.base_url)
        params = urlencode({"token": self.token})
        return f"{ws_base}/ws/logs?{params}"

    # -- Lifecycle --

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._http.aclose()

    async def __aenter__(self) -> AgentClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    # -- Helpers --

    @staticmethod
    def _http_to_ws(url: str) -> str:
        """Convert http(s):// URL to ws(s):// URL."""
        parsed = urlparse(url)
        if parsed.scheme == "https":
            ws_scheme = "wss"
        else:
            ws_scheme = "ws"
        return f"{ws_scheme}://{parsed.netloc}"
