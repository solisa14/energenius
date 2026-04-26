from functools import lru_cache
from urllib.parse import urlparse

import httpx
from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from backend.app.config import get_settings


def _supabase_origin(supabase_url: str) -> str:
    parsed = urlparse(supabase_url)
    if not parsed.scheme or not parsed.netloc:
        return supabase_url.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}"


@lru_cache(maxsize=1)
def _get_supabase_jwks() -> dict[str, object]:
    settings = get_settings()
    jwks_url = f"{_supabase_origin(settings.supabase_url)}/auth/v1/.well-known/jwks.json"
    response = httpx.get(jwks_url, timeout=5.0)
    response.raise_for_status()
    return response.json()


def _decode_supabase_token(token: str) -> dict[str, object]:
    settings = get_settings()
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")

    if algorithm == "HS256":
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )

    kid = header.get("kid")
    keys = _get_supabase_jwks().get("keys", [])
    jwk = next(
        (
            key
            for key in keys
            if isinstance(key, dict) and (not kid or key.get("kid") == kid)
        ),
        None,
    )
    if jwk is None:
        raise JWTError("No matching Supabase JWKS key")

    issuer = f"{_supabase_origin(settings.supabase_url)}/auth/v1"
    return jwt.decode(
        token,
        jwk,
        algorithms=["RS256", "ES256"],
        audience="authenticated",
        issuer=issuer,
    )


def get_current_user_id(authorization: str = Header(..., alias="Authorization")) -> str:
    """Extract Supabase user id (JWT `sub`) from `Authorization: Bearer <token>`."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    try:
        payload = _decode_supabase_token(token)
    except (JWTError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        ) from exc
    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing sub",
        )
    return sub
