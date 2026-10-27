"""
Application configuration, loaded from environment variables / .env.
Keep all tunables here rather than scattered through the codebase.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/omanone_sim"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    sim_timezone: str = "Asia/Muscat"
    sim_currency: str = "OMR"

    # Phase 7 — demo auth. SIMULATION MODE: this is a documented demo secret,
    # not production secrets management; override via JWT_SECRET in a real
    # deployment's .env. Tokens expire after 8 hours (one demo "shift").
    jwt_secret: str = "omanone-sim-demo-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
