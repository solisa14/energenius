from supabase import Client, create_client

from backend.app.config import get_settings

_supabase: Client | None = None


def _normalize_supabase_url(url: str) -> str:
    # supabase-py expects project base URL, not /rest/v1 endpoint URL.
    return url.rstrip("/").removesuffix("/rest/v1")


def get_supabase() -> Client:
    """Module-level Supabase client (service role)."""
    global _supabase
    if _supabase is None:
        settings = get_settings()
        _supabase = create_client(
            _normalize_supabase_url(settings.supabase_url),
            settings.supabase_service_role_key,
        )
    return _supabase
