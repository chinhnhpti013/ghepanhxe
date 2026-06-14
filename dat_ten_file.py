# -*- coding: utf-8 -*-
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
"""
Giai đoạn 1: Đặt tên file ảnh theo tên thư mục chứa ảnh.

Tên file mới: "{tên thư mục}_{thứ tự}.{ext}"
  Ví dụ:  "1. Cốp sau lõm bẹp_1.jpg"
          "1. Cốp sau lõm bẹp_2.jpg"
          "0. Số khung xe_1.jpg"

- Thư mục renamed/ được xóa sạch trước mỗi lần chạy để tránh file cũ.
- File mapping.json lưu ánh xạ tên mới → tên thư mục (dùng cho giai đoạn 2).
"""

import os
import re
import shutil
import json

INPUT_DIR   = "input"
RENAMED_DIR = "renamed"
MAPPING_FILE = os.path.join(RENAMED_DIR, "mapping.json")
IMAGE_EXTS  = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def get_folder_prefix(folder_name: str):
    """Lấy số đứng đầu của tên thư mục, ví dụ '1. Cốp sau' → 1."""
    m = re.match(r"^(\d+)", folder_name.strip())
    return int(m.group(1)) if m else None


def safe_filename(name: str) -> str:
    """Thay các ký tự không hợp lệ trong tên file Windows bằng '_'."""
    return re.sub(r'[\\/:*?"<>|]', '_', name)


def rename_images(input_dir: str = INPUT_DIR, renamed_dir: str = RENAMED_DIR) -> None:
    # Xóa thư mục renamed cũ để tránh file thừa từ lần chạy trước
    if os.path.exists(renamed_dir):
        shutil.rmtree(renamed_dir)
    os.makedirs(renamed_dir)

    # Lấy danh sách thư mục con, sắp xếp theo (số đứng đầu, tên thư mục)
    subfolders = []
    for entry in os.scandir(input_dir):
        if entry.is_dir():
            prefix = get_folder_prefix(entry.name)
            if prefix is not None:
                subfolders.append((prefix, entry.name, entry.path))
    subfolders.sort(key=lambda x: (x[0], x[1]))

    if not subfolders:
        print("Không tìm thấy thư mục hạng mục nào trong", input_dir)
        return

    mapping = {}  # new_filename → folder_name (caption)

    for prefix_int, folder_name, folder_path in subfolders:
        # Lấy danh sách ảnh, sắp xếp theo tên gốc
        images = sorted(
            [f for f in os.listdir(folder_path)
             if os.path.splitext(f)[1].lower() in IMAGE_EXTS]
        )

        if not images:
            print(f"  [{folder_name}] → không có ảnh, bỏ qua.")
            continue

        safe_folder = safe_filename(folder_name)

        for idx, img_name in enumerate(images, start=1):
            ext = os.path.splitext(img_name)[1].lower()
            new_name = f"{safe_folder}_{idx}{ext}"
            src = os.path.join(folder_path, img_name)
            dst = os.path.join(renamed_dir, new_name)
            shutil.copy2(src, dst)
            mapping[new_name] = folder_name   # caption = tên thư mục gốc
            print(f"  {img_name}  ->  {new_name}")

        print(f"  [{folder_name}]: {len(images)} anh")

    # Lưu mapping
    with open(MAPPING_FILE, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    print(f"\nDa doi ten {len(mapping)} anh. Mapping: {MAPPING_FILE}")


if __name__ == "__main__":
    input_dir   = sys.argv[1] if len(sys.argv) > 1 else INPUT_DIR
    renamed_dir = sys.argv[2] if len(sys.argv) > 2 else RENAMED_DIR
    rename_images(input_dir, renamed_dir)
