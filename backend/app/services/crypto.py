from cryptography.fernet import Fernet

from app.config import settings

_fernet = Fernet(
    settings.encryption_key.encode()
    if isinstance(settings.encryption_key, str)
    else settings.encryption_key
)


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string using Fernet symmetric encryption."""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted string back to plaintext."""
    return _fernet.decrypt(ciphertext.encode()).decode()
