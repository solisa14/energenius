from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    backboard_api_key: str
    backboard_base_url: str
    backboard_assistant_id: str
    google_ai_api_key: str = ""
    gemma_model_name: str = "gemma-4-31b-it"
    electricity_maps_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
