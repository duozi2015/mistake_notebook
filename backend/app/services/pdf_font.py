"""PDF 中文字体注册：扫描可用 CJK 字体，缺失时自动下载，并注册给 reportlab。

reportlab 默认样式使用 Helvetica（Type1 基础字体，不含 CJK 字形），
中文会渲染为方块（tofu）。本模块负责找到/安装一个中文字体并注册。
"""

import logging
import os
import urllib.request

logger = logging.getLogger(__name__)

CJK_FONT_NAME = "CJK"
CJK_BOLD_FONT_NAME = "CJK-Bold"

_ASSETS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts"
)

# 项目自带字体（优先级最高）
_BUNDLED_CANDIDATES = [
    "NotoSansSC-Regular.otf",
    "NotoSansSC-Regular.ttf",
    "SourceHanSansSC-Regular.otf",
]

# 系统字体：macOS → Linux
_SYSTEM_CANDIDATES = [
    # macOS
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
    # Linux
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/arphic/uming.ttc",
]

# 粗体候选（找不到则退回普通字体，仅不做加粗，仍不会变方块）
_BOLD_CANDIDATES = [
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB W6.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
]

# 下载兜底：Noto Sans SC 子集版（体积较小）
_DOWNLOAD_CANDIDATES = [
    (
        "NotoSansSC-Regular.otf",
        "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf",
    ),
    (
        "NotoSansSC-Regular.ttf",
        "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf",
    ),
]

_registered = False
_font_name: str | None = None


def _register_ttf(name: str, path: str) -> bool:
    """注册单个字体文件，返回是否成功。"""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    try:
        # .ttc 为字体集合，需指定子字体索引
        pdfmetrics.registerFont(TTFont(name, path, subfontIndex=0))
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("注册字体失败 %s (%s): %s", name, path, e)
        return False


def _first_existing(paths: list[str]) -> str | None:
    for p in paths:
        if os.path.exists(p):
            return p
    return None


def _download_font() -> str | None:
    """下载兜底中文字体到 assets/fonts，返回本地路径或 None。"""
    os.makedirs(_ASSETS_DIR, exist_ok=True)
    for filename, url in _DOWNLOAD_CANDIDATES:
        dest = os.path.join(_ASSETS_DIR, filename)
        if os.path.exists(dest):
            return dest
        try:
            logger.info("未找到系统中文字体，正在下载: %s", url)
            with urllib.request.urlopen(url, timeout=30) as resp, open(dest, "wb") as f:
                f.write(resp.read())
            if os.path.getsize(dest) > 1000:
                logger.info("中文字体下载完成: %s", dest)
                return dest
            os.remove(dest)
        except Exception as e:  # noqa: BLE001
            logger.warning("字体下载失败 (%s): %s", url, e)
            if os.path.exists(dest):
                os.remove(dest)
    return None


def ensure_cjk_font() -> str | None:
    """确保中文字体已注册，返回字体名；无法注册时返回 None。

    结果会缓存，重复调用只执行一次扫描。
    """
    global _registered, _font_name
    if _registered:
        return _font_name

    from reportlab.pdfbase import pdfmetrics

    # 1. 项目自带 → 2. 系统字体 → 3. 下载兜底
    normal_path = _first_existing(
        [os.path.join(_ASSETS_DIR, f) for f in _BUNDLED_CANDIDATES]
    )
    if not normal_path:
        normal_path = _first_existing(_SYSTEM_CANDIDATES)
    if not normal_path:
        normal_path = _download_font()

    if not normal_path or not _register_ttf(CJK_FONT_NAME, normal_path):
        logger.error("未找到可用的中文字体，PDF 中文可能显示为方块")
        _registered = True
        return None

    # 粗体（可选）
    bold_path = _first_existing(_BOLD_CANDIDATES)
    if bold_path and _register_ttf(CJK_BOLD_FONT_NAME, bold_path):
        bold_name = CJK_BOLD_FONT_NAME
    else:
        bold_name = CJK_FONT_NAME

    # 注册字体族，避免 <b> 回退到 Helvetica-Bold 导致方块
    pdfmetrics.registerFontFamily(
        CJK_FONT_NAME,
        normal=CJK_FONT_NAME,
        bold=bold_name,
        italic=CJK_FONT_NAME,
        boldItalic=bold_name,
    )

    logger.info("已注册中文字体: %s (%s)", CJK_FONT_NAME, normal_path)
    _font_name = CJK_FONT_NAME
    _registered = True
    return _font_name
