# -*- coding: utf-8 -*-
import io as _io, sys as _sys
_sys.stdout = _io.TextIOWrapper(_sys.stdout.buffer, encoding='utf-8', errors='replace')
"""
Giai đoạn 2: Ghép ảnh đã đặt tên vào khung A4 PDF.

Cách dùng:
  python ghep_anh.py --gdv "Nguyễn Văn A" --layout doc
  python ghep_anh.py --gdv "Trần Thị B"   --layout ngang

  --layout doc   : Portrait A4, grid 2×3, 6 ảnh/trang
  --layout ngang : Landscape A4, grid 2×2, 4 ảnh/trang

Đọc thông tin BKS và ga-ra từ input/Bao_gia.xlsx (hoặc docs/thong_tin_giam_dinh_xe.xlsx).
Ảnh lấy từ renamed/  với mapping trong renamed/mapping.json.
Kết quả PDF xuất ra output/.
"""

import argparse
import json
import math
import os
import re
import sys

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
THONG_TIN_PATH = "docs/thong_tin_giam_dinh_xe.xlsx"

# ── Màu sắc ───────────────────────────────────────────────────────────────────
BLUE_HEADER   = colors.HexColor("#1565C0")
BLUE_CAPTION  = colors.HexColor("#1565C0")
GRAY_FOOTER   = colors.HexColor("#757575")
WHITE         = colors.white

# ── Kích thước layout ─────────────────────────────────────────────────────────
LOGO_SIZE_MM  = 23          # logo 2.3 cm × 2.3 cm
HEADER_H_MM   = 28          # chiều cao header = 35mm × 0.8 (giảm 20%)
HEADER_GAP_MM = 3           # khoảng trắng giữa header và hàng ảnh đầu tiên
FOOTER_H_MM   = 8
CAPTION_H_MM  = 7
GAP_MM        = 2           # khoảng cách giữa các ô ảnh
MARGIN_MM     = 8           # lề xung quanh
CORNER_RADIUS_PCT = 0.04    # bo góc = 4% chiều rộng ô ảnh

# ── Fonts ─────────────────────────────────────────────────────────────────────

def register_fonts():
    pdfmetrics.registerFont(TTFont("BVP",     FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("BVP-Bold", FONT_BOLD))


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


def get_bks_garage() -> tuple[str, str]:
    candidates = [BAO_GIA_PATH, THONG_TIN_PATH]
    # Thêm mọi file .xlsx trong input/ vào danh sách ứng viên
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
    return "", ""


# ── Đọc danh sách ảnh ────────────────────────────────────────────────────────

def load_images_with_captions(renamed_dir: str = RENAMED_DIR):
    """
    Trả về (cover_list, main_list):
      cover_list : ảnh prefix 0 (Số khung, Tem đăng kiểm...) — trang nhận dạng xe
      main_list  : ảnh hạng mục prefix >= 1 — ghép liên tục từ trang 2 trở đi
    Mỗi phần tử là (filepath, caption), sắp xếp tăng dần.
    """
    if not os.path.exists(MAPPING_FILE):
        sys.exit(f"Không tìm thấy {MAPPING_FILE}. Hãy chạy dat_ten_file.py trước.")

    with open(MAPPING_FILE, encoding="utf-8") as f:
        mapping: dict = json.load(f)

    IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    def sort_key(name: str):
        stem = os.path.splitext(name)[0]
        m = re.match(r"^(\d+)\.\s*(.*?)_(\d+)$", stem)
        if m:
            return (int(m.group(1)), m.group(2).lower(), int(m.group(3)))
        parts = re.split(r"(\d+)", stem)
        return tuple(int(p) if p.isdigit() else p.lower() for p in parts if p)

    def file_prefix(name: str) -> int:
        m = re.match(r"^(\d+)\.", os.path.splitext(name)[0])
        return int(m.group(1)) if m else 999

    entries = []
    for fname, caption in mapping.items():
        fpath = os.path.join(renamed_dir, fname)
        if os.path.exists(fpath) and os.path.splitext(fname)[1].lower() in IMAGE_EXTS:
            entries.append((fname, fpath, caption))

    entries.sort(key=lambda e: sort_key(e[0]))

    cover = [(fp, cap) for fn, fp, cap in entries if file_prefix(fn) == 0]
    main  = [(fp, cap) for fn, fp, cap in entries if file_prefix(fn) > 0]
    return cover, main


# ── Bo góc ảnh ────────────────────────────────────────────────────────────────

def round_corners(img: Image.Image, radius: int) -> Image.Image:
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), img.size], radius=radius, fill=255)
    img.putalpha(mask)
    return img


def fit_image_landscape(img: Image.Image) -> Image.Image:
    """Xoay ảnh nếu cần để luôn đặt ngang (width >= height)."""
    if img.width < img.height:
        img = img.rotate(90, expand=True)
    return img


# ── Vẽ trang PDF ─────────────────────────────────────────────────────────────

def _pts(mm_val):
    return mm_val * mm


LOAI_GD_MAP = {
    "chitiet":    "Giám định chi tiết xe ô tô biển kiểm soát",
    "hientruong": "Giám định hiện trường xe ô tô biển kiểm soát",
    "giayto":     "Giám định giấy tờ xe ô tô biển kiểm soát",
}


def draw_header(c: Canvas, page_w, page_h, bks: str, ga_ra: str, gdv: str,
                ngay: str = "", loai: str = "chitiet"):
    """Vẽ header: logo trái + tiêu đề giữa."""
    logo_size = _pts(LOGO_SIZE_MM)
    margin    = _pts(MARGIN_MM)
    header_h  = _pts(HEADER_H_MM)
    top_y     = page_h - margin

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
    text_x = margin + logo_size + _pts(3)
    text_w = page_w - text_x - margin
    c.setFillColor(WHITE)

    # Dòng 1: loại giám định + BKS  (16pt bold)
    prefix_loai = LOAI_GD_MAP.get(loai, LOAI_GD_MAP["chitiet"])
    line1 = f"{prefix_loai} : {bks}"

    # Dòng 2: Ga-ra  (15pt)
    c.setFont("BVP", 15)
    line2 = f"Địa điểm tại Gara : {ga_ra}"

    # Dòng 3: GĐV + ngày  (14pt)
    line3 = f"{gdv}  —  Ngày: {ngay}" if ngay else gdv

    # Canh giữa dọc trong header
    spacing = _pts(2)
    total_text_h = 16 + spacing + 15 + spacing + 14
    start_y = top_y - (header_h - total_text_h) / 2 - 16

    c.setFont("BVP-Bold", 16)
    _draw_wrapped(c, line1, text_x, start_y, text_w, 16, WHITE)

    start_y -= (16 + spacing)
    c.setFont("BVP", 15)
    _draw_wrapped(c, line2, text_x, start_y, text_w, 15, WHITE)

    start_y -= (15 + spacing)
    c.setFont("BVP", 14)
    _draw_wrapped(c, line3, text_x, start_y, text_w, 14, WHITE)


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


def draw_footer(c: Canvas, page_w, page_num: int):
    """Vẽ footer: tên phòng bên trái, số trang bên phải."""
    margin  = _pts(MARGIN_MM)
    footer_y = margin / 2

    c.setFont("BVP", 13)
    c.setFillColor(GRAY_FOOTER)
    c.drawString(margin, footer_y, "Phòng Giám định và Cứu hộ tại Quảng Ninh")

    c.setFillColor(BLUE_HEADER)
    page_text = str(page_num)
    c.drawRightString(page_w - margin, footer_y, page_text)


def draw_image_grid(c: Canvas, page_w, page_h, images_captions: list,
                    cols: int, rows: int):
    """
    Vẽ lưới ảnh vào vùng còn lại (dưới header, trên footer).
    images_captions: list of (filepath, caption) — đúng số lượng cho 1 trang.
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
    area_h = page_h - header_h - header_gap - 2 * margin - footer_h

    cell_w = (area_w - (cols - 1) * gap) / cols
    cell_h = (area_h - (rows - 1) * gap) / rows
    img_h  = cell_h - caption_h

    for idx, (fpath, caption) in enumerate(images_captions):
        col = idx % cols
        row = idx // cols
        cell_x = area_x + col * (cell_w + gap)
        cell_y = page_h - margin - header_h - header_gap - row * (cell_h + gap) - cell_h

        # Vẽ viền grid
        c.setStrokeColor(colors.HexColor("#BDBDBD"))
        c.setLineWidth(0.5)
        c.rect(cell_x, cell_y, cell_w, cell_h, fill=0, stroke=1)

        # Ảnh với bo góc
        try:
            img = Image.open(fpath)
            img = fit_image_landscape(img)
            img = ImageOps.exif_transpose(img)
            # Scale vừa khít vùng ảnh (giữ tỉ lệ)
            target_w = int(cell_w * 3)   # over-sample for quality
            target_h = int(img_h * 3)
            img.thumbnail((target_w, target_h), Image.LANCZOS)
            # Crop để fill toàn bộ ô
            img_ratio = img.width / img.height
            cell_ratio = cell_w / img_h
            if img_ratio > cell_ratio:
                new_h = img.height
                new_w = int(new_h * cell_ratio)
                left = (img.width - new_w) // 2
                img = img.crop((left, 0, left + new_w, new_h))
            else:
                new_w = img.width
                new_h = int(new_w / cell_ratio)
                top = (img.height - new_h) // 2
                img = img.crop((0, top, new_w, top + new_h))

            corner_r = max(8, int(img.width * CORNER_RADIUS_PCT))
            img = round_corners(img, corner_r)

            # Đưa thẳng vào PDF qua bộ nhớ — tránh lỗi cache theo đường dẫn file
            buf = _bytesio.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            c.drawImage(ImageReader(buf), cell_x, cell_y + caption_h, cell_w, img_h,
                        mask="auto")
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

def create_pdf(cover_images: list, main_images: list, layout: str, gdv: str,
               bks: str, ga_ra: str, output_path: str, ngay: str = "", loai: str = "chitiet"):
    """
    Tạo PDF theo 2 nhóm ảnh:
      cover_images : ảnh prefix 0 (Số khung, Tem đăng kiểm) — 1 trang đầu riêng biệt
      main_images  : ảnh hạng mục prefix >= 1 — ghép liên tục, không lặp lại cover
    """
    if layout == "ngang":
        page_size = landscape(A4)
        cols, rows = 2, 2
        per_page = 4
    else:  # doc
        page_size = A4
        cols, rows = 2, 3
        per_page = 6

    page_w, page_h = page_size

    register_fonts()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    c = Canvas(output_path, pagesize=page_size)
    page_num = 0

    # ── Trang 1: ảnh nhận dạng xe (prefix 0) ──────────────────────────────────
    if cover_images:
        page_num += 1
        draw_header(c, page_w, page_h, bks, ga_ra, gdv, ngay, loai)
        draw_footer(c, page_w, page_num)
        draw_image_grid(c, page_w, page_h, cover_images, cols, rows)
        c.showPage()

    # ── Trang 2+: ảnh hạng mục ghép liên tục ─────────────────────────────────
    n_main_pages = math.ceil(len(main_images) / per_page) if main_images else 0

    for i in range(n_main_pages):
        page_num += 1
        chunk = main_images[i * per_page: (i + 1) * per_page]
        draw_header(c, page_w, page_h, bks, ga_ra, gdv, ngay, loai)
        draw_footer(c, page_w, page_num)
        draw_image_grid(c, page_w, page_h, chunk, cols, rows)
        if i < n_main_pages - 1:
            c.showPage()

    c.save()
    total = len(cover_images) + len(main_images)
    print(f"Đã tạo PDF: {output_path}  ({page_num} trang, {total} ảnh)")


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
    parser.add_argument("--loai", choices=["chitiet", "hientruong", "giayto"],
                        default="chitiet",
                        help="Loại giám định: chitiet | hientruong | giayto")
    args = parser.parse_args()

    bks, ga_ra = get_bks_garage()
    if args.bks:
        bks = args.bks
    if args.gara:
        ga_ra = args.gara
    if not bks:
        bks = input("Nhập biển số xe (BKS): ").strip()
    if not ga_ra:
        ga_ra = input("Nhập tên ga-ra / địa điểm: ").strip()

    cover_images, main_images = load_images_with_captions()
    if not cover_images and not main_images:
        sys.exit("Không tìm thấy ảnh trong thư mục renamed/.")

    print(f"  Ảnh nhận dạng xe (trang 1): {len(cover_images)} ảnh")
    print(f"  Ảnh hạng mục (trang 2+):    {len(main_images)} ảnh")

    safe_bks = re.sub(r"[^\w\-]", "_", bks)
    out_name = args.output or os.path.join(
        OUTPUT_DIR, f"giam_dinh_{safe_bks}_{args.layout}.pdf"
    )

    create_pdf(cover_images, main_images, args.layout, args.gdv, bks, ga_ra, out_name, args.ngay, args.loai)


if __name__ == "__main__":
    main()
