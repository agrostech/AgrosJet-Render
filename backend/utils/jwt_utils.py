"""
JWT Token utility - Token üretme ve doğrulama
"""
import os
import jwt
from datetime import datetime, timezone, timedelta

# Secret key for JWT signing - production'da .env'den alınmalı
JWT_SECRET = os.environ.get("JWT_SECRET", "agrosjet-32-jwt-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 72  # 3 gün


def create_token(user_id: str, role: str, extra: dict = None) -> str:
    """JWT token üret"""
    payload = {
        "sub": user_id,
        "role": role,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """JWT token doğrula ve decode et. Geçersizse None döner."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
