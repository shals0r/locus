"""Pydantic schemas for file operations."""

from pydantic import BaseModel


class FileReadRequest(BaseModel):
    """Request to read file content."""

    machine_id: str
    file_path: str


class FileWriteRequest(BaseModel):
    """Request to write file content."""

    machine_id: str
    file_path: str
    content: str


class FileContent(BaseModel):
    """File content with metadata."""

    content: str
    language: str
    size: int
    mtime: int


class DirectoryEntry(BaseModel):
    """A single entry in a directory listing."""

    name: str
    is_dir: bool


class DirectoryListing(BaseModel):
    """Directory listing with entries."""

    path: str
    entries: list[DirectoryEntry]


class FileCreateRequest(BaseModel):
    """Request to create a new file."""

    machine_id: str
    file_path: str
    content: str = ""


class FileRenameRequest(BaseModel):
    """Request to rename/move a file."""

    machine_id: str
    old_path: str
    new_path: str


class FileDeleteRequest(BaseModel):
    """Request to delete a file."""

    machine_id: str
    file_path: str


class FileStatResponse(BaseModel):
    """File stat information (size and modification time)."""

    size: int
    mtime: int
