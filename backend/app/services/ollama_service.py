"""本地 Ollama 客户端。

照 OCRService 的模式：惰性探测 + 永不抛异常 + 返回结构化结果（含 error 字段）。
HTTP 用标准库 urllib.request（与 app/services/pdf_font.py 同风格，零新依赖）。
"""

import json
import logging
import urllib.request

from app.config import settings

logger = logging.getLogger(__name__)


class OllamaService:
    """本地 Ollama 调用封装。任何失败都返回 {"error": ...}，不抛异常。"""

    @classmethod
    def is_available(cls) -> bool:
        """探测 Ollama 是否可用（3 秒超时）。"""
        if not settings.OLLAMA_ENABLED:
            return False
        try:
            with urllib.request.urlopen(
                f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=3
            ) as resp:
                return resp.status == 200
        except Exception as e:  # noqa: BLE001
            logger.warning("Ollama 不可用: %s", e)
            return False

    @classmethod
    def generate(cls, prompt: str, *, temperature: float = 0.4) -> dict:
        """调用 Ollama 生成文本。

        Returns:
            {"text": str}  成功
            {"error": "OLLAMA_DISABLED" | "OLLAMA_UNAVAILABLE"}  失败
        """
        if not settings.OLLAMA_ENABLED:
            return {"error": "OLLAMA_DISABLED"}

        payload = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            # 注意：不设 format="json"，我们要的是 Markdown 文本
            "options": {
                "temperature": temperature,
                "num_predict": 4096,
                "num_ctx": 8192,
            },
        }
        try:
            req = urllib.request.Request(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(
                req, timeout=settings.OLLAMA_TIMEOUT_SECONDS
            ) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            return {"text": body.get("response", "")}
        except Exception as e:  # noqa: BLE001
            logger.warning("Ollama 调用失败: %s", e)
            return {"error": "OLLAMA_UNAVAILABLE"}
