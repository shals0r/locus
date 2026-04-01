"""WebSocket proxy: bridges browser terminal traffic through Locus to a host agent.

Bidirectional forwarding with proper cleanup when either side disconnects.
Addresses backpressure via bounded message sizes (max_size=1MB).
"""

from __future__ import annotations

import asyncio
import json
import logging

import websockets

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


async def proxy_terminal_to_agent(browser_ws: WebSocket, agent_ws_url: str) -> None:
    """Proxy terminal I/O between a browser WebSocket and an agent WebSocket.

    Binary frames (terminal data) are forwarded as-is.
    Text frames (JSON resize commands) are forwarded as text.

    When either side disconnects, both connections are cleaned up.

    Args:
        browser_ws: The FastAPI WebSocket connection from the browser.
        agent_ws_url: Full ws:// URL to the agent's terminal WebSocket
                      (including token query param).
    """
    logger.debug("PROXY: Connecting to agent at %s", agent_ws_url)

    async with websockets.connect(
        agent_ws_url,
        max_size=2**20,  # 1MB max message size
        close_timeout=5,
    ) as agent_ws:
        logger.debug("PROXY: Connected to agent, starting bidirectional forwarding")

        async def forward_browser_to_agent() -> None:
            """Forward messages from browser WebSocket to agent WebSocket."""
            try:
                while True:
                    message = await browser_ws.receive()
                    msg_type = message.get("type", "")

                    if msg_type == "websocket.disconnect":
                        break

                    if "bytes" in message and message["bytes"] is not None:
                        # Binary terminal data
                        await agent_ws.send(message["bytes"])
                    elif "text" in message and message["text"] is not None:
                        # Text frame (JSON resize commands etc.)
                        await agent_ws.send(message["text"])
            except WebSocketDisconnect:
                pass
            except Exception as exc:
                logger.debug("PROXY: browser->agent loop ended: %s", exc)

        async def forward_agent_to_browser() -> None:
            """Forward messages from agent WebSocket to browser WebSocket."""
            try:
                async for message in agent_ws:
                    if isinstance(message, bytes):
                        await browser_ws.send_bytes(message)
                    elif isinstance(message, str):
                        await browser_ws.send_text(message)
            except WebSocketDisconnect:
                pass
            except Exception as exc:
                logger.debug("PROXY: agent->browser loop ended: %s", exc)

        tasks = [
            asyncio.create_task(forward_browser_to_agent(), name="browser->agent"),
            asyncio.create_task(forward_agent_to_browser(), name="agent->browser"),
        ]

        # Wait for either direction to finish, then cancel the other
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)

        for task in pending:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        # Log any exceptions from completed tasks
        for task in done:
            if task.exception() is not None:
                logger.warning("PROXY: task %s raised: %s", task.get_name(), task.exception())

    logger.debug("PROXY: Session ended for %s", agent_ws_url)
