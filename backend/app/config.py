from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# 定位仓库根目录的 .env（config.py 位于 backend/app/，上溯三级到仓库根）
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24h
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080  # 7d
    # 显式指定数据库 URL 时优先；留空则按机器环境自动选择 MySQL 生产/测试库
    DATABASE_URL: str = ""
    # 运行环境：production / development；留空则按主机名推断（与 /health 一致）
    APP_ENV: str = ""
    OCR_ENABLED: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # 生产库（Mac mini 本地，仅内网）
    DB_PROD_HOST: str = "127.0.0.1"
    DB_PROD_PORT: int = 3306
    DB_PROD_NAME: str = "mistake_prod"
    DB_PROD_USER: str = "mistake_prod"
    DB_PROD_PASSWORD: str = ""
    # 测试库（Mac mini 局域网，Mac Pro 远程连接）
    DB_TEST_HOST: str = ""
    DB_TEST_PORT: int = 3306
    DB_TEST_NAME: str = "mistake_test"
    DB_TEST_USER: str = "mistake_test"
    DB_TEST_PASSWORD: str = ""

    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8")

    def env_mode(self) -> str:
        """production / development：优先 APP_ENV，否则按主机名推断（含 'macbook' 视为开发机）。"""
        if self.APP_ENV:
            return self.APP_ENV
        import socket
        hostname = socket.gethostname().lower()
        return "development" if "macbook" in hostname else "production"

    def resolved_database_url(self) -> str:
        """连接哪个数据库：显式 DATABASE_URL 优先；否则按机器环境选择（生产→mistake_prod，开发→mistake_test）。"""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        if self.env_mode() == "production":
            return (
                f"mysql+pymysql://{self.DB_PROD_USER}:{self.DB_PROD_PASSWORD}"
                f"@{self.DB_PROD_HOST}:{self.DB_PROD_PORT}/{self.DB_PROD_NAME}"
            )
        return (
            f"mysql+pymysql://{self.DB_TEST_USER}:{self.DB_TEST_PASSWORD}"
            f"@{self.DB_TEST_HOST}:{self.DB_TEST_PORT}/{self.DB_TEST_NAME}"
        )


settings = Settings()