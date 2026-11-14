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
├── huong-dan.html                ← HƯỚNG DẪN SỬ DỤNG (trang độc lập, mở bằng nút `Help` / F1)
├── input/                        ← ảnh gốc + file báo giá (CHỈ dùng cho luồng Python)
│   ├── 0. Số khung xe/           ← ảnh nhận dạng xe (prefix 0)
│   ├── 1. Cốp sau lõm bẹp/       ← ảnh hạng mục (prefix 1, 2, 3...)
│   ├── Bao_gia.xlsx              ← nguồn BKS + tên ga-ra (chỉ luồng Python)
│   └── Bao-gia.jpg               ← ảnh báo giá → Gemini Vision OCR (chỉ luồng Python)
├── renamed/                      ← ảnh đã đổi tên (do dat_ten_file.py tạo)
│   └── mapping.json              ← tên file → tên thư mục gốc (chú thích)
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

Thư viện CDN: `pdf-lib` + `@pdf-lib/fontkit` (dựng PDF) nạp sẵn ở `<head>`;
`pdf.js` (`PDFJS_VER`, cdnjs) **nạp lười** bởi `loadPdfjs()` ở lần đầu người dùng nạp file PDF.
Không dùng thư viện nào khác.

**Hướng dẫn sử dụng** nằm ở `huong-dan.html` — trang HTML độc lập, tự chứa CSS, không phụ thuộc
`index.html`. Nút `Help` (ngoài cùng bên phải thanh tiêu đề, cạnh 🌙) và phím `F1` mở nó trong
hộp thoại `#guideModal` qua iframe `huong-dan.html?theme={sáng|tối}`; `openGuide()` chỉ dựng
iframe một lần và nạp lại khi đổi sáng/tối. Trang này cũng mở trực tiếp được bằng link hoặc
in ra giấy (có `@media print`). Hướng dẫn **chỉ nói về web app** (A · Các bước sử dụng ·
B · Thông số · C · Xử lý sự cố · D · FAQ) — phần luồng Python đã bỏ khỏi hướng dẫn, chỉ còn
tài liệu ở CLAUDE.md. **Sửa tính năng thì phải sửa `huong-dan.html` kèm theo** —
bảng tiền tố giấy tờ, bảng lưới ảnh/trang và danh sách phím tắt được nhắc lại ở đó.
Chấm cam trên nút `Help` hiện khi `localStorage.pti_guide_seen !== APP_BUILD`, nên **tăng `APP_BUILD`
mỗi lần cập nhật hướng dẫn** để người dùng thấy nhắc.

> **Web app không có OCR báo giá.** BKS và tên ga-ra nhập tay ở đầu bước 1.
> Gemini Vision OCR và đọc `Bao_gia.xlsx` **chỉ còn ở luồng Python** (`get_bks_garage()` trong `ghep_anh.py`).
> `build.sh` / biến `GEMINI_API_KEY` trên Render không còn tác dụng với web app.

### Quy trình 2 bước

**Bước 1 — Lập bản ảnh** (một cột, toàn chiều rộng; thông tin ở trên cùng rồi tới ảnh)

*Thẻ "Thông tin giám định"* xếp gọn theo 4 hàng:
1. Kiểu bản ảnh (3 lựa chọn: chi tiết thiệt hại · hiện trường/xác minh · giấy tờ xe) — toàn chiều rộng
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
- **Preview A4 trực tiếp** đúng tỷ lệ, header, chú thích và cách cắt ảnh như PDF thật
  (ảnh preview đi qua chính hàm `processImage()` của PDF nên khớp 100%)
- Tạo PDF → tải xuống → tùy chọn **lưu hồ sơ trên máy**

---

### Nguồn ảnh nhận file PDF (chỉ kiểu `giayto`)
`extAccepted()` / `pdfAllowed()` mở thêm đuôi `.pdf` khi `fLoai === 'giayto'`; `onLoaiChange()`
đổi `accept` của 4 input file, nhãn `#dzFmt` và nhãn `#btnPickImg`.
`intakeFiles()` là **cửa duy nhất** mọi file đi qua trước khi vào `state.groups`
(dùng bởi `mergeFiles()`, `#insertFile`, `#replaceFile`) — nó raster hóa PDF bằng
`pdfToImages()`: **một trang PDF = một File ảnh JPEG** (`PDF_RENDER_W`, nền trắng vì trang PDF
trong suốt). Nhờ vậy toàn bộ phần sau (thumbnail, chọn, xoay, chú thích, preview, `processImage`)
dùng chung một đường đi với ảnh thường — preview luôn khớp PDF xuất ra, và trang PDF được lưu
vào hồ sơ/bản nháp dưới dạng ảnh nên mở lại không cần pdf.js.

`pdfPageName()`: PDF nhiều trang có tiền tố đầy đủ `{chính}.{phụ}` thì trang `n` nhận tiền tố phụ
`{phụ}+n-1` (`1.1 Dang ky xe.pdf` 2 trang → `1.1 …(trang 1)` + `1.2 …(trang 2)` → chú thích
"mặt trước"/"mặt sau"). Chỉ đổi **chú thích**, không đổi bố cục vì mọi tiền tố cùng số đầu
dùng chung một luật `GIAYTO_RULES`. Đường dẫn ảnh có hậu tố `#p{n}` để không trùng `it.path`.

### Chi tiết phần ảnh (bước 1)
- Kéo thả / chọn thư mục (File System Access API, fallback `webkitdirectory`) hoặc chọn ảnh lẻ
- Mỗi **thư mục con = một hạng mục**; ảnh lẻ vào nhóm `Ảnh chưa phân loại`
- Chọn ảnh: nhấp **vào vùng ảnh** · Ctrl/Cmd+nhấp · Shift+nhấp chọn dải · **khoanh chọn** kéo chuột
- Mỗi thẻ ảnh có 5 nút: 🖼️ **thay ảnh** (giữ nguyên vị trí + chú thích) · ↻ **xoay 90°** ·
  ＋ **chèn ảnh ngay sau** · 👁 **xem kích thước lớn** · 🗑 **xóa**
- **Ô nhập chú thích ngay dưới mỗi ảnh** — gõ trực tiếp, `Tab`/`Shift+Tab` sang ô kế tiếp,
  bỏ trống = dùng chú thích mặc định (hiện ở placeholder)
- **Chú thích gộp** cho nhiều ảnh cùng lúc, có xem trước **AutoCorrect**
- Công tắc **"Lấy tên file làm chú thích"** đổi nguồn chú thích mặc định

**Nguồn chú thích mặc định** — `state.capSrc ∈ {auto, file, folder}`, hai công tắc
`#swFileName` / `#swFolderName` loại trừ nhau qua `setCapSrc()`; `syncCapSrcSwitches()` đồng bộ
khi mở hồ sơ / bản nháp. Hồ sơ cũ chỉ có `useFileName` → đọc thành `capSrc`; vẫn ghi cả 2 khóa.

**Chú thích mặc định** (`defaultCapOf`, dùng bởi cả placeholder và `capOf`):
`capSrc='file'` → tên file · `capSrc='folder'` → tên hạng mục · `capSrc='auto'` →
**tên giấy tờ theo tiền tố** `GIAYTO_NAMES` (chỉ kiểu `giayto`, và chỉ khi tên hạng mục còn tiền tố
số hoặc là `UNGROUPED` — đổi tên hạng mục thành tên không có tiền tố thì tên đó thắng) → tên hạng mục.

**Số thứ tự ảnh**: `buildPages()` bọc `buildPagesRaw()` và gán `cell.no` chạy liên tục qua các trang
(trái→phải, trên→dưới). `capLine(cell)` = `"{no}. {cap}"` dùng cho **cả PDF và preview**;
`printNoMap()` cho thẻ ảnh bước 1 **hiện đúng số sẽ in**. Python: `build_pages()` bọc
`_build_pages_raw()` và trả cell 4 phần tử `(fpath, cap, rot, no)`; `draw_image_grid()` ghép
`f"{no}. {caption}"`.

**Xuất file ở bước 2** — `generatePDF(opts)` nhận `{scale, jpegQ, onProg}` và **trả về bytes**
(không còn tự gán `state.pdfBytes`):
- *file gốc*: `scale 2`, ảnh PNG (có alpha) → `embedPng`;
- *PDF nén*: `downloadSmallPDF()` chạy lại `generatePDF` theo `SMALL_STEPS` (6 mức hạ dần
  `scale`/`jpegQ`), **dừng ở mức đầu tiên** ≤ `MAX_SMALL` (10MB), cache ở `state.smallBytes`.
  Ở chế độ `jpegQ`, `processImage()` tô **nền trắng** trước khi vẽ (JPEG không có alpha) và
  `embedJpg` thay cho `embedPng`;
- *ảnh JPG*: `downloadJPG()` raster hóa **chính file PDF** bằng pdf.js ở `JPG_DPI` nên khớp 100%
  bản in; 1 trang → tải thẳng `.jpg`, nhiều trang → `zipStore()` (ZIP store, `crc32` tự viết,
  cờ UTF-8 cho tên file tiếng Việt). Luôn `state.pdfBytes.slice()` khi đưa cho pdf.js vì worker
  có thể lấy quyền sở hữu buffer.

**AutoCorrect chú thích** (`normalizeCaption`): gộp khoảng trắng thừa, viết hoa chữ đầu và
chữ đầu sau dấu `. ! ? …`. Chạy khi rời ô nhập và khi áp dụng chú thích gộp.

**Mô hình dữ liệu ảnh**: `state.groups[].items[] = {id, bid, file, path, cap, rot}` — sửa trực tiếp,
**không dựng lại từ danh sách file**, nhờ vậy giữ được thứ tự chèn, ảnh đã thay, góc xoay và chú thích riêng.
`bid` đổi mỗi lần thay file, dùng làm khóa lưu ảnh của bản nháp.

**Bản nháp tự lưu**: mọi thay đổi được ghi vào IndexedDB sau 1,5 giây (debounce).
Ảnh (blob) nằm ở store `draft_blobs` ghi **một lần cho mỗi `bid`**; phần mô tả nằm ở `draft_meta`
và chỉ vài KB — nhờ vậy gõ chú thích không phải ghi lại toàn bộ ảnh. Blob mồ côi được dọn khi
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

## Kiểu bản ảnh & logic phân trang

| Kiểu (`--loai`) | Tiêu đề header | Phân trang |
|---|---|---|
| `chitiet` | Giám định chi tiết xe ô tô biển kiểm soát | Ảnh prefix `0.` ra **trang đầu riêng**, sau đó ảnh hạng mục ghép liên tục |
| `hientruong` | Giám định hiện trường xe ô tô biển kiểm soát | Toàn bộ ảnh ghép liên tục |
| `giayto` | Giám định giấy tờ xe ô tô biển kiểm soát | **Bố cục tự động theo tiền tố số** — trộn được trang ngang và dọc trong cùng file |
| `xacminh` | Ảnh xác minh hiện trường xe ô tô biển kiểm soát | Toàn bộ ảnh ghép liên tục |

> Droplist của web app chỉ còn **3 lựa chọn**: `chitiet` · `hientruong` (gộp hiện trường + xác minh
> hiện trường) · `giayto`. Kiểu `xacminh` chỉ còn dùng cho luồng Python (`--loai xacminh`) và cho
> hồ sơ/bản nháp cũ — mở lại thì `normLoai()` trong `index.html` gộp về `hientruong`.

Bố cục tự động của `giayto` — đọc tiền tố `{chính}.{phụ}` của **tên ảnh**
(không có thì lấy tiền tố **tên thư mục**); tiền tố phụ bỏ trống được coi như `.1`:

| Tiền tố | Giấy tờ | Bố cục |
|---|---|---|
| `1.1`–`1.4` | Đăng ký xe, bằng lái (mặt trước/sau) | 4 ảnh/trang **A4 ngang** (2×2) |
| `1.5`–`1.6` | Căn cước công dân lái xe | 4 ảnh/trang **A4 ngang** (2×2) |
| `2.x` | Giấy chứng nhận đăng kiểm / bảo hiểm khổ A5 | 2 ảnh/trang **A4 dọc** (1×2) |
| `3.x` | Ảnh xác minh bằng lái | 4 ảnh/trang **A4 dọc** (2×2) |
| `4` trở lên | Bảo hiểm A4, kiểm định XCG, biên bản bàn giao, xác nhận ngân hàng… | 1 ảnh/trang **A4 dọc** |
| không có tiền tố | Giấy tờ khác — chú thích nhập tay | bố cục **người dùng tự chọn** (`layout` + số ảnh/trang) |

- **Ảnh cùng bố cục được dồn chung trang**, kể cả khi ở khác hạng mục — nhờ vậy `1.1`→`1.4`
  (mỗi loại 1 ảnh) nằm gọn trên MỘT trang 4 ảnh/trang ngang, `1.5`/`1.6` ghép tiếp vào trang sau.
  Thứ tự các khối trang theo tiền tố nhỏ nhất của khối, ảnh không tiền tố xuống cuối.
- Chỉ nhận tiền tố **1–2 chữ số** để tên máy ảnh kiểu `20261114_123.jpg` không bị hiểu là tiền tố.
- Tên giấy tờ theo tiền tố (`GIAYTO_NAMES` / bảng trên) chỉ dùng làm **chú thích mặc định cho
  ảnh chưa thuộc hạng mục nào**; ảnh nằm trong thư mục có tên thì vẫn lấy tên thư mục.

Chỉ `chitiet` có dòng 2 là `Địa điểm tại Gara : {ga_ra}`; 3 loại còn lại in thẳng `{ga_ra}`.

### Số ảnh trên mỗi trang → lưới (cols × rows)

| Layout | Số ảnh hợp lệ |
|---|---|
| `doc` (A4 dọc) | 1(1×1) · 2(1×2) · 3(1×3) · 4(2×2) · **6(2×3) mặc định** · 8(2×4) · 9(3×3) · 12(3×4) |
| `ngang` (A4 ngang) | 1(1×1) · 2(2×1) · **4(2×2) mặc định** · 6(3×2) · 8(4×2) · 9(3×3) |

Bảng này tồn tại **2 nơi và phải luôn khớp nhau**: hằng `GRID` trong `index.html` và trong `ghep_anh.py`.
Bảng bố cục tự động của `giayto` cũng vậy: `GIAYTO_RULES` / `GIAYTO_BIG` ở cả 2 file, cùng với
`getPrefixPair()` (web) ↔ `file_prefix()` (Python) và `giaytoSpec()` ↔ `giayto_spec()`.

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
python ghep_anh.py --gdv "Tên GĐV" --loai xacminh --chu-thich ten-file
python ghep_anh.py --gdv "Tên GĐV" --ma-ho-so "XCG.2026.001234" --ngay "06/06/2026"
```

| Tham số | Ý nghĩa |
|---|---|
| `--gdv` *(bắt buộc)* | Tên giám định viên |
| `--loai` | `chitiet` (mặc định) · `hientruong` · `giayto` · `xacminh` |
| `--layout` | `doc` (mặc định) hoặc `ngang` — với `--loai giayto` chỉ áp dụng cho ảnh không có tiền tố |
| `--so-anh` | Số ảnh/trang (xem bảng trên) — với `--loai giayto` chỉ áp dụng cho ảnh không có tiền tố |
| `--ma-ho-so` | Mã hồ sơ — dùng đặt tên file PDF |
| `--ngay` | Ngày giám định `DD/MM/YYYY` — hiển thị cùng dòng GĐV |
| `--bks` / `--gara` | Truyền thẳng thay vì đọc từ Excel |
| `--phong` | Tên Phòng / khu vực giám định — in ở chân mỗi trang |
| `--chu-thich` | `hang-muc` (mặc định) hoặc `ten-file` — tên cũ `--thuyet-minh` vẫn nhận |
| `--captions` | File JSON ghi đè từng ảnh (xem dưới) |
| `--output` | Đường dẫn PDF đầu ra |

Tên file mặc định: `output/BanAnh_{loai}_{mã hồ sơ hoặc BKS}.pdf`

**File `--captions`** — ghi đè chú thích và góc xoay từng ảnh, mỗi mục nhận 1 trong 2 dạng:

```json
{
  "1. Capo lõm bẹp rách_1.jpg": "cản trước phải xước. nứt nhẹ ở mép",
  "1. Capo lõm bẹp rách_2.jpg": { "cap": "cận cảnh vết rách", "rot": 90 },
  "2. Đèn pha nứt, vỡ_1.jpg":   { "rot": 180 }
}
```

Chú thích trong file này được chạy qua `normalize_caption()` (AutoCorrect — giống hàm
`normalizeCaption()` của web); chú thích lấy từ tên hạng mục thì giữ nguyên.
`rot` nhận 0/90/180/270, áp dụng **sau** EXIF và là **thứ duy nhất** quyết định chiều ảnh in ra.

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
| Ảnh trong ô | **Thu vừa khung (contain), canh giữa, không cắt mép, không tự xoay** |
| Bo góc ảnh | 4% cạnh ngắn của vùng ảnh vẽ ra · khoảng cách ô `2mm` · lề `8mm` |
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
4. **Ảnh KHÔNG được tự xoay và KHÔNG được cắt.** Trước đây `fit_image_landscape()` /
   `needRotate` tự xoay ảnh dọc thành ngang rồi cắt giữa theo tỷ lệ ô — gây 2 lỗi:
   bản in khác chiều với ảnh trên màn hình, và mất mép ảnh. Nay:
   - chiều ảnh **chỉ** do `it.rot` / `--captions.rot` quyết định (sau `exif_transpose`);
   - ảnh **thu vừa khung** (contain) theo `k = min(cellW/srcW, imgH/srcH)` rồi canh giữa ô;
   - `processImage()` (web) trả canvas đúng cỡ ô, **nền trong suốt** (PNG alpha) nên nền trang
     hiện qua phần trống; `draw_image_grid()` (Python) vẽ ảnh đúng `draw_w × draw_h` tại tâm ô.
   Hai bên phải cho **cùng một kết quả**: ô 272,1 × 220,2pt → ảnh 3:4 ra 165,1 × 220,2pt,
   ảnh 4:3 ra 272,1 × 204,1pt. Thẻ ảnh bước 1 (`.th-img img`) và ô preview (`.pv-img img`)
   dùng `object-fit:contain` / `fill` trên nền trắng cho khớp bản in.
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
