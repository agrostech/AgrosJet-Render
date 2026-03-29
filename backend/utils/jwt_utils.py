"""
JWT Token utility - Token üretme, doğrulama ve FastAPI dependency'leri
"""
import os
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request

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


def _extract_token(request: Request) -> dict:
    """Request'ten token çıkar ve doğrula"""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Yetkilendirme gerekli")
    token = auth_header[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş token")
    return payload


async def require_system_admin(request: Request) -> dict:
    """Sadece systemadmin erişebilir"""
    payload = _extract_token(request)
    if payload.get("role") != "systemadmin":
        raise HTTPException(status_code=403, detail="Bu işlem için sistem yöneticisi yetkisi gerekli")
    return payload


async def require_admin(request: Request) -> dict:
    """systemadmin, superadmin veya admin erişebilir"""
    payload = _extract_token(request)
    if payload.get("role") not in ("systemadmin", "superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Bu işlem için yönetici yetkisi gerekli")
    return payload


async def require_super_or_system(request: Request) -> dict:
    """systemadmin veya superadmin erişebilir"""
    payload = _extract_token(request)
    role = payload.get("role")
    is_super = payload.get("is_super", False)
    if role not in ("systemadmin", "superadmin") and not is_super:
        raise HTTPException(status_code=403, detail="Bu işlem için üst düzey yönetici yetkisi gerekli")
    return payload
