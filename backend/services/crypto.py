from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet


def _derive_key(raw_key: str) -> bytes:
    digest = hashlib.sha256(raw_key.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt(plaintext: str, key: str) -> str:
    f = Fernet(_derive_key(key))
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str, key: str) -> str:
    f = Fernet(_derive_key(key))
    return f.decrypt(ciphertext.encode()).decode()


def generate_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode()
