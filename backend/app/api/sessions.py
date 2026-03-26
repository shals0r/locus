"""Terminal session management API."""

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.local.manager import LOCAL_MACHINE_ID, local_machine_manager
from app.local.tmux import kill_tmux_session_local
from app.models.machine import Machine
from app.models.session import TerminalSession
from app.schemas.session import SessionCreate, SessionResponse
from app.services.auth import get_current_user
from app.services.machine_registry import is_local_machine, get_connection_for_machine
from app.ssh.manager import ssh_manager
from app.ssh.tmux import kill_tmux_session
from app.ws.terminal import close_session_process

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# ---------------------------------------------------------------------------
# ☠  Terminal death animation script (bash)
#
# Phases:
#   1. Glitch flicker (reverse-video flash)
#   2. Line-by-line skull reveal with colour gradient
#   3. "PROCESS TERMINATED" message flicker
#   4. Decay / dissolve effect
#
# The script is injected into a remote tmux pane via SSH.  A single-quoted
# heredoc delimiter ('LOCUS_DEATH') prevents the *outer* shell from
# expanding $variables — they are evaluated by the inner bash.
# ---------------------------------------------------------------------------

_DEATH_ANIMATION_SCRIPT = r"""
#!/usr/bin/env bash
# -- colours -----------------------------------------------------------------
RED='\033[1;31m'
DRED='\033[0;31m'
YLW='\033[1;33m'
WHT='\033[1;37m'
GRY='\033[0;90m'
RST='\033[0m'

# -- helper: move cursor to row,col -----------------------------------------
cup(){ printf '\033[%d;%dH' "$1" "$2"; }
hide_cursor(){ printf '\033[?25l'; }
show_cursor(){ printf '\033[?25h'; }

# -- screen size (passed in by the wrapper) ----------------------------------
COLS="${COLS:-80}"
ROWS="${ROWS:-24}"

# -- phase 1: glitch flicker ------------------------------------------------
printf '\033[2J\033[H'          # clear screen
for _ in 1 2 3; do
  printf '\033[?5h'; sleep 0.05 # reverse video on
  printf '\033[?5l'; sleep 0.08 # reverse video off
done
sleep 0.2

# -- skull art (raw, no escapes — colour applied per-region below) -----------
SKULL=(
"                 ░░░░░░░░░░░░░░░░"
"              ░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░"
"           ░░▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒░░"
"          ░░▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒░░"
"        ░▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒░"
"       ░▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░"
"      ░▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░"
"      ░▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░"
"      ░▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░"
"      ░▒▓▓▓▓▓████████▓▓▓▓▓▓▓▓████████▓▓▓▓▒░"
"     ░▒▓▓▓██████████████▓▓██████████████▓▓▒░"
"     ░▒▓▓██████████████▓▓▓██████████████▓▓▒░"
"     ░▒▓▓██████████████▓▓▓██████████████▓▓▒░"
"     ░▒▓▓▓██████████████▓▓██████████████▓▓▒░"
"     ░▒▓▓▓▓████████▓▓▓▓▓▓▓████████▓▓▓▓▓▒░"
"     ░▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░"
"      ░▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░"
"       ░▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒░"
"         ░▒▒▓▓█▓█▓█▓█▓█▓█▓█▓█▓█▓▓▒▒░"
"          ░░▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒░░"
"             ░░▒▒▒▓▓▓▓▓▓▓▓▓▒▒▒░░"
"               ░░░▒▒▒▒▒▒▒▒▒░░░"
"                   ░░░░░░░░░"
)

SKULL_HEIGHT=${#SKULL[@]}
START_ROW=$(( (ROWS - SKULL_HEIGHT - 4) / 2 ))
[ "$START_ROW" -lt 1 ] && START_ROW=1

hide_cursor

# -- phase 2: draw skull line-by-line (rising from the abyss) ---------------
for i in "${!SKULL[@]}"; do
  ROW=$((START_ROW + i))
  line="${SKULL[$i]}"
  # strip ANSI for length, centre it
  clean="${line}"
  len=${#clean}
  pad=$(( (COLS - len) / 2 ))
  [ "$pad" -lt 0 ] && pad=0
  cup "$ROW" 0
  printf "${DRED}%*s${RED}%s${RST}\n" "$pad" '' "$line"
  sleep 0.04
done

# -- phase 3: flash "PROCESS TERMINATED" ------------------------------------
MSG=">>> PROCESS TERMINATED <<<"
TAG="[ session killed ]"
MSG_ROW=$((START_ROW + SKULL_HEIGHT + 1))
TAG_ROW=$((MSG_ROW + 1))

sleep 0.3

for _ in 1 2 3; do
  cup "$MSG_ROW" 0
  printf "%${COLS}s" ""                                      # blank line
  sleep 0.06
  msg_pad=$(( (COLS - ${#MSG}) / 2 ))
  [ "$msg_pad" -lt 0 ] && msg_pad=0
  cup "$MSG_ROW" 0
  printf "${RED}%*s%s${RST}" "$msg_pad" '' "$MSG"
  sleep 0.1
done

tag_pad=$(( (COLS - ${#TAG}) / 2 ))
[ "$tag_pad" -lt 0 ] && tag_pad=0
cup "$TAG_ROW" 0
printf "${GRY}%*s%s${RST}" "$tag_pad" '' "$TAG"

sleep 0.4

# -- phase 4: decay dissolve ------------------------------------------------
DECAY_CHARS=('░' '▒' '▓' '█' ' ')
END_ROW=$((START_ROW + SKULL_HEIGHT + 2))
for pass in 0 1 2 3 4; do
  d=$END_ROW
  while [ "$d" -ge "$START_ROW" ]; do
    cup "$d" 0
    col=0
    while [ "$col" -lt "$COLS" ]; do
      r=$((RANDOM % 3))
      if [ "$r" -eq 0 ]; then
        printf "${DRED}${DECAY_CHARS[$pass]}${RST}"
      else
        printf ' '
      fi
      col=$((col + 1))
    done
    d=$((d - 3))
  done
  sleep 0.15
done

# -- clean up ----------------------------------------------------------------
sleep 0.3
printf '\033[2J\033[H'   # clear
show_cursor
"""


def _session_to_response(session: TerminalSession) -> SessionResponse:
    """Convert a TerminalSession ORM instance to a SessionResponse."""
    return SessionResponse(
        id=str(session.id),
        machine_id=str(session.machine_id),
        session_type=session.session_type,
        tmux_session_name=session.tmux_session_name,
        repo_path=session.repo_path,
        is_active=session.is_active,
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    machine_id: str | None = Query(default=None),
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SessionResponse]:
    """List all active terminal sessions, optionally filtered by machine."""
    query = select(TerminalSession).where(TerminalSession.is_active.is_(True))
    if machine_id is not None:
        query = query.where(TerminalSession.machine_id == machine_id)
    result = await db.execute(query)
    sessions = result.scalars().all()
    return [_session_to_response(s) for s in sessions]


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Create a new terminal session bound to a machine.

    The returned session ID is used by the frontend to open a WebSocket
    connection at /ws/terminal/{session_id}.
    """
    # Verify machine exists (skip DB lookup for local machine)
    if not is_local_machine(body.machine_id):
        machine = await db.get(Machine, UUID(body.machine_id))
        if machine is None:
            raise HTTPException(status_code=404, detail="Machine not found")

    session = TerminalSession(
        machine_id=body.machine_id,
        session_type=body.session_type,
        tmux_session_name=body.tmux_session_name,
        repo_path=body.repo_path,
        is_active=True,
    )
    db.add(session)
    await db.flush()

    return _session_to_response(session)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Get a single terminal session by ID."""
    session = await db.get(TerminalSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_response(session)


@router.patch("/{session_id}/detach", status_code=status.HTTP_204_NO_CONTENT)
async def detach_session(
    session_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Detach a session: hide the tab but keep the tmux session alive on remote."""
    session = await db.get(TerminalSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    await close_session_process(str(session_id))
    session.is_active = False
    await db.flush()
    logger.info("SESSION: Detached session=%s (tmux stays alive)", session_id)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    _user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Kill a session: permanently destroy the tmux session on remote."""
    session = await db.get(TerminalSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    tmux_name = session.tmux_session_name
    machine_id = str(session.machine_id)

    # Get connection via registry (works for both local and remote)
    conn = await get_connection_for_machine(machine_id)

    # Show death animation in the terminal before killing
    if conn is not None and tmux_name:
        try:
            cmd = (
                f"COLS=$(tmux display-message -p -t '{tmux_name}' '#{{pane_width}}')\n"
                f"ROWS=$(tmux display-message -p -t '{tmux_name}' '#{{pane_height}}')\n"
                f"TTY=$(tmux display-message -p -t '{tmux_name}' '#{{pane_tty}}')\n"
                f"export COLS ROWS\n"
                f"TERM=xterm bash > \"$TTY\" 2>&1 <<'LOCUS_DEATH'\n"
                f"{_DEATH_ANIMATION_SCRIPT}\n"
                f"LOCUS_DEATH"
            )
            await conn.run(cmd, check=False)
        except Exception:
            logger.debug("Could not display death animation for session=%s", session_id)

    # Close the in-memory process
    await close_session_process(str(session_id))

    # Kill the tmux session
    if is_local_machine(machine_id) and conn is None and tmux_name:
        # Native mode: use subprocess-based kill
        killed = await kill_tmux_session_local(tmux_name)
        if killed:
            logger.info("SESSION: Killed local tmux=%s", tmux_name)
        else:
            logger.warning("SESSION: Local tmux=%s not found", tmux_name)
    elif conn is not None and tmux_name:
        killed = await kill_tmux_session(conn, tmux_name)
        if killed:
            logger.info("SESSION: Killed tmux=%s on machine=%s", tmux_name, machine_id)
        else:
            logger.warning("SESSION: tmux=%s not found on machine=%s", tmux_name, machine_id)
    elif tmux_name:
        logger.warning("SESSION: Machine %s not connected, cannot kill tmux=%s", machine_id, tmux_name)

    session.is_active = False
    await db.flush()
