import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class OCRService:
    """Lazy-loaded EasyOCR service. Returns None if not available."""

    _reader = None

    @classmethod
    def get_reader(cls):
        if cls._reader is None:
            try:
                import easyocr

                cls._reader = easyocr.Reader(["ch_sim", "en"], gpu=False)
                logger.info("EasyOCR reader initialized")
            except Exception as e:
                logger.warning(f"EasyOCR not available: {e}")
                return None
        return cls._reader

    @classmethod
    def recognize(cls, image_path: str) -> dict:
        """
        Recognize text from an image file.

        Returns:
        {
            "text": "recognized text",
            "confidence": 0.95,
            "segments": [
                {"text": "text1", "confidence": 0.98, "bbox": [x1, y1, x2, y2]},
            ]
        }
        """
        reader = cls.get_reader()
        if reader is None:
            return {
                "text": "",
                "confidence": 0,
                "segments": [],
                "error": "OCR not available",
            }

        if not os.path.isfile(image_path):
            return {
                "text": "",
                "confidence": 0,
                "segments": [],
                "error": f"Image file not found: {image_path}",
            }

        try:
            result = reader.readtext(image_path)
            segments = [
                {"text": text, "confidence": round(conf, 4), "bbox": bbox}
                for bbox, text, conf in result
            ]
            full_text = "\n".join(s["text"] for s in segments)
            avg_conf = (
                sum(s["confidence"] for s in segments) / len(segments)
                if segments
                else 0
            )

            return {
                "text": full_text,
                "confidence": round(avg_conf, 4),
                "segments": segments,
            }
        except Exception as e:
            logger.error(f"OCR recognition failed: {e}")
            return {
                "text": "",
                "confidence": 0,
                "segments": [],
                "error": f"OCR recognition failed: {str(e)}",
            }