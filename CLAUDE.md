# Dự án: Ảnh Giám Định Xe Theo Tên File

## Mục đích
Ghép ảnh hiện trường xe ô tô thành file PDF khổ A4 chuẩn cho Phòng Giám định và Cứu hộ tại Quảng Ninh.  
Quy trình 2 giai đoạn: **đặt tên file** → **ghép ảnh thành PDF**.

---

## Cấu trúc thư mục

```
anh-giam-dinh-vcx-theo-ten-file/
├── input/                        ← ảnh gốc + file báo giá
│   ├── 0. Số khung xe/           ← ảnh nhận dạng xe (prefix 0)
│   ├── 0. Tem đăng kiểm/
│   ├── 1. Cốp sau lõm bẹp/       ← ảnh hạng mục (prefix 1, 2, 3...)
│   ├── 2. Can sau trái bẹp lõm/
│   ├── Bao_gia.xlsx              ← nguồn BKS + tên ga-ra (nếu có)
│   └── Bao-gia.jpg               ← ảnh chụp báo giá → Gemini Vision OCR tự động đọc BKS + ga-ra
├── renamed/                      ← ảnh đã đổi tên (do dat_ten_file.py tạo)
│   └── mapping.json              ← tên file → tên thư mục gốc (caption)
├── output/                       ← PDF kết xuất
├── assets/logo-ptisos.png
├── fonts/BeVietnamPro-Regular.ttf
├── fonts/BeVietnamPro-Bold.ttf
├── dat_ten_file.py               ← Giai đoạn 1
├── ghep_anh.py                   ← Giai đoạn 2
├── chay_doc.bat                  ← Chạy nhanh layout dọc
├── chay_ngang.bat                ← Chạy nhanh layout ngang
└── requirements.txt
```

---

## Giai đoạn 1 — dat_ten_file.py

**Chạy:** `python dat_ten_file.py`

**Logic đặt tên:**
- Quét thư mục con trong `input/` có dạng `{số}. {tên hạng mục}`
- Sao chép ảnh sang `renamed/` với tên mới: `{tên thư mục}_{thứ tự}.{ext}`
  - Ví dụ: `1. Cốp sau lõm bẹp_1.jpg`, `1. Cốp sau lõm bẹp_2.jpg`
- **Tự động xóa sạch** `renamed/` trước mỗi lần chạy (tránh file cũ gây lỗi)
- Lưu `renamed/mapping.json`: `{ "tên file mới": "tên thư mục gốc" }`

---

## Giai đoạn 2 — ghep_anh.py

**Chạy:**
```
python ghep_anh.py --gdv "Tên GĐV" --layout doc                          # dọc, 6 ảnh/trang
python ghep_anh.py --gdv "Tên GĐV" --layout ngang                        # ngang, 4 ảnh/trang
python ghep_anh.py --gdv "Tên GĐV" --layout doc --ngay "06/06/2026"      # có ngày giám định
python ghep_anh.py --gdv "Tên GĐV" --layout doc --output output/ten_file.pdf
```

**Tham số:**
- `--gdv` *(bắt buộc)*: Tên giám định viên
- `--layout`: `doc` (mặc định) hoặc `ngang`
- `--ngay` *(tùy chọn)*: Ngày giám định, ví dụ `"06/06/2026"` — hiển thị cùng dòng GĐV
- `--output` *(tùy chọn)*: Đường dẫn file PDF đầu ra
- `--bks` *(tùy chọn)*: Biển kiểm soát xe — truyền thẳng thay vì đọc từ Excel
- `--gara` *(tùy chọn)*: Tên ga-ra / địa điểm — truyền thẳng thay vì đọc từ Excel

**Logic phân trang:**
- **Trang 1** (trang nhận dạng xe): chỉ chứa ảnh prefix `0.` (Số khung, Tem đăng kiểm) — xuất hiện 1 lần duy nhất
- **Trang 2 trở đi**: ảnh hạng mục prefix `1.` → `2.` → `3.`... ghép liên tục không ngắt quãng

**Kỹ thuật quan trọng:**
- Ảnh đưa vào PDF qua `BytesIO + ImageReader` (KHÔNG dùng tmp file) để tránh lỗi ReportLab cache ảnh theo đường dẫn file — nếu dùng tmp file cùng tên, ảnh trang 1 sẽ lặp lại ở tất cả các trang sau.

---

## Thông số thiết kế PDF

| Tham số | Giá trị |
|---|---|
| Font | Be Vietnam Pro (Regular + Bold) |
| Màu header | `#1565C0` (xanh blue đậm) |
| Màu caption | `#1565C0` nền, chữ trắng |
| Chiều cao header | `28mm` (= 35mm × 0.8, giảm 20%) |
| Khoảng trắng header→ảnh | `3mm` |
| Logo PTI SOS | `23mm × 23mm`, góc trái header |
| Bố cục dọc | Portrait A4, grid 2×3, 6 ảnh/trang |
| Bố cục ngang | Landscape A4, grid 2×2, 4 ảnh/trang |
| Bo góc ảnh | 4% chiều rộng ô ảnh |
| Khoảng cách ô ảnh | `2mm` |
| Lề | `8mm` |
| Footer | Tên phòng (xám trái) + số trang (xanh phải), size 13pt |
| Caption | size 14pt, tự thu nhỏ nếu tràn |

---

## Tiêu đề header

```
Giám định chi tiết xe ô tô biển kiểm soát : {bks}        ← 16pt Bold
Địa điểm tại {ga_ra}                                      ← 15pt
{tên giám định viên}  —  Ngày: {ngày giám định}           ← 14pt
```

- `{bks}` và `{ga_ra}` đọc tự động từ `input/Bao_gia.xlsx` → `docs/thong_tin_giam_dinh_xe.xlsx`  
  Nếu **chỉ có ảnh báo giá** (`Bao-gia.jpg`): Gemini Vision OCR tự động đọc — không cần truyền `--bks`/`--gara` thủ công
- `{tên giám định viên}` truyền qua tham số `--gdv`
- `{ngày giám định}` truyền qua tham số `--ngay` (tùy chọn, nếu bỏ qua chỉ hiện tên GĐV)

**Lưu ý vị trí dòng trong `draw_header`:** Mỗi bước dịch chuyển `start_y` chỉ trừ `font_size_dòng_hiện_tại + spacing`, không trừ thêm font size dòng tiếp theo. Sai công thức sẽ đẩy dòng 2–3 ra ngoài khung header (không hiển thị).

---

## Cách dùng nhanh (double-click)

- **`chay_doc.bat`**: layout dọc 6 ảnh/trang — nhập tên GĐV → Enter
- **`chay_ngang.bat`**: layout ngang 4 ảnh/trang — nhập tên GĐV → Enter

Sau khi chạy xong, thư mục `output/` tự mở.

---

## Làm lại hồ sơ mới

```powershell
# Xóa dữ liệu cũ (renamed/ tự xóa khi chạy dat_ten_file.py)
Remove-Item output\*.pdf -Force

# Đặt ảnh mới vào input/, cập nhật Bao_gia.xlsx nếu cần

# Chạy 2 bước
python dat_ten_file.py
python ghep_anh.py --gdv "Tên GĐV" --layout doc --ngay "DD/MM/YYYY"
```

---

## Dependencies

```
Pillow>=10.0
reportlab>=4.0
openpyxl>=3.1
python-docx>=1.1
```

Cài: `pip install -r requirements.txt`
