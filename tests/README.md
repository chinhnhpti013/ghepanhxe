# Kiểm thử màn hình 3 — Công cụ file

Chạy **11 công cụ file** của [`index.html`](../index.html) bằng Node, không cần mở Chrome.

Cách làm: trích **khối `<script>` cuối cùng** của `index.html` rồi chạy nó với một DOM
tối giản (`$()` giả, mỗi `id` là một ô nhập có `value`/`checked`). Nhờ đọc thẳng
`index.html` nên bộ test **không có bản sao mã nguồn nào** — sửa app là test theo ngay,
không bao giờ lệch bản.

## Chạy

```bash
cd tests
npm install        # lần đầu
npm test           # cả 3 bộ
npm run t2         # chỉ một bộ
npm run check      # kiểm cú pháp + kiểm id (cần Python)
```

| Lệnh | Kiểm gì | Thư viện |
|---|---|---|
| `t1` · `test.mjs` | hàm tiện ích, đọc ZIP, Word/Excel → PDF | pdf-lib **giả lập** (ghi lại mọi lệnh vẽ) |
| `t2` · `test2.mjs` | nối · tách · sắp xếp trang · đánh số · đóng dấu · Office → PDF · luồng giao diện | pdf-lib **thật** + font thật |
| `t3` · `test3.mjs` | nén PDF · PDF→ảnh · ảnh→PDF · đổi định dạng ảnh | pdf-lib + **node-canvas** + **pdfjs-dist 3.11.174** |
| `check.py` | `node --check` từng khối `<script>`, báo tên khai báo trùng giữa các khối | — |
| `check_ids.py` | mọi `$('id')` của màn hình 3 có id thật; mọi `onclick=` có hàm thật | — |

## Ba điều phải biết trước khi sửa

1. **Phải dùng `vm.runInThisContext`, không dùng `vm.createContext`** ở `test2`/`test3`.
   pdf-lib kiểm `instanceof Array`, mà mảng tạo trong realm khác không qua được phép kiểm đó.
   Riêng `test1` dùng pdf-lib giả lập nên `createContext` vẫn được.
2. **Thiếu file mẫu thì BỎ QUA, không phải lỗi.** Các file đầu vào nằm trong
   [`docs/`](../docs/) (`*.docx`, `*.xlsx`, `*.pdf`) đều bị `.gitignore` vì là tài liệu nội bộ
   và `bien_ban_giam_dinh.pdf` có dữ liệu khách hàng thật. Bản clone từ GitHub sẽ không có
   chúng; test in dấu `–` và nói rõ thiếu file nào. Phần không phụ thuộc file mẫu vẫn chạy đủ.
3. **Kết quả ghi vào `tests/.out/`** (đã gitignore) chứ không ra thư mục làm việc — các PDF đó
   dẫn xuất từ tài liệu có dữ liệu thật nên **không được đẩy lên repo public**.

`npm run t3` cần biên dịch **node-canvas**; máy không có bộ build C++ thì cài sẽ lỗi.
Khi đó bỏ `t3` và kiểm 4 công cụ cần canvas bằng mắt trong trình duyệt.

Xem thêm mục *Màn hình 3 — Công cụ file* → *Kiểm thử ngoài trình duyệt* trong
[`CLAUDE.md`](../CLAUDE.md).
