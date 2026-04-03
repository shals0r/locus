"""CLI commands for the Locus Agent: start, stop, status, logs."""

import atexit
import os
import secrets
import signal
import sys
import time

AGENT_DIR = os.path.expanduser("~/.locus-agent")
PID_FILE = os.path.join(AGENT_DIR, "agent.pid")
TOKEN_FILE = os.path.join(AGENT_DIR, "agent.token")
LOG_FILE = os.path.join(AGENT_DIR, "agent.log")


def ensure_agent_dir() -> None:
    """Create the agent directory with restricted permissions if it doesn't exist."""
    os.makedirs(AGENT_DIR, mode=0o700, exist_ok=True)


def ensure_token() -> str:
    """Read existing token or generate a new one with secure file permissions."""
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:
            token = f.read().strip()
        if token:
            return token

    token = secrets.token_urlsafe(32)
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, token.encode())
    finally:
        os.close(fd)
    return token


def write_pid() -> None:
    """Write the current process PID to the PID file."""
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))
    atexit.register(remove_pid)


def remove_pid() -> None:
    """Remove the PID file if it exists."""
    try:
        os.unlink(PID_FILE)
    except FileNotFoundError:
        pass


def read_pid() -> int | None:
    """Read PID from file and check if the process is running."""
    if not os.path.exists(PID_FILE):
        return None
    try:
        with open(PID_FILE) as f:
            pid = int(f.read().strip())
        os.kill(pid, 0)  # Check if process exists
        return pid
    except (ValueError, ProcessLookupError, PermissionError, FileNotFoundError, OSError):
        return None


def cmd_start(daemon: bool = False) -> None:
    """Start the Locus Agent."""
    existing_pid = read_pid()
    if existing_pid is not None:
        print(f"Agent already running (PID {existing_pid})")
        sys.exit(0)

    ensure_agent_dir()
    token = ensure_token()
    os.environ["LOCUS_AGENT_TOKEN"] = token

    if daemon:
        # Fork and detach on Unix
        if sys.platform != "win32":
            pid = os.fork()
            if pid > 0:
                print(f"Agent started in background (PID {pid})")
                return
            os.setsid()
            # Redirect stdout/stderr to log file
            log_fd = open(LOG_FILE, "a")
            os.dup2(log_fd.fileno(), sys.stdout.fileno())
            os.dup2(log_fd.fileno(), sys.stderr.fileno())
        else:
            import subprocess
            subprocess.Popen(
                [sys.executable, "-m", "locus_agent", "start"],
                creationflags=0x00000008,  # DETACHED_PROCESS
            )
            print("Agent started in background")
            return

    write_pid()

    # Reload settings to pick up the token from env
    from locus_agent.config import AgentSettings
    agent_settings = AgentSettings()

    print(f"Locus Agent v{_get_version()} starting on {agent_settings.host}:{agent_settings.port}")
    print(f"Token stored at {TOKEN_FILE}")

    import uvicorn
    from locus_agent.app import create_app

    app = create_app()
    uvicorn.run(
        app,
        host=agent_settings.host,
        port=agent_settings.port,
        log_level=agent_settings.log_level,
    )


def cmd_stop() -> None:
    """Stop the running Locus Agent."""
    pid = read_pid()
    if pid is None:
        print("Agent not running")
        return

    print(f"Stopping agent (PID {pid})...")
    try:
        if sys.platform == "win32":
            os.kill(pid, signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGTERM)

        # Wait up to 5 seconds for process to exit
        for _ in range(50):
            try:
                os.kill(pid, 0)
                time.sleep(0.1)
            except ProcessLookupError:
                break
        print("Agent stopped")
    except ProcessLookupError:
        print("Agent already stopped")
    finally:
        remove_pid()


def cmd_status() -> None:
    """Check agent status."""
    from locus_agent.config import AgentSettings
    agent_settings = AgentSettings()

    pid = read_pid()
    if pid is not None:
        print(f"Agent running (PID {pid}) on port {agent_settings.port}")
    else:
        print("Agent not running")


def cmd_logs() -> None:
    """Show recent agent logs."""
    if not os.path.exists(LOG_FILE):
        print("No logs found")
        return

    with open(LOG_FILE) as f:
        lines = f.readlines()
    for line in lines[-50:]:
        print(line, end="")


def _get_version() -> str:
    """Get the agent version."""
    from locus_agent import __version__
    return __version__
