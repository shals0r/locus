"""Local machine management package."""

from app.local.manager import (
    LOCAL_MACHINE_ID,
    LOCAL_MACHINE_NAME,
    LocalMachineManager,
    local_machine_manager,
)

__all__ = [
    "LocalMachineManager",
    "local_machine_manager",
    "LOCAL_MACHINE_ID",
    "LOCAL_MACHINE_NAME",
]
