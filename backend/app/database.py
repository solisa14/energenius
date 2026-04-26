from supabase import Client, create_client

from backend.app.config import get_settings

_supabase: Client | None = None


def get_supabase() -> Client:
    """Module-level Supabase client (service role)."""
    global _supabase
    if _supabase is None:
        settings = get_settings()
        _supabase = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _supabase
