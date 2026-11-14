# Skills — Ảnh Giám Định Xe Theo Tên File

## /tao-anh-doc

Tạo PDF ảnh giám định layout **dọc** (Portrait A4, 6 ảnh/trang).

**Bước thực hiện:**
1. Hỏi người dùng: tên giám định viên và ngày giám định (nếu chưa cung cấp)
2. Chạy `python dat_ten_file.py`
3. Chạy `python ghep_anh.py --gdv "{tên GĐV}" --layout doc --ngay "{ngày}"`
4. Thông báo kết quả: tên file PDF, số trang, số ảnh

---

## /tao-anh-ngang

Tạo PDF ảnh giám định layout **ngang** (Landscape A4, 4 ảnh/trang).

**Bước thực hiện:**
1. Hỏi người dùng: tên giám định viên và ngày giám định (nếu chưa cung cấp)
2. Chạy `python dat_ten_file.py`
3. Chạy `python ghep_anh.py --gdv "{tên GĐV}" --layout ngang --ngay "{ngày}"`
4. Thông báo kết quả: tên file PDF, số trang, số ảnh

---

## /lam-lai-ho-so

Dọn dẹp và chuẩn bị làm lại hồ sơ mới từ đầu.

**Bước thực hiện:**
1. Xóa toàn bộ file PDF trong `output/`
2. Nhắc người dùng: đặt ảnh mới vào `input/`, cập nhật `Bao_gia.xlsx` nếu cần
3. Hỏi xác nhận trước khi tiếp tục
4. Gợi ý chạy `/tao-anh-doc` hoặc `/tao-anh-ngang`
