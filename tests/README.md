# Kiểm thử màn hình 3 (Công cụ file) & màn hình 4 (Quét tài liệu)

Chạy **11 công cụ file** và **bộ quét tài liệu** của [`index.html`](../index.html) bằng Node,
không cần mở Chrome.

Cách làm: trích **hai khối `<script>` cuối** của `index.html` — tìm theo dấu mốc
`MÀN HÌNH 3` / `MÀN HÌNH 4` trong chú thích, **không** lấy theo thứ tự — rồi chạy chúng
với một DOM tối giản (`$()` giả, mỗi `id` là một ô nhập có `value`/`checked`). Nhờ đọc thẳng
`index.html` nên bộ test **không có bản sao mã nguồn nào** — sửa app là test theo ngay,
không bao giờ lệch bản.

> ⚠️ Vì vậy **đừng viết thẻ `script` nguyên văn trong chú thích HTML** của `index.html`:
> biểu thức chính quy tách khối sẽ cắt nhầm và test đứng ngay từ dòng đầu.

## Chạy

```bash
cd tests
npm install        # lần đầu
npm test           # cả 4 bộ
npm run t2         # chỉ một bộ
npm run check      # kiểm cú pháp + kiểm id (cần Python)
```

| Lệnh | Kiểm gì | Thư viện |
|---|---|---|
| `t1` · `test.mjs` | hàm tiện ích, đọc ZIP, Word/Excel → PDF | pdf-lib **giả lập** (ghi lại mọi lệnh vẽ) |
| `t2` · `test2.mjs` | nối · tách · sắp xếp trang · đánh số · đóng dấu · Office → PDF · luồng giao diện | pdf-lib **thật** + font thật |
| `t3` · `test3.mjs` | nén PDF · PDF→ảnh · ảnh→PDF · đổi định dạng ảnh | pdf-lib + **node-canvas** + **pdfjs-dist 3.11.174** |
| `t4` · `test4.mjs` | **màn hình 4**: ma trận phối cảnh · tìm mép giấy · chỉnh thẳng · 5 bộ lọc làm rõ · nạp trang → xuất PDF/JPG · dấu & ghi chú · .txt/.docx/PDF tìm kiếm được · xoay trang · chạy thử hai lớp phủ | pdf-lib + **node-canvas** + **pdfjs-dist** |
| `check.py` | `node --check` từng khối `<script>`, báo tên khai báo trùng giữa các khối | — |
| `check_ids.py` | mọi `$('id')` của màn hình 3 **và 4** có id thật; mọi `onclick=` có hàm thật | — |

## Ba điều phải biết trước khi sửa

1. **Phải dùng `vm.runInThisContext`, không dùng `vm.createContext`** ở `test2`/`test3`/`test4`.
   pdf-lib kiểm `instanceof Array`, mà mảng tạo trong realm khác không qua được phép kiểm đó.
   Riêng `test1` dùng pdf-lib giả lập nên `createContext` vẫn được.
2. **Thiếu file mẫu thì BỎ QUA, không phải lỗi.** Các file đầu vào nằm trong
   [`docs/`](../docs/) (`*.docx`, `*.xlsx`, `*.pdf`) đều bị `.gitignore` vì là tài liệu nội bộ
   và `bien_ban_giam_dinh.pdf` có dữ liệu khách hàng thật. Bản clone từ GitHub sẽ không có
   chúng; test in dấu `–` và nói rõ thiếu file nào. Phần không phụ thuộc file mẫu vẫn chạy đủ.
3. **Kết quả ghi vào `tests/.out/`** (đã gitignore) chứ không ra thư mục làm việc — các PDF đó
   dẫn xuất từ tài liệu có dữ liệu thật nên **không được đẩy lên repo public**.

4. **`localStorage` và `navigator` của Node 24 là thuộc tính chỉ đọc của `globalThis`** —
   `Object.assign(globalThis, {...})` ném lỗi, phải đặt bằng `Object.defineProperty`
   (xem đầu `test4.mjs`).
5. **`scIntake()` tự gọi `scRunQueue()`**, nên gọi `scRunQueue()` lần nữa sẽ trả về ngay
   (có cờ `_scRunning`). Phép thử phải đợi `scn.busy` hạ xuống bằng `waitIdle()`.

`npm run t3` và `npm run t4` cần biên dịch **node-canvas**; máy không có bộ build C++ thì cài sẽ lỗi.
Khi đó bỏ `t3`/`t4` và kiểm các phần cần canvas bằng mắt trong trình duyệt.

Xem thêm mục *Màn hình 3 — Công cụ file* → *Kiểm thử ngoài trình duyệt* trong
[`CLAUDE.md`](../CLAUDE.md).
