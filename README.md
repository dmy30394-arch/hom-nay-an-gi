# Hôm nay ăn gì? — Google Sheets + Vercel

Kiến trúc:

`Trình duyệt → Vercel /api/dishes → Google Sheets`

Google Sheets là nơi lưu dữ liệu chung. Mọi người mở website đều đọc cùng một danh sách; thêm/xóa/sửa món sẽ ghi vào cùng một Sheet. Frontend tự đồng bộ lại khoảng mỗi 3 giây.

## 1. Tạo Google Sheet

Tạo một Google Spreadsheet, tạo tab tên `MonAn` và hàng đầu tiên:

| A | B | C | D |
|---|---|---|---|
| id | category | name | createdAt |

Các category mà web sử dụng:

- `mon-man`
- `mon-canh`
- `com-ngoai`

## 2. Tạo Google Cloud Service Account

Trong Google Cloud tạo project, bật **Google Sheets API**, sau đó tạo Service Account và tạo JSON key.

Lấy:

- `client_email`
- `private_key`

Chia sẻ Google Sheet cho `client_email` của Service Account với quyền **Editor**.

Google Sheets API hỗ trợ đọc/ghi giá trị và append hàng; backend của project này dùng các API đó. Xem tài liệu chính thức: https://developers.google.com/workspace/sheets/api/guides/values

## 3. Biến môi trường trên Vercel

Trong Vercel → Project → Settings → Environment Variables thêm:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@...iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_SHEET_ID=ID_CUA_GOOGLE_SHEET
GOOGLE_SHEET_NAME=MonAn
```

`GOOGLE_SHEET_ID` là đoạn nằm giữa `/d/` và `/edit` trong URL Google Sheet.

Sau khi đổi environment variables, redeploy project để biến mới có hiệu lực.

## 4. Deploy Vercel

Upload/push toàn bộ thư mục này lên GitHub rồi import repository vào Vercel.

Vercel sẽ nhận `index.html` làm frontend và `api/dishes.js` làm Serverless Function.

## 5. Lưu ý về “theo thời gian thực”

Bản này dùng polling khoảng 3 giây: các tab đang mở sẽ tự lấy dữ liệu mới từ Google Sheets. Đây là đồng bộ gần thời gian thực, không phải WebSocket.

Nếu sau này cần realtime thật sự, có thể chuyển backend sang Supabase/Firebase hoặc thêm realtime layer.

## 6. Quyền chỉnh sửa

API hiện cho phép người truy cập website thêm, sửa và xóa món. Điều này đúng với yêu cầu “ai cũng có thể chỉnh”. Nếu muốn chỉ một số người được sửa, cần thêm đăng nhập/quyền quản trị.
