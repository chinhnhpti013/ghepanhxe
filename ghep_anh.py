# -*- coding: utf-8 -*-
import io as _io, sys as _sys
# Bọc cả stdout lẫn stderr bằng UTF-8 — nếu thiếu stderr thì mọi thông báo lỗi
# tiếng Việt (sys.exit, traceback) sẽ hiện ra dạng ký tự rác trên Windows.
_sys.stdout = _io.TextIOWrapper(_sys.stdout.buffer, encoding='utf-8', errors='replace')
_sys.stderr = _io.TextIOWrapper(_sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
Giai đoạn 2: Ghép ảnh đã đặt tên vào khung A4 PDF.

Cách dùng:
  python ghep_anh.py --gdv "Nguyễn Văn A" --layout doc
  python ghep_anh.py --gdv "Trần Thị B"   --layout ngang --so-anh 6
  python ghep_anh.py --gdv "Lê Văn C" --loai giayto      # bố cục tự động
  python ghep_anh.py --gdv "Lê Văn C" --loai xacminh --chu-thich ten-file

  --layout doc   : Portrait A4  — 1, 2, 3, 4, 6, 8, 9, 12 ảnh/trang (mặc định 6)
  --layout ngang : Landscape A4 — 1, 2, 4, 6, 8, 9 ảnh/trang (mặc định 4)
  --loai giayto  : bố cục tự động theo tiền tố {chính}.{phụ} của tên ảnh:
                   1.1–1.6 (đăng ký xe, bằng lái, CCCD) → 4 ảnh/trang A4 ngang
                   2.x     (đăng kiểm, bảo hiểm A5)     → 2 ảnh/trang A4 dọc
                   3.x     (xác minh bằng lái)          → 4 ảnh/trang A4 dọc
                   4+      (giấy tờ khổ A4)             → 1 ảnh/trang A4 dọc
                   Ảnh cùng bố cục được dồn chung trang. Ảnh KHÔNG có tiền tố
                   dùng --layout/--so-anh như các loại bản ảnh khác.

Đọc thông tin BKS và ga-ra từ input/Bao_gia.xlsx (hoặc docs/thong_tin_giam_dinh_xe.xlsx),
hoặc OCR ảnh báo giá bằng Gemini Vision.
Ảnh lấy từ renamed/ với mapping trong renamed/mapping.json.
Kết quả PDF xuất ra output/.
"""

import argparse
import json
import math
import os
import re
import sys
import unicodedata

import io as _bytesio
from PIL import Image, ImageDraw, ImageOps
import openpyxl
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm, cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Paths ──────────────────────────────────────────────────────────────────────
RENAMED_DIR    = "renamed"
MAPPING_FILE   = os.path.join(RENAMED_DIR, "mapping.json")
OUTPUT_DIR     = "output"
LOGO_PATH      = "assets/logo-ptisos.png"
FONT_REGULAR   = "fonts/BeVietnamPro-Regular.ttf"
FONT_BOLD      = "fonts/BeVietnamPro-Bold.ttf"
BAO_GIA_PATH   = "input/Bao_gia.xlsx"
PHONG_DEFAULT  = "Phòng Cứu hộ & Giám định tại khu vực Quảng Ninh"
THONG_TIN_PATH = "docs/thong_tin_giam_dinh_xe.xlsx"

# ── Màu sắc ───────────────────────────────────────────────────────────────────
BLUE_HEADER   = colors.HexColor("#1565C0")
BLUE_CAPTION  = colors.HexColor("#1565C0")
GRAY_FOOTER   = colors.HexColor("#757575")
WHITE         = colors.white

# ── Kích thước layout ─────────────────────────────────────────────────────────
LOGO_SIZE_MM  = 17          # logo vừa trong header 20mm
HEADER_H_MM   = 20          # header sát mép trên trang, cao 20mm
HEADER_GAP_MM = 3           # khoảng trắng giữa header và hàng ảnh đầu tiên
FOOTER_H_MM   = 8
CAPTION_H_MM  = 7
GAP_MM        = 2           # khoảng cách giữa các ô ảnh
MARGIN_MM     = 8           # lề xung quanh
CORNER_RADIUS_PCT = 0.04    # bo góc = 4% cạnh ngắn của vùng ảnh vẽ ra
HEAD_PAD      = 2           # chừa trên/dưới khối chữ header (point)
HEAD_LINE_SP  = 2           # giãn dòng header (point)
HEAD_X_MM     = 12          # khoảng cách từ mép phải logo tới chữ tiêu đề
HEAD_SEG_MM   = 10          # khoảng cách giữa 2 đoạn chữ trên cùng một dòng header
FOOTER_FS     = 13 * 2 / 3  # cỡ chữ chân trang = 2/3 cỡ cũ (13pt)
ASC, DESC     = 0.78, 0.22  # tỉ lệ ascender / descender của Be Vietnam Pro

# ── Fonts ─────────────────────────────────────────────────────────────────────

def register_fonts():
    pdfmetrics.registerFont(TTFont("BVP",     FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("BVP-Bold", FONT_BOLD))


# ── Gemini Vision OCR ─────────────────────────────────────────────────────────

def _load_gemini_api_key() -> str:
    """Đọc GEMINI_API_KEY từ .env hoặc biến môi trường."""
    key = os.environ.get("GEMINI_API_KEY", "")
    if key:
        return key
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def _find_bao_gia_images(search_dir: str = "input") -> list:
    """Tìm ảnh báo giá trong thư mục input (khớp tên chứa 'bao' và 'gia')."""
    if not os.path.isdir(search_dir):
        return []
    img_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    results = []
    for fname in os.listdir(search_dir):
        if os.path.splitext(fname)[1].lower() not in img_exts:
            continue
        slug = os.path.splitext(fname)[0].lower().replace("-", "").replace("_", "").replace(" ", "")
        if "bao" in slug and ("gia" in slug or "giá" in slug):
            results.append(os.path.join(search_dir, fname))
    return sorted(results)


def ocr_bao_gia_with_gemini(image_path: str) -> tuple:
    """
    Dùng Gemini Vision để trích xuất BKS và tên ga-ra từ ảnh báo giá.
    Trả về (bks, ga_ra). Nếu lỗi hoặc không nhận ra trả về ('', '').
    """
    try:
        from google import genai  # pip install google-genai

        api_key = _load_gemini_api_key()
        if not api_key:
            print("  Cảnh báo: Không tìm thấy GEMINI_API_KEY trong .env", file=sys.stderr)
            return "", ""

        client = genai.Client(api_key=api_key)
        img = Image.open(image_path).convert("RGB")

        prompt = (
            "Đây là ảnh báo giá / hợp đồng sửa chữa xe ô tô tại Việt Nam.\n"
            "Hãy đọc toàn bộ văn bản trong ảnh và trích xuất CHÍNH XÁC:\n"
            "1. Biển kiểm soát xe (BKS) — thường có dạng: 14C-402.84, 51A-12345, 29B1-123.45, 30F-999.99\n"
            "2. Tên gara / đơn vị sửa chữa / địa điểm — tên công ty hoặc xưởng.\n\n"
            "Chỉ trả lời DUY NHẤT JSON sau, không thêm văn bản nào khác:\n"
            '{"bks": "...", "gara": "..."}\n\n'
            "Nếu không tìm thấy thông tin nào, để chuỗi rỗng \"\"."
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[img, prompt],
        )
        text = response.text.strip()

        # Tìm và parse khối JSON trong response
        m = re.search(r'\{[^{}]+\}', text, re.DOTALL)
        if m:
            data = json.loads(m.group())
            bks   = str(data.get("bks",  "")).strip()
            ga_ra = str(data.get("gara", "")).strip()
            if bks or ga_ra:
                print(f"  Gemini OCR → BKS: {bks!r}  |  Ga-ra: {ga_ra!r}")
            return bks, ga_ra

        print("  Cảnh báo: Gemini không trả về JSON hợp lệ.", file=sys.stderr)
    except ImportError:
        print("  Cảnh báo: Chưa cài google-genai. Chạy: pip install google-genai",
              file=sys.stderr)
    except Exception as e:
        print(f"  Lỗi Gemini OCR: {e}", file=sys.stderr)
    return "", ""


# ── Đọc thông tin từ Excel ────────────────────────────────────────────────────

def _read_xlsx_info(path: str):
    """Trả về (bks, ga_ra) từ file Excel báo giá / bảng kê."""
    bks, ga_ra = "", ""
    try:
        wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(max_row=20, values_only=True))

        # Dòng đầu tiên có nội dung thường là tên ga-ra
        for row in rows[:4]:
            val = next((str(c).strip() for c in row if c), "")
            if val and not val.startswith("Địa chỉ"):
                ga_ra = val
                break

        # Tìm biển số
        for row in rows:
            for i, cell in enumerate(row):
                if cell and any(kw in str(cell) for kw in ("Biển số", "Biển kiểm soát", "Bien so", "BKS")):
                    # Giá trị BKS nằm ở cột liền kề
                    for j in range(i + 1, len(row)):
                        if row[j]:
                            bks = str(row[j]).strip()
                            break
                if bks:
                    break
            if bks:
                break
    except Exception as e:
        print(f"  Cảnh báo: không đọc được {path}: {e}", file=sys.stderr)
    return bks, ga_ra


def get_bks_garage() -> tuple:
    # 1. Thử đọc từ file Excel
    candidates = [BAO_GIA_PATH, THONG_TIN_PATH]
    if os.path.isdir("input"):
        for f in os.listdir("input"):
            if f.lower().endswith(".xlsx"):
                p = os.path.join("input", f)
                if p not in candidates:
                    candidates.append(p)
    for path in candidates:
        if os.path.exists(path):
            bks, ga_ra = _read_xlsx_info(path)
            if bks or ga_ra:
                return bks, ga_ra

    # 2. Fallback: OCR ảnh báo giá bằng Gemini Vision
    for img_path in _find_bao_gia_images():
        print(f"  Đang OCR ảnh báo giá bằng Gemini: {img_path}")
        bks, ga_ra = ocr_bao_gia_with_gemini(img_path)
        if bks or ga_ra:
            return bks, ga_ra

    return "", ""


# ── Đọc danh sách ảnh ────────────────────────────────────────────────────────

_SENTENCE_START = re.compile(r'(^|[.!?…]["\'”’»)\]]*\s+)([a-zà-ỹ])')


def normalize_caption(text: str) -> str:
    """
    AutoCorrect chú thích — khớp normalizeCaption() trong index.html:
    gộp khoảng trắng thừa, viết hoa chữ đầu và chữ đầu sau dấu . ! ? …
    """
    if text is None:
        return ""
    value = re.sub(r"[\t ]+", " ", str(text))
    value = re.sub(r" {2,}", " ", value).strip()
    if not value:
        return ""
    value = re.sub(r"^(\s*[^\w]*)([a-zà-ỹ])",
                   lambda m: m.group(1) + m.group(2).upper(), value)
    return _SENTENCE_START.sub(lambda m: m.group(1) + m.group(2).upper(), value)


def letters_only(text: str) -> str:
    """Bỏ chữ số và dấu câu trong tên thư mục / tên file, chỉ giữ ký tự chữ.

    "1. Cốp sau lõm bẹp, rách_2" → "Cốp sau lõm bẹp rách".
    Số thứ tự in ở đầu chú thích vẫn do build_pages() tự sinh.
    Giữ khớp với lettersOnly() trong index.html.
    """
    out = []
    for ch in str("" if text is None else text):
        out.append(ch if (ch.isalpha() or ch.isspace() or unicodedata.combining(ch)) else " ")
    return re.sub(r"\s+", " ", "".join(out)).strip()


def cap_name(text: str) -> str:
    """letters_only() nhưng không trả về rỗng (tên toàn số thì giữ nguyên)."""
    return letters_only(text) or str("" if text is None else text).strip()


def load_images_with_captions(renamed_dir: str = RENAMED_DIR,
                              thuyet_minh: str = "hang-muc",
                              captions_file: str = ""):
    """
    Trả về list of (prefix:tuple|None, filepath:str, caption:str, rot:int), đã sắp xếp tăng dần.
    prefix = (tiền tố chính, tiền tố phụ) đọc từ tên file; None nếu tên file không có tiền tố số.

    thuyet_minh   : "hang-muc" dùng tên thư mục gốc (mapping.json);
                    "ten-file" dùng tên file ảnh (bỏ phần mở rộng).
                    Cả 2 nguồn đều đi qua cap_name() — bỏ chữ số và dấu câu.
    captions_file : JSON ghi đè từng ảnh, mỗi mục nhận 1 trong 2 dạng:
                      "tên file": "chú thích riêng"
                      "tên file": {"cap": "chú thích", "rot": 90}
                    rot = góc xoay 0/90/180/270, áp dụng trước khi tự xoay ngang.
    """
    if not os.path.exists(MAPPING_FILE):
        sys.exit(f"Không tìm thấy {MAPPING_FILE}. Hãy chạy dat_ten_file.py trước.")

    with open(MAPPING_FILE, encoding="utf-8") as f:
        mapping: dict = json.load(f)

    overrides: dict = {}
    if captions_file:
        if not os.path.exists(captions_file):
            sys.exit(f"Không tìm thấy file chú thích: {captions_file}")
        with open(captions_file, encoding="utf-8") as f:
            overrides = json.load(f)
        print(f"  Đã nạp {len(overrides)} chú thích riêng từ {captions_file}")

    IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    def sort_key(name: str):
        stem = os.path.splitext(name)[0]
        m = re.match(r"^(\d+)\.\s*(.*?)_(\d+)$", stem)
        if m:
            return (int(m.group(1)), m.group(2).lower(), int(m.group(3)))
        parts = re.split(r"(\d+)", stem)
        return tuple(int(p) if p.isdigit() else p.lower() for p in parts if p)

    def file_prefix(name: str):
        """Tiền tố số của tên file → (chính, phụ); None nếu không có tiền tố.

        Chỉ nhận 1–2 chữ số để tên máy ảnh kiểu "20261114_123.jpg" không bị hiểu là
        tiền tố, và chỉ cắt phần mở rộng ảnh để giữ nguyên phần ".5" của "2.5 Căn cước…".
        Giữ khớp với getPrefixPair() trong index.html.
        """
        stem = re.sub(r"\.(jpe?g|png|bmp|webp|pdf)$", "", name, flags=re.I)
        m = re.match(r"^(\d{1,2})(?:\.(\d{1,2}))?(?!\d)", stem)
        return (int(m.group(1)), int(m.group(2) or 0)) if m else None

    entries = []
    for fname, caption in mapping.items():
        fpath = os.path.join(renamed_dir, fname)
        if not (os.path.exists(fpath) and os.path.splitext(fname)[1].lower() in IMAGE_EXTS):
            continue
        if thuyet_minh == "ten-file":
            caption = os.path.splitext(fname)[0]
        # Tên hạng mục / tên file: bỏ chữ số và dấu câu, chỉ giữ ký tự chữ
        caption = cap_name(caption)
        rot = 0
        ov = overrides.get(fname)
        if isinstance(ov, dict):
            if str(ov.get("cap", "")).strip():
                caption = normalize_caption(ov["cap"])
            rot = int(ov.get("rot", 0) or 0) % 360
        elif isinstance(ov, str) and ov.strip():
            caption = normalize_caption(ov)
        entries.append((fname, fpath, caption, rot))

    entries.sort(key=lambda e: sort_key(e[0]))
    return [(file_prefix(fn), fp, cap, rot) for fn, fp, cap, rot in entries]


# ── Bo góc ảnh ────────────────────────────────────────────────────────────────

def round_corners(img: Image.Image, radius: int) -> Image.Image:
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), img.size], radius=radius, fill=255)
    img.putalpha(mask)
    return img


# ── Vẽ trang PDF ─────────────────────────────────────────────────────────────

def _pts(mm_val):
    return mm_val * mm


LOAI_GD_MAP = {
    "chitiet":    "Giám định chi tiết xe ô tô BKS",
    "hientruong": "Giám định hiện trường xe ô tô BKS",
    "giayto":     "Giám định giấy tờ xe ô tô BKS",
    "xacminh":    "Ảnh xác minh hiện trường xe ô tô BKS",
}

# Số ảnh trên mỗi trang → (cols, rows). Giữ khớp với GRID trong index.html.
GRID = {
    "doc":   {1: (1, 1), 2: (1, 2), 3: (1, 3), 4: (2, 2),
              6: (2, 3), 8: (2, 4), 9: (3, 3), 12: (3, 4)},
    "ngang": {1: (1, 1), 2: (2, 1), 4: (2, 2), 6: (3, 2), 8: (4, 2), 9: (3, 3)},
}
PERPAGE_DEFAULT = {"doc": 6, "ngang": 4}

# Kiểu "giayto": tiền tố {chính}.{phụ} → (layout, số ảnh/trang, ghi chú).
# (maj, lo, hi) = tiền tố chính, khoảng tiền tố phụ.
# Bảng này phải luôn khớp với GIAYTO_RULES trong index.html.
GIAYTO_RULES = [
    (1, 1, 99, "ngang", 4, "Đăng ký xe · bằng lái · căn cước (cỡ thẻ)"),
    (2, 1, 99, "doc",   2, "Đăng kiểm · bảo hiểm khổ A5"),
    (3, 1, 99, "doc",   4, "Ảnh xác minh bằng lái"),
]
# Tiền tố từ 4 trở lên — giấy tờ khổ A4, mỗi ảnh một trang dọc
GIAYTO_BIG = ("doc", 1, "Giấy tờ khổ A4")


def giayto_spec(prefix):
    """prefix = (chính, phụ) → (layout, số ảnh/trang, ghi chú).

    Trả về None khi ảnh không có tiền tố số — khi đó dùng bố cục chọn tay
    (--layout / --so-anh). Tiền tố phụ bỏ trống được coi như .1.
    """
    if not prefix:
        return None
    maj, mn = prefix[0], prefix[1] or 1
    if maj >= 4:
        return GIAYTO_BIG
    for m, lo, hi, lay, per, note in GIAYTO_RULES:
        if m == maj and lo <= mn <= hi:
            return (lay, per, note)
    for m, lo, hi, lay, per, note in GIAYTO_RULES:   # đúng tiền tố chính, lệch tiền tố phụ
        if m == maj:
            return (lay, per, note)
    return GIAYTO_BIG


def build_pages(entries: list, loai: str, layout: str, per_page: int) -> list:
    """
    Phân trang + đánh số thứ tự ảnh (trái→phải, trên→dưới, liên tục qua các trang).

    Trả về list of dict: {"size": (w,h), "cols": c, "rows": r,
                          "cells": [(fpath, caption, rot, so_thu_tu)]}
    Số thứ tự được in ở đầu chú thích — khớp với buildPages() trong index.html.
    """
    pages = _build_pages_raw(entries, loai, layout, per_page)
    n = 0
    for pg in pages:
        numbered = []
        for fpath, cap, rot in pg["cells"]:
            n += 1
            numbered.append((fpath, cap, rot, n))
        pg["cells"] = numbered
    return pages


def _build_pages_raw(entries: list, loai: str, layout: str, per_page: int) -> list:
    """
    Phân trang ảnh — nguồn sự thật duy nhất cho mọi loại bản ảnh.
    entries: list of (prefix:tuple|None, filepath:str, caption:str, rot:int) đã sắp xếp.
    """
    pages = []

    def chunk(cells, n, size, cols, rows):
        for i in range(0, len(cells), n):
            pages.append({"size": size, "cols": cols, "rows": rows,
                          "cells": cells[i:i + n]})

    if loai == "giayto":
        # Bố cục tự động theo tiền tố số của TỪNG ảnh (GIAYTO_RULES). Ảnh cùng bố cục
        # được dồn chung trang, kể cả khi ở khác hạng mục — nhờ vậy 1.1 → 1.4 (mỗi loại
        # 1 ảnh) nằm gọn trên MỘT trang 4 ảnh/trang ngang. Ảnh không tiền tố xuống cuối.
        buckets: dict = {}
        for prefix, fpath, cap, rot in entries:
            spec = giayto_spec(prefix)
            if spec is None:
                key, lay, per, order = "manual", layout, per_page, 10 ** 6
            else:
                lay, per = spec[0], spec[1]
                key, order = f"{lay}{per}", prefix[0] * 100 + (prefix[1] or 0)
            cols, rows = GRID[lay].get(per) or GRID[lay][PERPAGE_DEFAULT[lay]]
            b = buckets.setdefault(key, {"order": order, "lay": lay,
                                         "cols": cols, "rows": rows, "cells": []})
            b["order"] = min(b["order"], order)
            b["cells"].append((fpath, cap, rot))
        for b in sorted(buckets.values(), key=lambda x: x["order"]):
            size = A4 if b["lay"] == "doc" else landscape(A4)
            chunk(b["cells"], b["cols"] * b["rows"], size, b["cols"], b["rows"])
        return pages

    size = A4 if layout == "doc" else landscape(A4)
    cols, rows = GRID[layout].get(per_page) or GRID[layout][PERPAGE_DEFAULT[layout]]
    n = cols * rows

    if loai == "chitiet":
        cover = [(fp, cap, rot) for pre, fp, cap, rot in entries if pre and pre[0] == 0]
        main  = [(fp, cap, rot) for pre, fp, cap, rot in entries if not (pre and pre[0] == 0)]
        if cover:
            chunk(cover, n, size, cols, rows)   # trang nhận dạng xe
        chunk(main, n, size, cols, rows)
        return pages

    # hientruong / xacminh — ghép liên tục toàn bộ ảnh
    chunk([(fp, cap, rot) for _, fp, cap, rot in entries], n, size, cols, rows)
    return pages


def draw_header(c: Canvas, page_w, page_h, bks: str, ga_ra: str, gdv: str,
                ngay: str = "", loai: str = "chitiet", ma_ho_so: str = ""):
    """Vẽ header: logo trái + khối tiêu đề căn giữa bên phải logo.

    Khối tiêu đề gồm **3 dòng** (khớp `headerLines()` của index.html):
      1. {loại giám định} : {BKS}  -  Ngày: {ngày}                   15pt đậm
      2. Số HSBT: {mã hồ sơ}  ·10mm·  {GĐV}                          14pt
      3. {ga-ra}                                                     15pt
    Dòng 2 gồm 2 **đoạn** nằm trên cùng baseline, cách nhau `HEAD_SEG_MM`.
    Số đoạn/dòng thay đổi theo dữ liệu (đoạn "Số HSBT" chỉ in khi có mã hồ sơ),
    nên chiều cao khối chữ được tính động rồi mới canh giữa theo chiều dọc.
    """
    logo_size = _pts(LOGO_SIZE_MM)
    margin    = _pts(MARGIN_MM)
    header_h  = _pts(HEADER_H_MM)
    top_y     = page_h          # header dán sát mép trên trang, không chừa lề

    # Nền header màu xanh
    c.setFillColor(BLUE_HEADER)
    c.rect(0, top_y - header_h, page_w, header_h, fill=1, stroke=0)

    # Logo
    if os.path.exists(LOGO_PATH):
        logo_x = margin
        logo_y = top_y - header_h / 2 - logo_size / 2
        c.drawImage(LOGO_PATH, logo_x, logo_y, width=logo_size, height=logo_size,
                    preserveAspectRatio=True, mask="auto")

    # Vùng chữ tiêu đề (bên phải logo)
    text_x = margin + logo_size + _pts(HEAD_X_MM)
    text_w = page_w - text_x - margin
    c.setFillColor(WHITE)

    # Các dòng tiêu đề: (các đoạn chữ, cỡ chữ, in đậm)
    prefix_loai = LOAI_GD_MAP.get(loai, LOAI_GD_MAP["chitiet"])
    # Dòng 1 — {loại} : {BKS} kèm Ngày giám định ở cuối
    d1 = f"{prefix_loai} : {bks}"
    lines = [([f"{d1}  -  Ngày: {ngay}" if ngay else d1], 15, True)]
    # Dòng 2 — Số HSBT (chỉ khi có mã hồ sơ) nối liền tên GĐV, cách nhau HEAD_SEG_MM
    segs = ([f"Số HSBT: {ma_ho_so}"] if ma_ho_so else [])
    segs.append(gdv)
    lines.append((segs, 14, False))
    # Chỉ loại "chitiet" mới có tiền tố "Địa điểm tại Gara"
    lines.append(([f"Địa điểm tại Gara : {ga_ra}" if loai == "chitiet" else ga_ra], 15, False))

    # Canh giữa dọc trong header.
    # spacing tính bằng POINT (không phải mm) cho khớp hằng `C.LINE_SP` của index.html.
    # Header chỉ còn 20mm (~56.7pt); khối 3 dòng (15+14+15) vừa khung nên fit = 1,
    # nhưng vẫn giữ công thức co vì số dòng thay đổi theo dữ liệu.
    spacing = HEAD_LINE_SP
    # Chiều cao THỊ GIÁC = khoảng cách giữa các baseline + đỉnh chữ dòng đầu
    # + nét thòng dòng cuối. Chỉ cộng cỡ chữ thì nét thòng dòng cuối sẽ lòi khỏi nền xanh.
    span    = sum(sz + spacing for _, sz, _ in lines[:-1])
    raw_vis = span + ASC * lines[0][1] + DESC * lines[-1][1]
    fit     = min(1.0, (header_h - 2 * HEAD_PAD) / raw_vis)
    spacing *= fit
    start_y = (top_y - header_h / 2) + (raw_vis * fit) / 2 - ASC * lines[0][1] * fit

    seg_gap = _pts(HEAD_SEG_MM)
    for segs, size, bold in lines:
        size *= fit
        c.setFont("BVP-Bold" if bold else "BVP", size)
        _draw_left(c, segs, text_x, start_y, text_w, size, WHITE, bold, seg_gap)
        # Chỉ trừ cỡ chữ dòng hiện tại + spacing — xem CLAUDE.md
        start_y -= (size + spacing)


def _draw_left(c: Canvas, text, x, y, max_w, font_size, color, bold=False, gap=0.0):
    """Vẽ 1 dòng căn TRÁI tại x, tự thu nhỏ rồi cắt bớt nếu vẫn quá rộng.

    `text` nhận 1 chuỗi, hoặc danh sách nhiều **đoạn** nằm trên cùng baseline
    và cách nhau `gap` point (dòng "Số HSBT … GĐV" của header).
    """
    font  = "BVP-Bold" if bold else "BVP"
    parts = [text] if isinstance(text, str) else list(text)
    parts = [" ".join(p.split()) for p in parts if p and p.strip()]
    if not parts:
        return
    gaps_w = gap * (len(parts) - 1)

    def width_at(fs):
        return sum(c.stringWidth(p, font, fs) for p in parts) + gaps_w

    fs = font_size
    while width_at(fs) > max_w and fs > 6:
        fs -= 0.5
    if width_at(fs) > max_w:
        # Vẫn tràn: cắt bớt đoạn cuối
        room = max_w - (width_at(fs) - c.stringWidth(parts[-1], font, fs))
        last = parts[-1]
        while len(last) > 1 and c.stringWidth(last + "…", font, fs) > room:
            last = last[:-1]
        parts[-1] = last + "…"

    c.setFillColor(color)
    c.setFont(font, fs)
    cx = x
    for p in parts:
        c.drawString(cx, y, p)
        cx += c.stringWidth(p, font, fs) + gap


def _draw_shrink(c: Canvas, text: str, x, y, max_w, font_size, color):
    """Vẽ text trên 1 dòng duy nhất, tự thu nhỏ font nếu quá rộng."""
    font = "BVP"
    fs = font_size
    while c.stringWidth(text, font, fs) > max_w and fs > 8:
        fs -= 0.5
    c.setFillColor(color)
    c.setFont(font, fs)
    tw = c.stringWidth(text, font, fs)
    cx = x + (max_w - tw) / 2
    c.drawString(cx, y, text)


def _draw_wrapped(c: Canvas, text: str, x, y, max_w, font_size, color):
    """Vẽ text, tự động xuống dòng nếu quá rộng, căn giữa theo max_w."""
    font = "BVP-Bold" if font_size == 16 else "BVP"
    words = text.split()
    lines, cur = [], ""
    for word in words:
        test = (cur + " " + word).strip()
        if c.stringWidth(test, font, font_size) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)

    c.setFillColor(color)
    for line in lines:
        line_w = c.stringWidth(line, font, font_size)
        cx = x + (max_w - line_w) / 2
        c.setFont(font, font_size)
        c.drawString(cx, y, line)
        y -= font_size + _pts(1)


def draw_footer(c: Canvas, page_w, page_num: int, phong: str = "", total_pages: int = 0):
    """Vẽ footer: tên Phòng/khu vực bên trái, "số trang/tổng số trang" bên phải.

    Cỡ chữ FOOTER_FS = 2/3 của 13pt — giữ khớp hằng `C.FOOTER_FS` của index.html.
    """
    margin  = _pts(MARGIN_MM)
    footer_y = margin / 2

    c.setFont("BVP", FOOTER_FS)
    c.setFillColor(GRAY_FOOTER)
    c.drawString(margin, footer_y, phong or PHONG_DEFAULT)

    c.setFillColor(BLUE_HEADER)
    page_text = f"{page_num}/{total_pages}" if total_pages else str(page_num)
    c.drawRightString(page_w - margin, footer_y, page_text)


def draw_image_grid(c: Canvas, page_w, page_h, images_captions: list,
                    cols: int, rows: int):
    """
    Vẽ lưới ảnh vào vùng còn lại (dưới header, trên footer).
    images_captions: list of (filepath, caption, rot, so_thu_tu) — đúng số lượng cho 1 trang.
    """
    margin     = _pts(MARGIN_MM)
    header_h   = _pts(HEADER_H_MM)
    header_gap = _pts(HEADER_GAP_MM)
    footer_h   = _pts(FOOTER_H_MM)
    caption_h  = _pts(CAPTION_H_MM)
    gap        = _pts(GAP_MM)

    area_x = margin
    area_y = margin + footer_h
    area_w = page_w - 2 * margin
    # header dán sát mép trên nên chỉ còn lề dưới
    area_h = page_h - header_h - header_gap - margin - footer_h

    cell_w = (area_w - (cols - 1) * gap) / cols
    cell_h = (area_h - (rows - 1) * gap) / rows
    img_h  = cell_h - caption_h

    for idx, (fpath, caption, rot, cap_no) in enumerate(images_captions):
        caption = f"{cap_no}. {caption}" if cap_no else caption
        col = idx % cols
        row = idx // cols
        cell_x = area_x + col * (cell_w + gap)
        cell_y = page_h - header_h - header_gap - row * (cell_h + gap) - cell_h

        # Vẽ viền grid
        c.setStrokeColor(colors.HexColor("#BDBDBD"))
        c.setLineWidth(0.5)
        c.rect(cell_x, cell_y, cell_w, cell_h, fill=0, stroke=1)

        # Ảnh với bo góc — thu vừa khung (contain), canh giữa, KHÔNG cắt mép
        try:
            img = Image.open(fpath)
            # Thứ tự bắt buộc: EXIF → góc xoay người dùng. Không tự xoay ngang nữa:
            # chiều ảnh in ra phải đúng chiều người dùng thấy / đã chọn.
            img = ImageOps.exif_transpose(img)
            if rot:
                img = img.rotate(-rot, expand=True)   # PIL xoay ngược chiều kim đồng hồ
            if not img.width or not img.height:
                raise ValueError("ảnh rỗng")

            # Khung vẽ (point): thu vừa ô ảnh, giữ nguyên tỷ lệ
            k = min(cell_w / img.width, img_h / img.height)
            draw_w, draw_h = img.width * k, img.height * k

            # Lấy mẫu 3× cho nét khi in, nhưng không phóng to quá ảnh gốc
            px_w = max(1, int(min(img.width,  draw_w * 3)))
            px_h = max(1, int(round(px_w * img.height / img.width)))
            img = img.resize((px_w, px_h), Image.LANCZOS)

            corner_r = max(4, int(min(px_w, px_h) * CORNER_RADIUS_PCT))
            img = round_corners(img, corner_r)

            # Đưa thẳng vào PDF qua bộ nhớ — tránh lỗi cache theo đường dẫn file
            buf = _bytesio.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            draw_x = cell_x + (cell_w - draw_w) / 2
            draw_y = cell_y + caption_h + (img_h - draw_h) / 2
            c.drawImage(ImageReader(buf), draw_x, draw_y, draw_w, draw_h, mask="auto")
        except Exception as e:
            print(f"  Lỗi vẽ ảnh {fpath}: {e}", file=sys.stderr)

        # Caption nền xanh
        c.setFillColor(BLUE_CAPTION)
        c.rect(cell_x, cell_y, cell_w, caption_h, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("BVP", 14)
        cap_w = c.stringWidth(caption, "BVP", 14)
        # Thu nhỏ nếu cần
        font_size = 14
        while cap_w > cell_w - _pts(2) and font_size > 8:
            font_size -= 0.5
            cap_w = c.stringWidth(caption, "BVP", font_size)
        c.setFont("BVP", font_size)
        cap_x = cell_x + (cell_w - cap_w) / 2
        cap_y = cell_y + (caption_h - font_size * 0.8) / 2
        c.drawString(cap_x, cap_y, caption)


# ── Tạo PDF ───────────────────────────────────────────────────────────────────

def create_pdf(pages: list, gdv: str, bks: str, ga_ra: str, output_path: str,
               ngay: str = "", loai: str = "chitiet", ma_ho_so: str = "", phong: str = ""):
    """
    Tạo PDF từ danh sách trang do build_pages() dựng sẵn.
    Mỗi trang tự mang khổ giấy và lưới riêng nên loại "giayto" trộn được
    trang ngang và trang dọc trong cùng một file.
    """
    if not pages:
        sys.exit("Không có trang nào để xuất.")

    register_fonts()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Khổ giấy của trang đầu; từng trang sau đặt lại bằng setPageSize
    c = Canvas(output_path, pagesize=pages[0]["size"])
    total_imgs = 0

    for i, pg in enumerate(pages):
        page_w, page_h = pg["size"]
        c.setPageSize(pg["size"])
        draw_header(c, page_w, page_h, bks, ga_ra, gdv, ngay, loai, ma_ho_so)
        draw_footer(c, page_w, i + 1, phong, len(pages))
        draw_image_grid(c, page_w, page_h, pg["cells"], pg["cols"], pg["rows"])
        total_imgs += len(pg["cells"])
        if i < len(pages) - 1:
            c.showPage()

    c.save()
    print(f"Đã tạo PDF: {output_path}  ({len(pages)} trang, {total_imgs} ảnh)")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Ghép ảnh giám định xe ô tô vào khung A4 PDF."
    )
    parser.add_argument("--gdv", required=True,
                        help="Tên giám định viên, ví dụ: \"Nguyễn Văn A\"")
    parser.add_argument("--layout", choices=["doc", "ngang"], default="doc",
                        help="doc = dọc 6 ảnh/trang; ngang = ngang 4 ảnh/trang")
    parser.add_argument("--output", default=None,
                        help="Đường dẫn file PDF đầu ra (tùy chọn)")
    parser.add_argument("--ngay", default="",
                        help="Ngày giám định, ví dụ: \"06/06/2026\"")
    parser.add_argument("--bks", default="",
                        help="Biển kiểm soát xe (nếu không muốn đọc từ Excel)")
    parser.add_argument("--gara", default="",
                        help="Tên ga-ra / địa điểm (nếu không muốn đọc từ Excel)")
    parser.add_argument("--loai", choices=["chitiet", "hientruong", "giayto", "xacminh"],
                        default="chitiet",
                        help="Loại bản ảnh: chitiet | hientruong | giayto | xacminh")
    parser.add_argument("--so-anh", type=int, default=None, dest="so_anh",
                        help="Số ảnh trên mỗi trang. "
                             "doc: 1,2,3,4,6,8,9,12 (mặc định 6); "
                             "ngang: 1,2,4,6,8,9 (mặc định 4). "
                             "Với --loai giayto chỉ áp dụng cho ảnh không có tiền tố số.")
    parser.add_argument("--ma-ho-so", default="", dest="ma_ho_so",
                        help="Số HSBT / mã hồ sơ — in trên tiêu đề bản ảnh và đặt tên file PDF")
    # --thuyet-minh giữ lại làm tên cũ cho các script/bat đã viết trước đây
    parser.add_argument("--chu-thich", "--thuyet-minh", choices=["hang-muc", "ten-file"],
                        default="hang-muc", dest="thuyet_minh",
                        help="Nguồn chú thích ảnh: hang-muc = tên thư mục hạng mục (mặc định) "
                             "hoặc ten-file = tên file ảnh")
    parser.add_argument("--phong", default=PHONG_DEFAULT,
                        help="Tên Phòng / khu vực giám định — in ở chân mỗi trang bản ảnh")
    parser.add_argument("--captions", default="",
                        help="File JSON {\"tên file\": \"chú thích\"} ghi đè chú thích từng ảnh")
    args = parser.parse_args()

    per_page = args.so_anh or PERPAGE_DEFAULT[args.layout]
    if per_page not in GRID[args.layout]:
        if args.loai == "giayto":   # chỉ dùng cho ảnh không tiền tố — lặng lẽ về mặc định
            per_page = PERPAGE_DEFAULT[args.layout]
        else:
            hop_le = ", ".join(str(k) for k in sorted(GRID[args.layout]))
            sys.exit(f"--so-anh {per_page} không hợp lệ cho layout {args.layout}. "
                     f"Giá trị hợp lệ: {hop_le}")

    bks, ga_ra = get_bks_garage()
    if args.bks:
        bks = args.bks
    if args.gara:
        ga_ra = args.gara
    if not bks:
        bks = input("Nhập biển số xe (BKS): ").strip()
    if not ga_ra:
        ga_ra = input("Nhập tên ga-ra / địa điểm: ").strip()

    entries = load_images_with_captions(thuyet_minh=args.thuyet_minh,
                                        captions_file=args.captions)
    if not entries:
        sys.exit("Không tìm thấy ảnh trong thư mục renamed/.")

    pages = build_pages(entries, args.loai, args.layout, per_page)

    print(f"  Kiểu bản ảnh: {LOAI_GD_MAP[args.loai]}")
    if args.loai == "giayto":
        print("  Bố cục:       tự động theo tiền tố số · ảnh không tiền tố: "
              f"A4 {'dọc' if args.layout == 'doc' else 'ngang'} · {per_page} ảnh/trang")
    else:
        cols, rows = GRID[args.layout][per_page]
        print(f"  Bố cục:       A4 {'dọc' if args.layout == 'doc' else 'ngang'} · "
              f"{per_page} ảnh/trang · {cols} × {rows}")
    if args.loai == "chitiet":
        n_cover = sum(1 for e in entries if e[0] and e[0][0] == 0)
        print(f"  Ảnh nhận dạng xe (trang 1): {n_cover} ảnh")
        print(f"  Ảnh hạng mục (trang 2+):    {len(entries) - n_cover} ảnh")
    else:
        print(f"  Tổng số ảnh:  {len(entries)} ảnh")
    print(f"  Số trang:     {len(pages)} trang")

    tag = re.sub(r"[^\w\-]+", "_", args.ma_ho_so or bks).strip("_") or "ban_anh"
    out_name = args.output or os.path.join(
        OUTPUT_DIR, f"BanAnh_{args.loai}_{tag}.pdf"
    )

    create_pdf(pages, args.gdv, bks, ga_ra, out_name, args.ngay, args.loai,
               args.ma_ho_so, args.phong)


if __name__ == "__main__":
    main()
