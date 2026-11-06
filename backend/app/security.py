import hashlib
import hmac
import secrets

SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT_PARAMS)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    _, salt, digest = stored_hash.split("$")
    candidate = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), **SCRYPT_PARAMS
    )
    return hmac.compare_digest(candidate.hex(), digest)
