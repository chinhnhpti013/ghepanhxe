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
├── assets/logo-ptisos.png        ← huy hiệu vuông, header BẢN ẢNH
├── assets/logo-pti-insurance.png ← logo "pti Insurance", góc trái BIÊN BẢN
├── assets/bb-footer.png          ← dải cam chân trang BIÊN BẢN
├── assets/logo-pti-bienban.png   ← logo PTI SOS ngang (dự phòng cho biên bản)
├── docs/bien_ban_giam_dinh.pdf   ← MẪU GIẤY của biên bản (gitignore: có dữ liệu khách thật)
├── fonts/BeVietnamPro-{Regular,Bold}.ttf
├── dat_ten_file.py               ← Giai đoạn 1 (Python)
├── ghep_anh.py                   ← Giai đoạn 2 (Python)
├── chay_doc.bat / chay_ngang.bat ← chạy nhanh bằng double-click
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
B · Thông số · C · Xử lý sự cố · D · FAQ; mục **9c** là Biên bản giám định & chữ ký tay, mục **7** có dải nút Thay thế/Sửa chữa/Không) — phần luồng Python đã bỏ khỏi hướng dẫn, chỉ còn
tài liệu ở CLAUDE.md. **Sửa tính năng thì phải sửa `huong-dan.html` kèm theo** —
bảng tiền tố giấy tờ, bảng lưới ảnh/trang và danh sách phím tắt được nhắc lại ở đó.
Chấm cam trên nút `Help` hiện khi `localStorage.pti_guide_seen !== APP_BUILD`, nên **tăng `APP_BUILD`
mỗi lần cập nhật hướng dẫn** để người dùng thấy nhắc.

> **Web app không có OCR báo giá.** BKS và tên ga-ra nhập tay ở đầu bước 1.
> Gemini Vision OCR và đọc `Bao_gia.xlsx` **chỉ còn ở luồng Python** (`get_bks_garage()` trong `ghep_anh.py`).
> Web app **không cần bước build** nào — `index.html` không còn placeholder khóa API,
> nên biến `GEMINI_API_KEY` và script inject khóa (`build.sh`) đã được **xóa khỏi dự án**.

### Quy trình 2 bước

**Bước 1 — Lập bản ảnh** (một cột, toàn chiều rộng; thông tin ở trên cùng rồi tới ảnh)

*Thẻ "Thông tin giám định"* chia thành **5 khung `.fsec` có đánh số**, mỗi khung một nhóm
thông tin (xem *Khung thông tin `.fsec`* ở phần hệ màu):
1. **Kiểu bản ảnh** (`#fLoai`, 3 lựa chọn: chi tiết thiệt hại · hiện trường/xác minh · giấy tờ xe)
   — `<select>` nằm **thẳng trong `.fsec`**, không bọc `.fg`, nên bộ style ô nhập phải kể thêm
   `.fsec > select`. Khung này chứa luôn `#giaytoNote`
2. **Hồ sơ & xe** — Số HSBT / Mã hồ sơ · Biển kiểm soát · Ngày giám định *(3 cột)*
3. **Nơi giám định & người thực hiện** — Tên ga-ra · Giám định viên · Phòng / Khu vực ·
   **Điện thoại GĐV** (`#fSdtGdv`, chỉ in lên biên bản) *(lưới 3 cột, ô thứ 4 xuống hàng)*
4. **Bố cục trang in** (`#layoutSection`) — A4 dọc/ngang · Số ảnh trên mỗi trang *(2 cột)*;
   `#layoutHint` giờ là `<span class="tag">` nằm trong `.fsec-h`
5. **Biên bản giám định** (`#bbSwitchRow`, `.fsec.warm` nền vàng) — công tắc **`#fBbOn`** +
   **Tên Lái/chủ xe · Loại xe · Ngày tổn thất · Địa điểm tổn thất** (`#ttRow`) + dòng ghi chú
   `#ttHint`.
   Cả khung chỉ hiện khi `fLoai === 'chitiet'`; `#ttRow`/`#ttHint` chỉ hiện khi `bbEnabled()`.
   `updateSummaries()` cũng gọi `bbEnabled()` trước khi in 4 dòng tổn thất vào tóm tắt
   (bỏ tích rồi thì tóm tắt không được in lại tên lái xe đã gõ trước đó)

> Khung ⑤ đặt **cuối cùng** (sau Bố cục) chứ không phải ngay dưới Kiểu bản ảnh, để khi nó bị ẩn
> thì số thứ tự ①–④ của các khung còn lại không bị nhảy cóc.

Dưới cùng thẻ là khối **xem trước tiêu đề bản in** (`#loaiPreview`) — hiện đúng các dòng
sẽ in lên đầu mỗi trang PDF, cập nhật ngay khi gõ.

Ngày giám định dùng **một ô chọn ngày** (`#fNgayPick`) + nút *Hôm nay* / *Xóa*.
`#fNgay` là input **ẩn** giữ giá trị chuẩn `DD/MM/YYYY` dùng cho header, tóm tắt, hồ sơ và bản nháp —
hai ô luôn đồng bộ qua `onDatePick()` và `syncNgayPicker()`.
**Mặc định là ngày hôm nay** (bớt một thao tác mỗi hồ sơ): `init()` gọi **`fillTodayQuiet()`**,
`resetApp()` gọi `setToday()`. Phải dùng bản *quiet* lúc khởi động vì `setToday()` → `onDatePick()`
→ `scheduleDraftSave()`, mà lúc đó **chưa có ảnh** nên 1,5 giây sau `doDraftSave()` chạy nhánh
"không còn ảnh → xóa nháp" và **xóa đúng bản nháp `checkDraft()` vừa mời mở**.
**Ngày tổn thất** dùng đúng nếp đó: `#fNgayTtPick` + `#fNgayTt` (ẩn) + `onDateTtPick()` /
`clearDateTt()` / `syncNgayTtPicker()`.

*Phần ảnh* — xem chi tiết bên dưới.

Nút **Tiếp tục** luôn bấm được; thiếu gì thì báo đúng chỗ đó và cuộn tới ô cần sửa
(`validateInfo()` cho thông tin, `hasImages()` cho ảnh).

`missingInfo()` là **nguồn sự thật duy nhất** về "ô bắt buộc nào còn trống" → `{id, msg}`;
`validateInfo()` (bước 1→2), `startGenerate()` và `openSaveRecord()` đều gọi nó. Thiếu dữ liệu ở
**bước 2** thì `showMissingOnStep2()` in lỗi lên `#alertErr3` kèm nút **← Quay lại màn hình 1 để nhập**
(`backToInfo(id)`: về bước 1, cuộn tới ô và focus — phải chờ ~160ms vì `goStep(1)` có lệnh cuộn lên
đầu trang sẽ đè lên). `resetGenerate()` xóa lỗi này mỗi lần vào lại bước 2.

**Bước 2 — Xem & Xuất**
- **Preview A4 trực tiếp** (cột trái) đúng tỷ lệ, header, chú thích và cách cắt ảnh như PDF thật
  (ảnh preview đi qua chính hàm `processImage()` của PDF nên khớp 100%)
- Cột phải xếp **theo thứ tự việc cần làm**: `⚡ Xuất PDF` → `📋 Tóm tắt` → `💾 Hồ sơ lưu trên máy`.
  Thẻ Xuất PDF mang class **`.card.act`** (đầu thẻ nền vàng) vì đó là việc chính của màn hình —
  trước đây nó nằm **dưới** Tóm tắt nên nút `Tạo file PDF` bị đẩy khỏi tầm nhìn đầu tiên
- **Tóm tắt** (`#sumRows3`) — chỉ hiển thị ở bước này, không còn ở bước 1. `updateSummaries()` dùng
  **`rowIf()`** cho các dòng không bắt buộc (Mã hồ sơ, 3 dòng tổn thất): **trống thì không in dòng**.
  Dòng `Chú thích` chỉ in khi `capSrc !== 'auto'`, dòng `Biên bản giám định` chỉ in khi `bbEnabled()`
- Tạo PDF → tải xuống → tùy chọn **lưu hồ sơ trên máy**
- **Biên bản giám định** (`#cardBienBan`) — xem mục riêng bên dưới

---

### Nguồn ảnh từ camera (`#camModal`)
Nút `📷 Chụp ảnh` ở `.dz-btns` (trên ≤700px có `order:-1` + tô màu `--brand` vì ngoài hiện trường
đây là việc hay làm nhất) và nút `📷 Chụp thêm` ở thanh công cụ mỗi hạng mục đều gọi
`openCamera(gid?)`. Lớp phủ `.cam` dùng **màu cố định tối**, không theo token sáng/tối, vì khung
ngắm phải tối mới nhìn rõ hình camera — nên **đổi hệ màu không phải sửa khối này**.

Hai đường chụp dùng chung một hộp thoại:
- **Khung ngắm trong app** — `camStart()` xin `getUserMedia` với `{width/height: {ideal: CAM_IDEAL}}`,
  thử lần lượt từ ràng buộc chặt xuống lỏng (`deviceId` → `facingMode` → `true`) và **chạy 2 lượt**
  (lượt 2 sau 450ms) vì camera vừa bị nhả ở lần mở trước thường còn báo `NotReadableError`.
  `camShoot()` vẽ `videoWidth × videoHeight` ra canvas rồi `toBlob('image/jpeg', CAM_JPEG_Q)`.
  **Nháy trắng `.cam-flash` phải chạy NGAY khi bắt được khung hình**, không chờ `toBlob` —
  nén ảnh 8–12MP mất hơn 1 giây, nháy sau thì người dùng tưởng máy không nhận.
  `camUpdateInfo()` hiện kích thước ảnh sẽ chụp và cảnh báo vàng khi cạnh dài < `CAM_MIN_PX`
  (in A4 sẽ rỗ); nút đèn flash chỉ hiện khi `track.getCapabilities().torch`.
  **`closeCamera()`/`camStop()` phải `track.stop()`**, kẻo đèn camera sáng mãi sau khi đóng hộp.
- **`📱 Camera máy`** — `useNativeCam()` nhả camera rồi bấm `#camInput`
  (`<input capture="environment">`). Ảnh nét nhất (đủ cảm biến, có lấy nét/HDR) và là **đường duy
  nhất chạy được khi trang mở bằng `http://` trong mạng LAN** — `getUserMedia` đòi
  `isSecureContext` (https hoặc localhost), nên `openCamera()` kiểm tra trước và báo rõ cho
  người dùng thay vì để trình duyệt im lặng từ chối.

**Ảnh chụp được đặt tên theo nếp của `dat_ten_file.py`** — `{tên hạng mục}_{thứ tự}.jpg`
(`camNextName()`, nhóm `UNGROUPED` → `Anh chup_{n}.jpg`) — nhờ vậy **tiền tố số của hạng mục vẫn
quyết định bố cục và chú thích** y như ảnh chọn từ máy. Ô `#camGrp` chọn hạng mục đích, value là
**`g.src`** (không phải `g.id`) nên dựng lại droplist sau khi xóa ảnh/nhóm vẫn đúng;
`__new__` mở ô `#camGrpNew` để gõ tên mới (kèm tiền tố nếu cần), `camTargetGroup()` trả `null`
khi chưa gõ tên và `deleteEmptyGroup()` dọn hạng mục vừa tạo mà chụp lỗi. `_camLastSrc` nhớ hạng
mục dùng lần gần nhất. `addCapturedFiles()` vẫn đi qua **`intakeFiles()`** như mọi nguồn ảnh khác,
rồi `mkItem(f, '__cam/{src}/{seq}_{tên}')`. Dải `#camStrip` hiện ảnh vừa chụp, dấu ✕ gọi
`camUndo()` → `deleteOne()` để bỏ ngay ảnh chụp lỗi.

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
- Kéo thả / chọn thư mục (File System Access API, fallback `webkitdirectory`), chọn ảnh lẻ,
  hoặc **chụp thẳng bằng camera** (`📷 Chụp ảnh` → `#camModal`, xem mục riêng bên dưới)
- Mỗi **thư mục con = một hạng mục**; ảnh lẻ vào nhóm `Ảnh chưa phân loại`
- Chọn ảnh: **ô tick `.th-ck` luôn hiện ở góc trên-phải mỗi thẻ ảnh** (bấm = thêm/bớt,
  Shift+bấm = chọn dải qua `selRangeTo()`) · **ô tick 3 trạng thái `.grp-ck`** ở tiêu đề hạng mục
  (`toggleGroupSel()` / `paintGroupChecks()`: trống · `–` một phần · `✓` cả nhóm) ·
  nhấp vùng ảnh / Ctrl+nhấp / Shift+nhấp vẫn chọn như cũ. Một nút duy nhất `#btnSelAll`
  (`toggleSelectAll()`) tự đổi nhãn **Chọn tất cả (n) ⇄ Bỏ chọn (n)** trong `updateSelUI()`.
  **Đã bỏ hẳn chế độ khoanh chọn (marquee) và phím `L`** — nó là một *mode* vô hình, chỉ chạy bằng
  `mousedown` nên không dùng được trên cảm ứng; ô tick hiện sẵn tự nói lên là ảnh chọn được.
  Vùng chọn chỉ phục vụ **2 việc**: chú thích gộp và xóa nhiều ảnh
- Mỗi thẻ ảnh có 5 nút: 🖼️ **thay ảnh** (giữ nguyên vị trí + chú thích) · ↻ **xoay 90°** ·
  ＋ **chèn ảnh ngay sau** · 👁 **xem kích thước lớn** · 🗑 **xóa**
- **Ô nhập chú thích ngay dưới mỗi ảnh** — gõ trực tiếp, `Tab`/`Shift+Tab` sang ô kế tiếp,
  bỏ trống = dùng chú thích mặc định (hiện ở placeholder)
- **Dải nút phương án `.th-pa`** dưới mỗi ảnh — **Thay thế · Sửa chữa · Không** (`it.pa`,
  mặc định `'khong'`; `paOf(it)` chuẩn hóa giá trị cũ/thiếu). Ẩn/hiện bằng **class `bb-on` trên
  `<body>`** chứ không vẽ lại gallery. Đây là **nguồn duy nhất** của bảng hạng mục trong biên bản.
  Dải nút là **lưới 3 cột bằng nhau** (`display:grid`) và cho chữ xuống dòng, **không phải**
  `flex` + `white-space:nowrap` — thẻ ảnh trên điện thoại chỉ rộng ~150px nên chữ "Thay thế" dài
  hơn ô nút và tràn đè lên nút bên cạnh
- **Chú thích gộp** cho nhiều ảnh cùng lúc, có xem trước **AutoCorrect**
- **Một thanh công cụ duy nhất** (`.toolbar`) cho cả 3 nút `#btnSelAll` · `#btnBulkCap` ·
  `#btnDelSel` + chip `#chipSel`; nguồn chú thích mặc định tách ra khung `.fsec` riêng ở trên
- **Đã bỏ băng `#alertStats`** (`✅ n hạng mục — m ảnh`): con số đó đã có ở chip `#chipSrc` của thẻ
  *Nguồn ảnh* ngay phía trên và ở `#abMeta` dưới thanh nút. Phần duy nhất chưa có chỗ khác —
  số ảnh nhận dạng `0.` — nay ghép thẳng vào `#chipSrc`. `checkDraft()` cũng không còn ghi vào đó
  (lời mời mở bản nháp đã nằm ngay trên `.draft-bar`)

**Nguồn chú thích mặc định** — `state.capSrc ∈ {auto, file, folder}`, chọn bằng **dải nút
`.segm#capSrcSeg`** (3 nút *Tự động · Theo tên file ảnh · Theo tên hạng mục*) đặt trong một khung
`.fsec` riêng trên danh sách ảnh. **`setCapSrc(src)` nhận MỘT tham số** (trước đây là 2 công tắc
`#swFileName`/`#swFolderName` loại trừ nhau, phải tắt cả hai mới ra `auto` — không ai đoán được).
`syncCapSrcSwitches()` giữ nguyên tên nhưng giờ tô lại dải nút; **`init()` phải gọi nó** để nút
*Tự động* sáng ngay từ đầu. Hồ sơ cũ chỉ có `useFileName` → đọc thành `capSrc`; vẫn ghi cả 2 khóa.

**Chú thích mặc định** (`defaultCapOf`, dùng bởi cả placeholder và `capOf`):
`capSrc='file'` → tên file · `capSrc='folder'` → tên hạng mục · `capSrc='auto'` →
**tên giấy tờ theo tiền tố** `GIAYTO_NAMES` (chỉ kiểu `giayto`, và chỉ khi tên hạng mục còn tiền tố
số hoặc là `UNGROUPED` — đổi tên hạng mục thành tên không có tiền tố thì tên đó thắng) → tên hạng mục.

**Tên hạng mục / tên file làm chú thích phải qua `capName()`** — `lettersOnly()` đổi mọi ký tự
không phải chữ (chữ số, dấu câu, `_`) thành khoảng trắng rồi gộp lại; rỗng thì giữ tên gốc để
chú thích không trống. Số thứ tự vẫn do `capLine()` sinh ở đầu, nên `1. Cốp sau lõm bẹp, rách_2`
→ `5. Cốp sau lõm bẹp rách`. **Không áp dụng** cho `GIAYTO_NAMES` (chứa "A4"/"A5") và cho chú thích
người dùng tự gõ. Python: `letters_only()` / `cap_name()` gọi trong `load_images_with_captions()`
(cả `--thuyet-minh hang-muc` và `ten-file`, không áp cho `--captions`).

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

**Mô hình dữ liệu ảnh**: `state.groups[].items[] = {id, bid, file, path, cap, rot, pa}` — sửa trực tiếp,
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
- Hồ sơ lưu kèm `loaiXe` + `sdtGdv` (hồ sơ cũ thiếu `sdtGdv` thì lấy lại từ `pti_gdv_tel`
  theo tên GĐV), và kèm `cap`, `rot`, `pa` của từng ảnh; khi mở lại dùng đường dẫn giả
  `{chỉ số nhóm}/{tên hạng mục}/{tên file}` để vẫn thêm/bớt ảnh tiếp được

### Biên bản giám định (`#cardBienBan`, bước 2)

Lập **file PDF RIÊNG** theo mẫu `BM.PTI.CG.02.08a` (`BB_FORM`), tên
`Bien ban giam dinh xe {BKS}.pdf` (`BB_PDF_NAME`) — **không nằm trong bản ảnh**.
Toàn bộ mã nằm ở **khối `<script>` cuối cùng** của `index.html`.

> **Mẫu gốc** là `docs/bien_ban_giam_dinh.pdf` (xuất từ `docs/BM.PTI.CG.02.08a Bien ban giam dinh.docx`).
> Mọi số đo trong `BBC` đong từ chính file đó, nên bản dựng ra đặt chồng lên mẫu là khớp.
> Sửa bố cục thì mở lại file mẫu mà đối chiếu, đừng ước lượng.

**Một trang A4 gồm:** logo `pti Insurance` góc trái + tiêu đề `BIÊN BẢN GIÁM ĐỊNH` (cam `#ED7D31`,
căn giữa **khoảng trống bên phải logo**, không phải giữa trang) · mục **I · THÔNG TIN CƠ BẢN**
(cam đậm `#C65911`) · mục **II · THÔNG TIN THIỆT HẠI** + bảng 4 cột · hai ô chữ ký · số trang
`n/m` · **dải cam chân trang** (ảnh `assets/bb-footer.png`).

**Chỉ có khi `bbEnabled()`** = `fLoai === 'chitiet'` **và** `state.bbOn`. `applyBbVisible()` là nơi
duy nhất bật/tắt: ẩn/hiện `#bbSwitchRow` (cả khung ⑤ ở bước 1), **`#ttRow` + `#ttHint`**
(4 ô thông tin tổn thất và dòng ghi chú của chúng ở bước 1), `#cardBienBan` (bước 2)
và class `bb-on` trên `<body>` (dải nút phương án dưới mỗi ảnh).
Gọi từ `onLoaiChange()` và `setBbOn()`.

**Xem trước = file thật.** `bbRenderPreview()` dựng PDF bằng `bbBuild()` rồi vẽ lại bằng **pdf.js**
(`loadPdfjs()`, cùng thư viện với `downloadJPG()`), nên bản xem trước **chính là** file sẽ tải về.
Lần đầu phải bấm nút (cần mạng để tải pdf.js); sau đó `_bbAuto = true` và mọi thay đổi **tự dựng
lại sau 900ms** qua `bbTouch()`. `_bbSeq` chặn lượt dựng cũ ghi đè lượt mới.

**Ba mục của thẻ**: ① bảng hạng mục (dẫn xuất) · ② xem trước PDF · ③ hai ô chữ ký.
Không còn mục xác thực và **không còn ô tích "Tôi đã đọc và đồng ý"** — `bb.agree` luôn `true`,
nút **Ký** của cả hai bên luôn bấm được, `sigConfirm('cus')` ghi `bb.agreeAt` làm dấu thời điểm.

**Dữ liệu** nằm trong object `bb` (không phải `state`), lưu kèm hồ sơ/bản nháp qua
`currentInfo().bb = bbSnapshot()` và phục hồi bằng `bbRestore(i.bb)` trong `loadRecord()` /
`restoreDraft()`; `resetApp()` gọi `bbReset()`. Hồ sơ cũ không có khóa `bb` → `bbRestore(undefined)`
trả về trạng thái trống; khóa thừa của bản cũ (`yKien`, `gdvTel`, `gps`, `contentHash`…) bị bỏ qua.

**Ô bỏ trống thì in dòng chấm** để điền tay (`fld()`), nên biên bản trắng vẫn in ra ký giấy được.
Bảng hạng mục in **đúng số hạng mục đã tích**; **chưa tích ảnh nào** thì mới in `BB_MIN_ROWS` = 10
dòng trống (mẫu giấy không có dòng thừa — đừng thêm lại).

#### Nguồn dữ liệu mục I — 2 ô nhập MỚI ở bước 1
| Dòng in ra | Ô nhập | Nằm ở |
|---|---|---|
| `Tên chủ xe/Lái xe:` | `#fLaiXe` | khung ⑤ |
| `Biển số:` | `#fBks` | khung ② |
| `Loại xe:` | **`#fLoaiXe`** | khung ⑤ |
| `Ngày tai nạn:` | `#fNgayTt` | khung ⑤ |
| `Ngày giám định:` | `#fNgay` | khung ② |
| `Tên GĐV:` | `#fGdv` | khung ③ |
| `Điện thoại GĐV:` | **`#fSdtGdv`** | khung ③ |
| `Địa điểm tai nạn:` *(chỉ khi có nhập)* | `#fDdTt` | khung ⑤ |

`#fSdtGdv` đặt ở khung ③ **cạnh tên GĐV** vì nó là thuộc tính của con người, không phải của hồ sơ:
`pti_gdv_tel` (`getGdvTelMap()`) nhớ **số theo từng tên GĐV**, `rememberGdvTel()` ghi khi rời ô,
`fillGdvTel()` điền lại khi đổi tên — gọi từ `change` của `#fGdv`, từ `pickCombo('fGdv')`
(bấm droplist **không** sinh `change`) và từ `useGdv()`. `fillGdvTel()` **chỉ ghi đè** khi ô số
đang trống hoặc đang giữ số của một GĐV khác trong bộ nhớ, kẻo đang sửa tay thì bị nhảy số.

`#fDdTt` **không có trong mẫu giấy** — chỉ in thêm một dòng khi người dùng có nhập, để biên bản
bỏ trống vẫn giống hệt mẫu. Ga-ra, Số HSBT, Phòng/Khu vực **không in lên biên bản**.

#### Bảng hạng mục — DẪN XUẤT từ ảnh, không nhập tay
`bbRowsFromImages()` duyệt `state.groups[].items[]` **theo đúng thứ tự ảnh**; ảnh có
`paOf(it) ∈ {sua, thay}` thành một dòng, ảnh `khong` bị bỏ. Tên dòng = **tên hạng mục** qua
`capName()` (nhóm `UNGROUPED` thì lấy `capOf(it, g)`), nên nhiều ảnh cùng hạng mục + cùng phương án
gộp thành một dòng (khóa `tên|phương án`).

Bảng có **4 cột** — `STT · CHI TIẾT THIỆT HẠI · PHƯƠNG ÁN · THU HỒI` (`BBC.TCOL`), cột Phương án và
Thu hồi in **chữ** (`BB_PA_LBL` / `BB_HV_LBL`), **không** phải 6 cột đánh dấu `x` như bản cũ.
Bảng trên màn hình 2 (`.bb-tb` + `bbRenderRows()`) dùng đúng 4 cột đó cho khớp bản in.

Cột **Thu hồi** có **mặc định theo phương án** — `bbHvDefault(pa)`:
`thay` → `'co'` · `sua` → `'khong'`. Đây là thứ duy nhất người dùng còn chỉnh được trong bảng.

`bbSyncRows()` dựng lại `bb.rows` nhưng **giữ cột `hv`** theo cùng khóa. Phải dùng
`old.has(key)` chứ **không** phải `old.get(key) || mặc định`: chọn `—` (rỗng) là một lựa chọn thật
của người dùng, `||` sẽ hiểu nhầm thành "chưa đặt" rồi điền lại giá trị mặc định.
Gọi từ: `setItemPa()`, `setBbOn(true)`, `goStep(2)`, `bbRestore()` và **đầu `bbBuild()`**
(bảng luôn khớp ảnh lúc xuất file). Riêng `bbReloadRows()` (nút *🔄 Lấy lại từ ảnh*) gọi
`bbSyncRows(true)` — **đặt lại** cột `hv` về mặc định; đó là đường duy nhất lấy lại mặc định
sau khi đã tự đổi, và để hồ sơ lưu từ bản cũ (cột thu hồi còn trống) điền lại được.

> `capName()` **bỏ hết chữ số**, nên hai hạng mục chỉ khác nhau ở con số
> (`Hạng mục 1` / `Hạng mục 2`) sẽ gộp thành một dòng. Đúng như chú thích ảnh — không phải lỗi.

#### Màn hình ký tay (`#sigModal`)
HTML5 Canvas + **Pointer Events** (chạy chung cho chuột, cảm ứng và bút) — không dùng thư viện ngoài.
- Lớp phủ `.sig-ov` dùng **màu cố định tối** như khối `.cam`, **đổi hệ màu không phải sửa khối này**.
- `sigInit()` đặt canvas theo kích thước thật × `devicePixelRatio` rồi `setTransform(dpr,…)` để vẽ
  theo toạ độ CSS px. **Không bao giờ tô nền** — nhờ vậy ảnh xuất ra là **PNG nền trong suốt**.
- `sigExport()` quét kênh alpha tìm khung bao nét mực rồi **cắt sát** trước khi `toDataURL('image/png')`,
  nên chữ ký lấp đầy ô trên biên bản thay vì thành một chấm nhỏ giữa khoảng trắng.
- Nút *Xong* chỉ bật khi `_sigDirty`. `openSign()` **không còn chặn** — ô tích `#bbAgree` đã bỏ.
- Nhánh phím tắt của `#sigModal` nằm **đầu** handler `keydown` (trước nhánh `#camModal`), nếu không
  `←` `→` sẽ nhảy bước trong lúc đang ký.
- Dưới mỗi ô ký, **tên chỉ in sẵn khi bên đó đã ký điện tử**. Mẫu ghi *"(Ký và ghi rõ họ tên)"* —
  ký giấy thì người ký tự viết tên, in sẵn là sai mẫu.

#### Đã BỎ khỏi biên bản (đừng dựng lại)
| Thứ đã bỏ | Ghi chú |
|---|---|
| Khối `DẤU VẾT KIỂM CHỨNG ĐIỆN TỬ` | kèm theo: GPS (`bbGetGps`), `bb.device`, `bb.contentHash`, `bbPayload()` |
| Mục ① *Thông tin bổ sung* | `bbGdvTel` `bbLxTel` `bbGplx` `bbGaraAddr` `bbGaraTel` `bbPhuLuc` |
| Toàn bộ phần chữ của mẫu cũ | `Hôm nay, ngày … tại :` · `Chúng tôi gồm có:` · `1/ …` `2/ …` · `1. Thông tin tai nạn` · `2. Hạng mục giám định` · `3. Ý kiến các bên` (`BB_YKIEN`, `bb.yKien`) · `4. Đơn vị sửa chữa` · phần kết — mẫu mới chỉ còn mục **I** và **II** |
| Hàm dựng chữ của mẫu cũ | `para()` `wrap()` `cols2()` `dotted()` → thay bằng `put()` `fld()` `row1()` `row2()` `heading()` |
| Khối chữ đầu trang (tên TCT + địa chỉ + tel) | `BB_HEAD_GAP` đã bỏ; thông tin đó nằm trong **ảnh dải cam chân trang**. `BB_ORG`/`BB_ADDR`/`BB_TEL` **chỉ còn là phương án dự phòng** khi thiếu `assets/bb-footer.png` |
| Chân trang `Quy trình giám định … – BM.PTI.CG.02.08a` | thay bằng dải cam + số trang `n/m` |
| Nhập tay bảng hạng mục | `bbFromGroups` `bbAddRow` `bbDelRow` `bbClearRows` → thay bằng `bbSyncRows` |
| Mục ④ *Xác thực thông tin trước khi ký* | `#bbRecap` bỏ khỏi HTML — hàm `bbRecap()` **giữ lại** vì `bbTouch()`/`bbRestore()` vẫn gọi, tự thoát khi không có ô chứa |
| Ô tích **Tôi đã đọc và đồng ý** `#bbAgree` | kèm `bbSetAgree()`; `bb.agree` luôn `true` |

`bb.fileHash` (SHA-256 của chính bytes file) **vẫn giữ** — hiện ở dòng nhỏ dưới nút tải, **không in
lên biên bản**. `pdfDoc.setCreationDate()/setModificationDate()` ghim theo thời điểm ký (không có thì
`2020-01-01`) để **cùng nội dung luôn cho cùng `fileHash`**. `crypto.subtle` cần ngữ cảnh bảo mật →
mở bằng `http` LAN thì `sha256Hex()` trả rỗng, mọi thứ còn lại vẫn chạy.

#### Bố cục PDF biên bản (`BBC`)
| Hằng | Giá trị | Ý nghĩa |
|---|---|---|
| `ML` `MR` `MT` `MB` | `48.6` `32.5` `30` `42` | lề; `MB` chừa chỗ cho dải cam (23,2pt) + dòng số trang |
| `COL2` | `316` | mốc cột phải của mục I (Loại xe · Ngày GĐ · SĐT GĐV) |
| `FS` `LH` | `11.5` `16.3` | cỡ chữ & giãn dòng phần chữ thường |
| `H1` `H2` `HIND` | `16` `12.5` `36` | tiêu đề lớn · `I.`/`II.` · thụt đầu dòng tên mục |
| `TL` `TCOL` | `30.9` `[34.8, 297, 100.4, 99.7]` | bảng **tràn ra ngoài lề chữ** cả hai bên, đúng như mẫu |
| `THH` `TRH` | `24` `18.9` | cao hàng tiêu đề / hàng dữ liệu bảng |
| `LOGO_W` `LOGO_R` | `62` `1.0879` | logo `pti Insurance`: bề ngang + tỷ lệ `w/h` của file PNG |
| `FOOT_H` | `23.2` | dải cam chân trang |

Màu: `BB_ORANGE()` `#ED7D31` (tiêu đề) · `BB_ORANGE2()` `#C65911` (`I.` `II.`) ·
`BB_BLUE()` `#5B9BD5` (nền hàng tiêu đề bảng, chữ trắng). `WHITE()` **dùng chung** với khối dựng
bản ảnh — đã khai báo ở đó, khai lại là lỗi `Identifier 'WHITE' has already been declared`
(các `<script>` cổ điển dùng chung một phạm vi toàn cục).

`bbBuild()` tự **chảy nội dung qua nhiều trang** bằng `need(h)` → `newPage()`; bảng tràn trang thì
`drawHead()` vẽ lại đầu bảng. Dải cam + số trang vẽ **sau cùng** cho mọi trang vì lúc đó mới biết
tổng số trang.

**Bẫy đã sửa, đừng lặp lại:**
1. `fld()` phải cộng lại `' '` sau nhãn — `T()` gộp khoảng trắng nên `T('Biển số: ')` mất dấu cách
   cuối và in ra `Biển số:15K-547.64` dính liền.
2. Giá trị dài (loại xe, địa điểm) phải **tự co cỡ chữ** (tới 7,5pt) **trước khi** cắt bớt.

**Hai ảnh riêng của biên bản** (`embedAssets(pdfDoc, 'bb')`):
- `assets/logo-pti-insurance.png` — logo `pti Insurance` 297×273, **cắt từ chính file mẫu**.
  Thiếu file thì lùi về `logo-pti-bienban.png` (logo PTI SOS bản cũ), thiếu nốt thì huy hiệu vuông.
- `assets/bb-footer.png` — dải cam 1260×49, **lấy nguyên từ file mẫu** nên khớp 100%.
  Thiếu file thì `bbBuild()` tự vẽ lại dải cam bằng `BB_ORG` / `BB_ADDR` / `BB_TEL`.

`embedAssets(pdfDoc, want)` nạp font Be Vietnam Pro + **đúng một** logo, dùng chung cho
`generatePDF()` (`want` bỏ trống → huy hiệu vuông) và `bbBuild()` (`'bb'` → logo + dải cam).
**Đừng nhúng cả hai logo** — logo vuông là PNG 614×614 nên mỗi biên bản sẽ cõng thêm ~130KB chết.

### Hệ màu giao diện — xanh nhạt + vàng nhạt

Toàn bộ giao diện chạy bằng **design token** ở đầu `<style>`; muốn đổi màu thì sửa token,
**không sửa rải rác từng rule**. Bảng token tồn tại ở **cả `index.html` và `huong-dan.html`**
(trang hướng dẫn tự chứa CSS) nên **đổi màu phải đổi ở cả 2 file**, kể cả 3 khối của
`huong-dan.html`: `:root`, `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`
và `:root[data-theme="dark"]`.

| Nhóm token | Giá trị sáng | Dùng ở đâu |
|---|---|---|
| `--brand` `--brand-d` `--brand-m` `--brand-soft` | `#1565C0` `#0D47A1` `#1976D2` `#E3F2FD` | **Màu in của PDF** — giữ nguyên, đừng đổi theo giao diện |
| `--sky` `--sky-2` `--sky-b` | `#DCEBFA` `#EFF6FE` `#C7DEF5` | Nền trang · `.card-hd` · `.grp-hd` · `.th-acts` · `.rec` · `.pv-scroll` · viền thẻ |
| `--sand` `--sand-2` `--sand-b` `--sand-tx` | `#FFFCF2` `#FFF6DC` `#EBD9A8` `#7A5B0B` | `.toolbar` · `.dz` · `.sum` · `.pv-bar` · `.tipbox` · `#emptyState` · `.grp.is-cover .grp-hd` |
| `--bg-grad` | chuyển sắc xanh dọc trang | `body{background-image}` + `background-attachment:fixed` |
| `--r` `--r-sm` `--r-xs` | `16px` `11px` `8px` | bo góc (đã nới từ 14/9/6) |

**Khung thông tin `.fsec`** — mỗi nhóm ô nhập nằm trong MỘT khung có màu, thay cho một dải ô
rời rạc: `.fsec` (xanh nhạt `--sky-2`) = dữ liệu sẽ in ra bản ảnh · `.fsec.warm` (vàng nhạt
`--sand-2`) = tùy chọn / cần để ý. Tiêu đề khung là `.fsec-h` với huy hiệu số `.n`, phần đuôi
`.tag` (chữ mờ, giải thích ngắn) và `.sp` đẩy `.tag` sang phải. Ô nhập **vẫn nền trắng** trong
khung màu, đúng quy ước đọc màu bên dưới.

**Dải nút `.segm`** — chọn 1 trong N bằng một dải nút liền nhau, nút đang chọn mang class `on`
(nền `--brand`). Dùng cho nguồn chú thích; **ưu tiên nó hơn nhiều công tắc loại trừ nhau**.
Trên ≤700px mỗi nút chiếm trọn một hàng (`flex:1 1 100%` + viền trên thay viền trái).

**Khối gấp gọn `details.fold`** — bảng tra cứu dài (bảng tiền tố giấy tờ trong `#giaytoNote`)
để **đóng sẵn**, `summary` nền `--sky-2` có mũi `▾` tự xoay. Bảng bên trong dùng `.gt-tb`.

**Thẻ việc chính `.card.act`** — đầu thẻ tô vàng (`--sand-2` → `--sand`) thay cho xanh, dành cho
thẻ mang hành động chính của màn hình (hiện chỉ `⚡ Xuất PDF` ở bước 2).

**Quy ước đọc màu** (giải thích cho người dùng ở `huong-dan.html` mục 1):
xanh nhạt = khung chứa dữ liệu · ô nhập liệu luôn **nền trắng** trong khung xanh ·
vàng nhạt = khối cần thao tác hoặc cần để ý · `.grp.is-cover` (hạng mục tiền tố `0.`) nền vàng ·
xanh đậm = màu sẽ in ra PDF (khối `#loaiPreview` và preview trang A4).

**Độ tương phản**: mọi cặp chữ/nền đã kiểm ≥ 4.5:1 (WCAG AA). Đáng chú ý —
`--text-3` phải là `#5A7691` (4.74:1 trên trắng); giá trị xám-xanh nhạt hơn như `#89A2BB`
chỉ đạt 2.6:1 nên **không dùng cho chữ**. `--amber` đã đổi từ cam `#E65100` sang vàng-nâu
`#9A6700` để đọc được trên nền vàng nhạt.

**Vạch vàng `#F2C86A`** dày 3px ở đáy `.appbar` (và `.hd` của trang hướng dẫn) là điểm nhấn
duy nhất dùng màu vàng đậm — chấm "hướng dẫn mới" trên nút `Help` dùng `#FFC94D` cho nổi trên
nền xanh của appbar (trước đây dùng `var(--amber)`, sau khi đổi sang vàng-nâu thì bị tối).

### Bố cục trên điện thoại

Các điểm ngắt: **≤980px** (bỏ cột phải) · **≤760px** (`fgrid3` 2 cột, `lay-wrap` 1 cột) ·
**≤700px** (khối RESPONSIVE chính: nút cao ≥42px, ô nhập 16px để iOS không tự phóng to,
`.toolbar`/`.draft-bar` ẩn `.sp` cho nút xếp 2 cái/hàng, `#btnCam` lên đầu `.dz-btns`,
`.fsec` thu lề trong, `.segm` xếp dọc mỗi nút một hàng) ·
**≤620px** (bảng hạng mục + thanh ký) · **≤480px** (`fgrid3` 1 cột, thumbnail 132px,
`#btnCam` chiếm trọn một hàng, **bảng hạng mục bỏ `min-width` để vừa màn hình, không phải vuốt
ngang**) · **≤400px** (ẩn nhãn phụ của appbar/stepper) ·
**`max-height:560px` + landscape** (bỏ `max-height` của `.pv-scroll` / `.bb-pv`).

> **Bẫy thứ tự CSS:** khối RESPONSIVE chung nằm **trước** phần CSS của Biên bản (`.bb-*`,
> `.sig-box`) trong `<style>`. Cùng độ ưu tiên thì **rule viết sau thắng**, nên media query
> cho `.bb-*` phải đặt **sau** khai báo gốc của chúng — có một khối
> *"RESPONSIVE cho khối BIÊN BẢN + MÀN HÌNH KÝ"* riêng ở cuối phần đó. Đừng gộp lên trên.

`huong-dan.html` có điểm ngắt riêng **≤900px** (bỏ mục lục dính) và **≤560px** (thu gọn header,
section, bảng còn `min-width:430px`).

### Khác
- **Dark mode** (nút 🌙, lưu localStorage, mặc định theo hệ điều hành)
- Danh sách GĐV lưu localStorage (`pti_gdv_list`) và danh sách **Phòng / Khu vực** (`pti_phong_list`);
  tên mới nhập được tự thêm vào. Phòng/khu vực là dòng in ở **chân mỗi trang bản ảnh** (`footerText()`)
- **Số điện thoại GĐV** (`pti_gdv_tel`) nhớ theo **tên GĐV** chứ không theo hồ sơ — xem
  *Nguồn dữ liệu mục I* ở phần Biên bản giám định
- **Không có "phòng mặc định"** (hằng `PHONG_DEFAULT` đã bỏ) — lần đầu dùng app thì ô Phòng
  **để trống**. Thay vào đó `pti_phong_last` nhớ tên dùng lần gần nhất: `rememberPhong()` ghi
  (gọi từ sự kiện `change` của `#fPhong`, từ `pickCombo()` vì bấm droplist **không** sinh `change`,
  từ `usePhong()` và từ `startGenerate()`) · `getLastPhong()` đọc khi khởi tạo, khi `resetApp()`
  và khi mở hồ sơ/bản nháp **không có** `phong`. `delPhong()` xóa luôn bộ nhớ nếu xóa đúng tên
  đang được nhớ, kẻo phiên sau lại tự điền tên vừa xóa
- Hai ô đó dùng **droplist tự dựng** (`COMBOS`, `openCombo/renderCombo/pickCombo/placeCombo`),
  **không dùng `<datalist>`** — datalist của trình duyệt luôn lọc theo chữ đang có trong ô nên bấm
  mũi tên hay ra rỗng (ô Phòng thường đã có tên được nhớ từ phiên trước). Bấm ▼ hiện **cả danh sách**; gõ trong khi đang
  mở mới lọc, so sánh **bỏ dấu** (`cmbNorm`). Popup dùng `position:fixed` + `placeCombo()` vì
  `.card` có `overflow:hidden`; `refreshGdvDatalist()` / `refreshPhongDatalist()` giữ tên cũ nhưng
  giờ chỉ vẽ lại droplist đang mở
  - **Hai bẫy đã sửa, đừng lặp lại:** (1) dự án **không có rule `.hidden` chung** (chỉ `.viewer.hidden`
    và `.ov.hidden`), nên popup cần rule riêng `.combo-pop.hidden{display:none}` — thiếu nó thì
    droplist lúc đóng vẫn hiện ra một ô rỗng nhỏ bo tròn ở đáy màn hình (do `position:fixed`), và
    `pickCombo()` bấm vào không ăn vì `comboShow` đã bị `closeCombo()` xóa rỗng.
    (2) Bấm ▼ khi con trỏ đang ở trong ô sẽ `blur` ô **trước** khi `click` chạy → lệnh đóng hẹn giờ
    160ms của handler `blur` sẽ đóng ngay droplist vừa mở. Phải giữ `comboBlurT` và
    `clearTimeout(comboBlurT)` ở đầu `openCombo()`; lần mở đầu tiên không dính lỗi này nên triệu
    chứng là "chỉ chọn được 1 lần"
- Phím tắt: `Ctrl/Cmd+A` chọn tất cả · `Delete` xóa ảnh đã chọn · `Esc` bỏ chọn · `←` `→` chuyển giữa 2 bước
- Khi đang xem ảnh lớn: `←` `→` chuyển ảnh · `R` xoay · `Esc` đóng
- Khi đang ở màn hình ký tay: `Esc` đóng (nhánh này nằm **trước** nhánh màn hình chụp)
- Khi đang ở màn hình chụp: `Space` / `Enter` chụp · `Esc` đóng. Nhánh này nằm **đầu** handler
  phím tắt và bỏ qua cả `BUTTON` (không chỉ ô nhập), kẻo `Enter` trên nút *Xong* vừa chụp vừa đóng

---

## Kiểu bản ảnh & logic phân trang

| Kiểu (`--loai`) | Tiêu đề header | Phân trang |
|---|---|---|
| `chitiet` | Giám định chi tiết xe ô tô BKS | Ảnh prefix `0.` ra **trang đầu riêng**, sau đó ảnh hạng mục ghép liên tục |
| `hientruong` | Giám định hiện trường xe ô tô BKS | Toàn bộ ảnh ghép liên tục |
| `giayto` | Giám định giấy tờ xe ô tô BKS | **Bố cục tự động theo tiền tố số** — trộn được trang ngang và dọc trong cùng file |
| `xacminh` | Ảnh xác minh hiện trường xe ô tô BKS | Toàn bộ ảnh ghép liên tục |

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

Chỉ `chitiet` có dòng 3 là `Địa điểm tại Gara : {ga_ra}`; 3 loại còn lại in thẳng `{ga_ra}`.

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

Tên file mặc định: `output/{tên theo kiểu} {BKS}.pdf` — bảng tên nằm ở `PDF_NAME_MAP`
(Python) / `PDF_NAME` (web) và **phải khớp nhau**:

| Kiểu | Tên file |
|---|---|
| `chitiet` | `Anh GD chi tiet xe {BKS}.pdf` |
| `hientruong` | `Anh GD hien truong xe {BKS}.pdf` |
| `giayto` | `Anh GD giay to xe {BKS}.pdf` |
| `xacminh` | `Anh xac minh hien truong xe {BKS}.pdf` |

Tên không dấu cho dễ gửi email / nạp hệ thống. Biển số giữ nguyên như người dùng gõ, chỉ thay
ký tự Windows cấm (`\ / : * ? " < > |`) bằng khoảng trắng. Không có BKS thì lấy mã hồ sơ,
không có cả hai thì `Ban anh`.

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
| Footer | Tên **Phòng / Khu vực** do người dùng nhập (xám trái) + `{trang}/{tổng trang}` (xanh phải), `C.FOOTER_FS` / `FOOTER_FS` = **13 × 2/3 ≈ 8,7pt** |
| Caption | 14pt, tự thu nhỏ nếu tràn |
| Tiêu đề header | **căn trái**, cách mép phải logo `C.HEAD_X` / `HEAD_X_MM` = **12mm** · **3 dòng**: ① `{loại} : {BKS}  -  Ngày: {ngày}` 15pt Bold · ② `Số HSBT: {mã hồ sơ}` + **cách 10mm** + `{GĐV}` (cùng một dòng, 14pt) · ③ `{ga-ra}` 14pt |
| Khoảng cách 2 đoạn trên dòng 2 | `C.SEG_GAP` / `HEAD_SEG_MM` = **10mm** — giữ nguyên khi dòng bị co |
| Thu nhỏ tiêu đề | tự co theo `headerMetrics()` / `fit` để vừa 20mm — khối 3 dòng (15+14+14) cao ~47,8pt nên `fit` = 1 (không co theo chiều dọc). Riêng **dòng 1 trên A4 dọc luôn dài hơn vùng chữ** nên tự hạ cỡ chữ (chitiet ~14,5pt · hientruong/xacminh ~13,5pt). **Đừng giảm `HEAD_X` để chữa**: muốn giữ đủ 15pt thì `chitiet` cần `HEAD_X` ≤ 4,7mm, còn `hientruong`/`xacminh` cần số âm — tự co là bắt buộc. A4 ngang thì luôn đủ 15pt |
| Dòng 2 & 3 co chung | hai dòng mang `grp:'b'` (web) / nhóm `"b"` (Python) → **luôn cùng một cỡ chữ**: đo riêng từng dòng rồi lấy **cỡ nhỏ nhất** của nhóm. Ga-ra dài làm cả dòng Số HSBT/GĐV nhỏ theo, và ngược lại |
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
5. **Giãn dòng header phải tính bằng point, không phải mm.** Khối 3 dòng (15+14+15) với giãn 2pt
   cao ~48pt — vừa khung 20mm (≈56,7pt). Nếu dùng `_pts(2)` (2mm ≈ 5,7pt) thì khối phình thêm
   ~7pt và dòng cuối thò xuống dưới nền xanh.
6. **Đoạn "Số HSBT" chỉ in khi có mã hồ sơ**, nên số dòng/đoạn của header thay đổi theo dữ liệu —
   `draw_header()` và `headerLines()` phải tính chiều cao khối động rồi mới canh giữa, không hard-code.
   Mỗi dòng header là một **danh sách đoạn** (`segs` / tuple `(segs, size, bold)`), cách nhau
   `C.SEG_GAP` = 10mm. Việc dựng header chia 2 bước: **đo trước** (`prep` / `prepared`) để tìm cỡ
   chữ vừa bề ngang của từng dòng — tính cả khoảng cách giữa các đoạn — rồi các dòng cùng nhóm
   lấy cỡ nhỏ nhất, **sau đó mới vẽ** (`drawLeft()` / `_draw_left()`, chỉ cắt bớt **đoạn cuối**
   nếu vẫn tràn). Bước xuống dòng vẫn dùng **cỡ khai báo**, không dùng cỡ đã co, để khối chữ
   giữ đúng chiều cao mà `headerMetrics()` đã tính.
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
