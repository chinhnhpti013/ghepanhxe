# Dự án: Ảnh Giám Định Xe Theo Tên File

## Mục đích
Ghép ảnh hiện trường xe ô tô thành file PDF khổ A4 chuẩn cho Phòng Cứu hộ & Giám định tại khu vực Quảng Ninh.

Có **2 cách dùng song song**, cùng một bố cục PDF:
- **Web app `index.html`** (v2.0) — khuyến nghị. Chạy hoàn toàn trong trình duyệt, không cần cài Python.
- **Script Python** — chạy offline bằng dòng lệnh, quy trình 2 giai đoạn: đặt tên file → ghép ảnh.

---

## Cấu trúc thư mục

```
anh-giam-dinh-vcx-theo-ten-file/
├── index.html                    ← WEB APP v2.0 (toàn bộ UI + logic trong 1 file)
├── input/                        ← ảnh gốc + file báo giá (CHỈ dùng cho luồng Python)
│   ├── 0. Số khung xe/           ← ảnh nhận dạng xe (prefix 0)
│   ├── 1. Cốp sau lõm bẹp/       ← ảnh hạng mục (prefix 1, 2, 3...)
│   ├── Bao_gia.xlsx              ← nguồn BKS + tên ga-ra (chỉ luồng Python)
│   └── Bao-gia.jpg               ← ảnh báo giá → Gemini Vision OCR (chỉ luồng Python)
├── renamed/                      ← ảnh đã đổi tên (do dat_ten_file.py tạo)
│   └── mapping.json              ← tên file → tên thư mục gốc (thuyết minh)
├── output/                       ← PDF kết xuất
├── assets/logo-ptisos.png
├── fonts/BeVietnamPro-{Regular,Bold}.ttf
├── dat_ten_file.py               ← Giai đoạn 1 (Python)
├── ghep_anh.py                   ← Giai đoạn 2 (Python)
├── chay_doc.bat / chay_ngang.bat ← chạy nhanh bằng double-click
├── build.sh                      ← (không còn tác dụng) inject GEMINI_API_KEY cho web app
└── requirements.txt
```

---

## Web app — `index.html` (v2.0)

File HTML đơn, không cần build. Phải mở qua **địa chỉ web** (GitHub Pages / Render / `python -m http.server`),
**không mở trực tiếp bằng `file://`** — vì cần `fetch()` font tiếng Việt và logo.

Thư viện CDN: `pdf-lib` + `@pdf-lib/fontkit` (dựng PDF). Không dùng thư viện nào khác.

> **Web app không có OCR báo giá.** BKS và tên ga-ra nhập tay ở đầu bước 1.
> Gemini Vision OCR và đọc `Bao_gia.xlsx` **chỉ còn ở luồng Python** (`get_bks_garage()` trong `ghep_anh.py`).
> `build.sh` / biến `GEMINI_API_KEY` trên Render không còn tác dụng với web app.

### Quy trình 2 bước

**Bước 1 — Lập bản ảnh** (một cột, toàn chiều rộng; thông tin ở trên cùng rồi tới ảnh)

*Thẻ "Thông tin giám định"* xếp gọn theo 4 hàng:
1. Kiểu bản ảnh (4 loại) — toàn chiều rộng
2. Số HSBT / Mã hồ sơ · Biển kiểm soát · Ngày giám định *(3 cột)*
3. Tên ga-ra / Địa điểm · Giám định viên · **Phòng / Khu vực giám định** *(3 cột)*
4. Bố cục A4 dọc/ngang · Số ảnh trên mỗi trang *(2 cột cạnh nhau)*

Dưới cùng thẻ là khối **xem trước tiêu đề bản in** (`#loaiPreview`) — hiện đúng các dòng
sẽ in lên đầu mỗi trang PDF, cập nhật ngay khi gõ.

Ngày giám định dùng **một ô chọn ngày** (`#fNgayPick`) + nút *Hôm nay* / *Xóa*.
`#fNgay` là input **ẩn** giữ giá trị chuẩn `DD/MM/YYYY` dùng cho header, tóm tắt, hồ sơ và bản nháp —
hai ô luôn đồng bộ qua `onDatePick()` và `syncNgayPicker()`.

*Phần ảnh* — xem chi tiết bên dưới.

Nút **Tiếp tục** luôn bấm được; thiếu gì thì báo đúng chỗ đó và cuộn tới ô cần sửa
(`validateInfo()` cho thông tin, `hasImages()` cho ảnh).

**Bước 2 — Xem & Xuất**
- **Tóm tắt** (`#sumRows3`) — chỉ hiển thị ở bước này, không còn ở bước 1
- **Preview A4 trực tiếp** đúng tỷ lệ, header, thuyết minh và cách cắt ảnh như PDF thật
  (ảnh preview đi qua chính hàm `processImage()` của PDF nên khớp 100%)
- Tạo PDF → tải xuống → tùy chọn **lưu hồ sơ trên máy**

---

### Chi tiết phần ảnh (bước 1)
- Kéo thả / chọn thư mục (File System Access API, fallback `webkitdirectory`) hoặc chọn ảnh lẻ
- Mỗi **thư mục con = một hạng mục**; ảnh lẻ vào nhóm `Ảnh chưa phân loại`
- Chọn ảnh: nhấp **vào vùng ảnh** · Ctrl/Cmd+nhấp · Shift+nhấp chọn dải · **khoanh chọn** kéo chuột
- Mỗi thẻ ảnh có 5 nút: 🖼️ **thay ảnh** (giữ nguyên vị trí + thuyết minh) · ↻ **xoay 90°** ·
  ＋ **chèn ảnh ngay sau** · 👁 **xem kích thước lớn** · 🗑 **xóa**
- **Ô nhập thuyết minh ngay dưới mỗi ảnh** — gõ trực tiếp, `Tab`/`Shift+Tab` sang ô kế tiếp,
  bỏ trống = dùng thuyết minh mặc định (hiện ở placeholder)
- **Chú thích gộp** cho nhiều ảnh cùng lúc, có xem trước **AutoCorrect**
- Công tắc **"Lấy tên file làm thuyết minh"** đổi nguồn thuyết minh mặc định

**AutoCorrect thuyết minh** (`normalizeCaption`): gộp khoảng trắng thừa, viết hoa chữ đầu và
chữ đầu sau dấu `. ! ? …`. Chạy khi rời ô nhập và khi áp dụng chú thích gộp.

**Mô hình dữ liệu ảnh**: `state.groups[].items[] = {id, bid, file, path, cap, rot}` — sửa trực tiếp,
**không dựng lại từ danh sách file**, nhờ vậy giữ được thứ tự chèn, ảnh đã thay, góc xoay và thuyết minh riêng.
`bid` đổi mỗi lần thay file, dùng làm khóa lưu ảnh của bản nháp.

**Bản nháp tự lưu**: mọi thay đổi được ghi vào IndexedDB sau 1,5 giây (debounce).
Ảnh (blob) nằm ở store `draft_blobs` ghi **một lần cho mỗi `bid`**; phần mô tả nằm ở `draft_meta`
và chỉ vài KB — nhờ vậy gõ thuyết minh không phải ghi lại toàn bộ ảnh. Blob mồ côi được dọn khi
tập ảnh thay đổi. Mở lại app mà còn bản nháp thì có thanh mời **Mở bản nháp** / **Xóa nháp**.

### Lưu hồ sơ trên máy (IndexedDB)
- DB `pti_ghepanh` (v2) với 3 store: `records` (hồ sơ lưu tay) · `draft_meta` + `draft_blobs` (bản nháp tự lưu)
- Lưu thông tin + ảnh (Blob) ngay trong trình duyệt, **không tải lên internet**
- Mở lại / tìm kiếm (theo mã hồ sơ, BKS, ga-ra, GĐV) / xóa qua nút 🗂️
- Hồ sơ lưu kèm `cap` và `rot` của từng ảnh; khi mở lại dùng đường dẫn giả
  `{chỉ số nhóm}/{tên hạng mục}/{tên file}` để vẫn thêm/bớt ảnh tiếp được

### Khác
- **Dark mode** (nút 🌙, lưu localStorage, mặc định theo hệ điều hành)
- Danh sách GĐV lưu localStorage (`pti_gdv_list`) và danh sách **Phòng / Khu vực** (`pti_phong_list`);
  tên mới nhập được tự thêm vào. Phòng/khu vực là dòng in ở **chân mỗi trang bản ảnh** (`footerText()`)
- Phím tắt: `Ctrl/Cmd+A` chọn tất cả · `Delete` xóa ảnh đã chọn · `Esc` bỏ chọn · `L` bật khoanh chọn · `←` `→` chuyển giữa 2 bước
- Khi đang xem ảnh lớn: `←` `→` chuyển ảnh · `R` xoay · `Esc` đóng

---

## 4 kiểu bản ảnh & logic phân trang

| Kiểu (`--loai`) | Tiêu đề header | Phân trang |
|---|---|---|
| `chitiet` | Giám định chi tiết xe ô tô biển kiểm soát | Ảnh prefix `0.` ra **trang đầu riêng**, sau đó ảnh hạng mục ghép liên tục |
| `hientruong` | Giám định hiện trường xe ô tô biển kiểm soát | Toàn bộ ảnh ghép liên tục |
| `giayto` | Giám định giấy tờ xe ô tô biển kiểm soát | **Bố cục tự động theo tiền tố số** — trộn được trang ngang và dọc trong cùng file |
| `xacminh` | Ảnh xác minh hiện trường xe ô tô biển kiểm soát | Toàn bộ ảnh ghép liên tục |

Bố cục tự động của `giayto`:
- tiền tố `1.` → 4 ảnh/trang, **A4 ngang** (2×2)
- tiền tố `2.`–`3.` → 2 ảnh/trang, A4 dọc (1×2)
- tiền tố `4.` trở lên (hoặc không có tiền tố) → 1 ảnh/trang, A4 dọc

Chỉ `chitiet` có dòng 2 là `Địa điểm tại Gara : {ga_ra}`; 3 loại còn lại in thẳng `{ga_ra}`.

### Số ảnh trên mỗi trang → lưới (cols × rows)

| Layout | Số ảnh hợp lệ |
|---|---|
| `doc` (A4 dọc) | 1(1×1) · 2(1×2) · 3(1×3) · 4(2×2) · **6(2×3) mặc định** · 8(2×4) · 9(3×3) · 12(3×4) |
| `ngang` (A4 ngang) | 1(1×1) · 2(2×1) · **4(2×2) mặc định** · 6(3×2) · 8(4×2) · 9(3×3) |

Bảng này tồn tại **2 nơi và phải luôn khớp nhau**: hằng `GRID` trong `index.html` và trong `ghep_anh.py`.

---

## Giai đoạn 1 — `dat_ten_file.py`

**Chạy:** `python dat_ten_file.py`

- Quét thư mục con trong `input/` dạng `{số}. {tên hạng mục}`
- Sao chép sang `renamed/` với tên `{tên thư mục}_{thứ tự}.{ext}`
- **Tự động xóa sạch** `renamed/` trước mỗi lần chạy
- Lưu `renamed/mapping.json`: `{ "tên file mới": "tên thư mục gốc" }`

## Giai đoạn 2 — `ghep_anh.py`

```bash
python ghep_anh.py --gdv "Tên GĐV" --layout doc                       # dọc, 6 ảnh/trang
python ghep_anh.py --gdv "Tên GĐV" --layout ngang --so-anh 6          # ngang, 6 ảnh/trang (3×2)
python ghep_anh.py --gdv "Tên GĐV" --loai giayto                      # bố cục tự động
python ghep_anh.py --gdv "Tên GĐV" --loai xacminh --thuyet-minh ten-file
python ghep_anh.py --gdv "Tên GĐV" --ma-ho-so "XCG.2026.001234" --ngay "06/06/2026"
```

| Tham số | Ý nghĩa |
|---|---|
| `--gdv` *(bắt buộc)* | Tên giám định viên |
| `--loai` | `chitiet` (mặc định) · `hientruong` · `giayto` · `xacminh` |
| `--layout` | `doc` (mặc định) hoặc `ngang` — bỏ qua với `--loai giayto` |
| `--so-anh` | Số ảnh/trang (xem bảng trên) — bỏ qua với `--loai giayto` |
| `--ma-ho-so` | Mã hồ sơ — dùng đặt tên file PDF |
| `--ngay` | Ngày giám định `DD/MM/YYYY` — hiển thị cùng dòng GĐV |
| `--bks` / `--gara` | Truyền thẳng thay vì đọc từ Excel |
| `--phong` | Tên Phòng / khu vực giám định — in ở chân mỗi trang |
| `--thuyet-minh` | `hang-muc` (mặc định) hoặc `ten-file` |
| `--captions` | File JSON ghi đè từng ảnh (xem dưới) |
| `--output` | Đường dẫn PDF đầu ra |

Tên file mặc định: `output/BanAnh_{loai}_{mã hồ sơ hoặc BKS}.pdf`

**File `--captions`** — ghi đè thuyết minh và góc xoay từng ảnh, mỗi mục nhận 1 trong 2 dạng:

```json
{
  "1. Capo lõm bẹp rách_1.jpg": "cản trước phải xước. nứt nhẹ ở mép",
  "1. Capo lõm bẹp rách_2.jpg": { "cap": "cận cảnh vết rách", "rot": 90 },
  "2. Đèn pha nứt, vỡ_1.jpg":   { "rot": 180 }
}
```

Thuyết minh trong file này được chạy qua `normalize_caption()` (AutoCorrect — giống hàm
`normalizeCaption()` của web); thuyết minh lấy từ tên hạng mục thì giữ nguyên.
`rot` nhận 0/90/180/270, áp dụng **sau** EXIF và **trước** bước tự xoay ngang.

**Kiến trúc:** `load_images_with_captions()` → `build_pages()` → `create_pdf()`.
`build_pages()` là **nguồn sự thật duy nhất** về phân trang (tương ứng hàm cùng tên trong `index.html`);
mỗi trang tự mang khổ giấy riêng nên `giayto` trộn được trang ngang và dọc.

---

## Thông số thiết kế PDF

| Tham số | Giá trị |
|---|---|
| Font | Be Vietnam Pro (Regular + Bold) |
| Màu header / caption | `#1565C0`, chữ trắng |
| Header | `20mm`, **dán sát mép trên trang** (không chừa lề) · khoảng trắng header→ảnh `3mm` |
| Logo PTI SOS | `17mm × 17mm`, góc trái header (vừa trong 20mm) |
| Bo góc ảnh | 4% chiều rộng ô ảnh · khoảng cách ô `2mm` · lề `8mm` |
| Footer | Tên **Phòng / Khu vực** do người dùng nhập (xám trái) + số trang (xanh phải), 13pt |
| Caption | 14pt, tự thu nhỏ nếu tràn |
| Tiêu đề header | **căn trái** sát logo · `{loại} : {BKS}` 16pt Bold · `Số HSBT: {mã hồ sơ}` 14pt · `{ga-ra}` 15pt · `{GĐV} — Ngày: {ngày}` 14pt |
| Thu nhỏ tiêu đề | tự co theo `headerMetrics()` / `fit` để vừa 20mm — bản 4 dòng co còn ~79% |
| Giãn dòng header | **2 point** (không phải 2mm) — xem bẫy kỹ thuật #5 |

### Bẫy kỹ thuật đã gặp — đừng lặp lại

1. **Ảnh phải nạp qua bộ nhớ**, không qua file tạm: ReportLab/pdf-lib cache ảnh theo đường dẫn,
   dùng file tạm trùng tên sẽ khiến ảnh trang 1 lặp lại ở mọi trang sau.
   Python dùng `BytesIO + ImageReader`; web dùng `canvas.toBlob() → embedPng` cho từng ảnh.
2. **Vị trí dòng trong `draw_header`**: mỗi bước dịch `start_y` chỉ trừ `font size dòng hiện tại + spacing`,
   không trừ thêm font size dòng kế tiếp. Sai công thức sẽ đẩy dòng 2–3 ra ngoài khung header.
3. **Phải bọc UTF-8 cho cả `sys.stdout` lẫn `sys.stderr`** ở đầu `ghep_anh.py`,
   nếu không mọi thông báo lỗi tiếng Việt sẽ thành ký tự rác trên Windows.
4. **Ảnh dọc được xoay ngang** (`fit_image_landscape` / `needRotate`) rồi mới cắt giữa theo tỷ lệ ô ảnh.
5. **Giãn dòng header phải tính bằng point, không phải mm.** Header cao 28mm ≈ 79,4pt;
   khối 4 dòng (16+14+15+14) với giãn 2pt cao 65pt — vừa khung. Nếu dùng `_pts(2)` (2mm ≈ 5,7pt)
   thì khối cao 76pt và dòng cuối thò xuống dưới nền xanh.
6. **Dòng "Số HSBT" chỉ in khi có mã hồ sơ**, nên số dòng header thay đổi theo dữ liệu —
   `draw_header()` và `headerLines()` phải tính chiều cao khối động rồi mới canh giữa, không hard-code 3 dòng.
7. **`loadThumbs()` bỏ qua ảnh có `offsetParent` rỗng**, nên phải hiện thẻ gallery (`display:''`)
   TRƯỚC khi gọi nó, nếu không ảnh đại diện hạng mục sẽ trắng cho tới lần render sau.
8. **Chiều cao khối chữ header phải tính theo kích thước THỊ GIÁC**, không phải tổng cỡ chữ:
   `span giữa các baseline + 0,78×cỡ dòng đầu (đỉnh chữ) + 0,22×cỡ dòng cuối (nét thòng)`.
   Chỉ cộng cỡ chữ thì nét thòng của dòng cuối (g, y, ă…) sẽ lòi ra ngoài nền xanh.
   Xem `headerMetrics()` trong `index.html` và biến `raw_vis` trong `draw_header()`.
9. **Header dán sát mép trên** nên vùng ảnh chỉ trừ MỘT lề (lề dưới):
   `area_h = page_h - header_h - header_gap - margin - footer_h`. Trừ `2 * margin` như trước
   sẽ để thừa một khoảng trắng 8mm ở đáy trang.

---

## Cách dùng nhanh (double-click)

`chay_doc.bat` / `chay_ngang.bat` — hỏi tên GĐV → kiểu bản ảnh (1–4) → số ảnh/trang → mã hồ sơ → ngày,
rồi chạy cả 2 giai đoạn và mở thư mục `output/`.

## Làm lại hồ sơ mới

```powershell
Remove-Item output\*.pdf -Force          # renamed/ tự xóa khi chạy dat_ten_file.py
# Đặt ảnh mới vào input/, cập nhật Bao_gia.xlsx nếu cần
python dat_ten_file.py
python ghep_anh.py --gdv "Tên GĐV" --layout doc --ngay "DD/MM/YYYY"
```

## Dependencies (chỉ cho luồng Python)

```
Pillow>=10.0
reportlab>=4.0
openpyxl>=3.1
python-docx>=1.1
```

Cài: `pip install -r requirements.txt` — web app không cần gì cả.
