# Chạy IndieWork trên SQLite (thay vì Postgres)

Tài liệu này hướng dẫn chạy IndieWork với **SQLite**: cả database chỉ là một file trên
đĩa, không cần dựng server Postgres. Nó mô tả cách bật chế độ này, tạo schema, đổ dữ
liệu mẫu (seed) và chạy app, kèm phần "khi nào nên dùng" và giới hạn. Dành cho người
muốn **tự host nhẹ** hoặc dựng một bản **demo** nhanh. Bản chạy thật (production) trên
Postgres không đổi gì, xem [deploy-vps.md](./deploy-vps.md) và [demo.md](./demo.md).

App chọn database 100% qua biến môi trường `DB_DRIVER`, nên đổi qua lại Postgres ↔
SQLite chỉ là đổi env, không phải sửa code.

## Thuật ngữ

- **driver**: backend database mà app nói chuyện. Ở đây có hai: `postgres` (mặc định)
  và `sqlite`. Chọn bằng biến `DB_DRIVER`.
- **schema**: định nghĩa các bảng/cột. App có hai bản schema song song, một cho Postgres
  (`schema.ts`), một cho SQLite (`schema.sqlite.ts`), cấu trúc giống hệt nhau.
- **push** vs **migrate**: `migrate` áp các file migration có đánh số (bản Postgres dùng,
  có lịch sử trong [`drizzle/`](../../drizzle/)). `push` thì so schema với database rồi
  tạo/sửa bảng trực tiếp, không lưu lịch sử. SQLite ở đây dùng `push` vì database SQLite
  là loại "dùng xong bỏ" (demo/self-host), không cần lịch sử migration.
- **seed**: đổ dữ liệu khởi tạo vào database. `seed` tạo một workspace mặc định; `seed:sample`
  dựng sẵn 4 project demo kèm task, comment, để có cái nhìn ngay.
- **ref**: định danh công khai của một task, dạng `KEY-seq` (ví dụ `DISK-3`). Giống nhau
  trên cả hai driver vì ID nội bộ vẫn là chuỗi uuid như Postgres (xem [Cách hoạt động](#cách-hoạt-động)).

## Khi nào nên dùng SQLite, khi nào nên Postgres

Dùng **SQLite** khi:

- Muốn chạy thử hoặc dựng demo mà không phải cài/đụng tới Postgres.
- Một người dùng, một máy, lưu lượng nhỏ. Cả database nằm gọn trong một file, backup =
  copy file, reset = xóa file.

Dùng **Postgres** (mặc định) khi:

- Chạy thật, cần độ bền cao, sao lưu/khôi phục bài bản, hoặc nhiều tiến trình/bản app
  cùng truy cập.

SQLite ở đây hợp cho bản nhẹ, không thay thế Postgres cho bản chạy nghiêm túc.

## Bật chế độ SQLite

Đặt hai biến môi trường (`SQLITE_PATH` có thể bỏ qua, mặc định `./data/iw.db`):

```env
DB_DRIVER=sqlite
SQLITE_PATH=./data/iw.db
```

Khi `DB_DRIVER=sqlite`, biến `DATABASE_URL` (chuỗi kết nối Postgres) **không cần** nữa.

Có hai cách truyền biến:

- **Đặt một lần trong `.env`**: thêm `DB_DRIVER=sqlite` vào file `.env`, sau đó mọi lệnh
  (kể cả `pnpm dev`) tự chạy trên SQLite, không cần gõ lại.
- **Đặt theo từng lệnh**: thêm `DB_DRIVER=sqlite` ngay trước lệnh. Các script đuôi
  `:sqlite` ở dưới đã đặt sẵn biến này, nên không cần gõ thêm.

## Chạy lần đầu

Vẫn cần đủ ba secret như bản Postgres (`APP_PASSWORD`, `COOKIE_SECRET` từ 32 ký tự trở
lên, `API_TOKEN`); chỉ phần database là khác.

```bash
pnpm install
cp .env.example .env            # đặt APP_PASSWORD, COOKIE_SECRET, API_TOKEN (DATABASE_URL không cần)
pnpm db:push:sqlite             # tạo schema trong ./data/iw.db
pnpm db:seed:sample:sqlite      # tùy chọn: 4 project demo + task (hoặc db:seed:sqlite nếu chỉ cần 1 workspace)
DB_DRIVER=sqlite pnpm dev       # http://localhost:3000
```

Mở <http://localhost:3000>, đăng nhập bằng `APP_PASSWORD`. Nếu đã thêm `DB_DRIVER=sqlite`
vào `.env` thì chạy thẳng `pnpm dev`, khỏi cần tiền tố.

## Các lệnh

| Lệnh | Làm gì |
|---|---|
| `pnpm db:push:sqlite` | Tạo/cập nhật schema trong file SQLite (`SQLITE_PATH`, mặc định `./data/iw.db`). |
| `pnpm db:seed:sqlite` | Đổ một workspace mặc định (idempotent, chạy lại không nhân đôi). |
| `pnpm db:seed:sample:sqlite` | Dựng 4 project demo (DISK, SITE, API, MOBILE) + task/comment. Chạy lại sẽ reset lại đúng 4 project đó. |
| `pnpm db:studio:sqlite` | Mở Drizzle Studio xem/sửa dữ liệu trong file SQLite. |

Các lệnh trên dùng đúng `seed-sample.ts` mà bản Postgres dùng, không có file seed riêng
cho SQLite.

## Reset dữ liệu

- **Xóa sạch**: xóa file `./data/iw.db` (cùng các file `-wal`, `-shm` nếu có), rồi chạy
  lại `pnpm db:push:sqlite` và một lệnh seed.
- **Dựng lại data mẫu**: chỉ cần chạy lại `pnpm db:seed:sample:sqlite`. Lệnh seed tự xóa
  4 project demo cũ (xóa cascade kéo theo task/comment) rồi dựng lại, nên không cần xóa file.

## Cách hoạt động

- App tách rõ ba "cửa" (web, REST API, MCP) gọi chung một **service layer** (lớp xử lý
  nghiệp vụ ở `src/server/services/`). Lớp này không biết đang chạy driver nào: nó chỉ
  import `db` và `schema` từ [`src/server/db/index.ts`](../../src/server/db/index.ts),
  còn file đó mới chọn driver theo `DB_DRIVER`.
- Driver SQLite dùng **libsql** (`@libsql/client`), không phải `better-sqlite3`. Lý do:
  service layer chạy transaction kiểu bất đồng bộ (`await db.transaction(async (tx) => …)`),
  mà `better-sqlite3` chạy đồng bộ nên không hỗ trợ kiểu này; libsql thì có.
- `schema.sqlite.ts` là bản sao 1:1 của `schema.ts`: khóa chính uuid lưu thành chuỗi
  text (nên `ref` như `DISK-3` giữ y nguyên), mốc thời gian lưu thành số epoch, mảng
  `tags` lưu dạng JSON. Một test (`tests/schema-parity.test.ts`) kiểm tra hai bản schema
  luôn cùng bảng, cùng cột, để tránh lệch ngầm.

## Giới hạn cần biết

- **Một tiến trình ghi**: cả ba cửa (web/API/MCP) ghi qua cùng một tiến trình app. Với
  một người dùng thì hiếm khi tranh chấp; app đã bật sẵn `busy_timeout` để né lỗi
  `SQLITE_BUSY` thi thoảng.
- **File nằm trên đĩa local**: không chia sẻ một file SQLite giữa nhiều máy/nhiều bản app,
  và không scale ngang như Postgres. Backup là copy file lúc app rảnh.
- Cần độ bền/đồng thời cao hơn thì chuyển về Postgres: bỏ `DB_DRIVER=sqlite`, đặt lại
  `DATABASE_URL`, chạy `pnpm db:migrate` rồi seed như thường.
