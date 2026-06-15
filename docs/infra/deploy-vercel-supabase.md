# Deploy IndieWork lên Vercel + Supabase

Hướng deploy **không cần VPS**: [Vercel](https://vercel.com) build + serve Next.js,
[Supabase](https://supabase.com) cho Postgres managed. Đây là lựa chọn thay thế cho
[deploy-vps.md](./deploy-vps.md) (tự host Docker) và [ci-cd.md](./ci-cd.md) (CI build → VPS).

App này **chỉ dùng phần Postgres** của Supabase — không đụng Auth / RLS / Storage. App
nối DB như một client Postgres bình thường qua `pg`, nên Supabase với nó chỉ là một
Postgres có sẵn TLS.

## Chọn hướng nào?

| | Vercel + Supabase | VPS + Docker |
|---|---|---|
| Hạ tầng | Không quản server, HTTPS tự lo | Tự quản VPS, reverse proxy, firewall |
| DB | Supabase managed (backup sẵn) | Postgres tự cài/tự backup |
| Build | Trên Vercel | Trên VPS hoặc CI ([ci-cd.md](./ci-cd.md)) |
| Khi nào dùng | Muốn nhanh, không muốn ops | Muốn tự chủ hoàn toàn / chạy nội bộ |

## Khác biệt cốt lõi so với Docker

Image Docker tự chạy `migrate + seed` trong entrypoint mỗi lần boot. **Vercel không có
entrypoint** kiểu đó — nó chỉ chạy `next build` rồi serve. Nên migration phải chạy
**thủ công từ máy bạn** trỏ vào Supabase (xem [Bước 2](#bước-2--migrate--seed-từ-máy-local)).
`next build` không cần DB thật: [`src/server/env.ts`](../../src/server/env.ts) chỉ validate
*định dạng* 4 biến env lúc build, còn pool `pg` là lazy và mọi route đều force-dynamic.

## Bước 1 — Tạo project Supabase + lấy connection string

1. Tạo project ở [database.new](https://database.new). Chọn region **gần region Vercel**
   của bạn để giảm latency. Lưu lại **database password**.
2. Vào **Connect** (hoặc Project Settings → Database) và copy **2** connection string —
   cùng host `...pooler.supabase.com`, khác cổng:

   | Dùng cho | Mode | Cổng | Vì sao |
   |---|---|---|---|
   | App chạy trên Vercel | **Transaction pooler** | `6543` | Hợp serverless: nhiều function instance, pooler gom kết nối. IPv4. |
   | Chạy migration từ local | **Session pooler** | `5432` | Giữ session đầy đủ cho `migrate`. IPv4. |

   > **Đừng dùng "Direct connection" (`db.<ref>.supabase.co:5432`)** từ Vercel — nó là
   > **IPv6-only** (trừ khi mua IPv4 add-on), function của Vercel sẽ không nối được. Luôn
   > dùng host `...pooler.supabase.com`.

Hai chuỗi có dạng (copy nguyên từ dashboard, chỉ thay `[PASSWORD]`):

```text
# App  (transaction, 6543)
postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
# Migrate (session, 5432)
postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

### Bắt buộc: thêm `sslmode=no-verify`

App tạo pool bằng `new Pool({ connectionString })` **không truyền option `ssl`** và không
bundle CA của Supabase. Trong `pg-connection-string@2.13.0` (bản đang dùng), `sslmode=require`
được coi như `verify-full` → Node sẽ cố verify CA, mà cert pooler không nằm trong trust
store mặc định của Node nên dễ lỗi `self-signed certificate in certificate chain`. Cách chắc
ăn: dùng `sslmode=no-verify` (vẫn mã hoá TLS, chỉ bỏ verify CA):

```text
…/postgres?sslmode=no-verify
```

> Nếu chuỗi copy từ dashboard **đã có** sẵn query param (vd `?workaround=...`), thì nối thêm
> bằng `&sslmode=no-verify` (không phải `?`).
>
> Nếu password có ký tự đặc biệt (`@ # / : ?`...), phải **URL-encode** nó trong chuỗi, nếu
> không sẽ lỗi nối DB khó hiểu.

## Bước 2 — Migrate + seed từ máy local

Chạy **một lần** với DB Supabase mới (và mỗi lần đổi schema sau này), dùng **session pooler
(5432)**. Lệnh dưới chạy thẳng script — không phụ thuộc `.env` (giống entrypoint Docker):

```bash
DB='postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=no-verify'

DATABASE_URL="$DB" node --import tsx src/server/db/migrate.ts   # tạo bảng
DATABASE_URL="$DB" node --import tsx src/server/db/seed.ts      # 1 workspace mặc định
# (tuỳ chọn) dữ liệu mẫu để xem demo:
# DATABASE_URL="$DB" node --import tsx src/server/db/seed-sample.ts
```

> `pnpm db:migrate` / `db:seed` cũng được — biến `DATABASE_URL` export ở shell **thắng**
> `--env-file=.env` (Node ưu tiên env có sẵn của process), nên nó vẫn trỏ vào Supabase chứ
> không phải DB local. Dùng dạng `node --import tsx` ở trên cho chắc, khỏi lệ thuộc thứ tự đó.

## Bước 3 — Tạo project trên Vercel + set env

1. [Vercel](https://vercel.com/new) → **Import** repo này. Vercel tự nhận diện Next.js +
   pnpm (có `pnpm-lock.yaml`); để **Build Command** và **Output** mặc định.
2. **Settings → Environment Variables**, thêm 4 key (chọn cả **Production** và **Preview**
   nếu xài preview deploy — env áp dụng cho cả build lẫn runtime):

   | Key | Giá trị |
   |---|---|
   | `DATABASE_URL` | Chuỗi **transaction pooler (6543)** + `?sslmode=no-verify` |
   | `APP_PASSWORD` | Mật khẩu đăng nhập web |
   | `COOKIE_SECRET` | `openssl rand -hex 32` (≥ 32 ký tự) |
   | `API_TOKEN` | `openssl rand -hex 24` (Bearer cho REST + MCP) |

   > **Đừng** tự set `NODE_ENV` — Vercel đặt sẵn `production`, `env.ts` cũng tự default.

## Bước 4 — Deploy

Bấm **Deploy** (hoặc `git push` lên `main`). Vercel build → serve. Vào URL `*.vercel.app`,
đăng nhập bằng `APP_PASSWORD`. Gắn custom domain trong **Settings → Domains** (HTTPS tự cấp).

## Cập nhật về sau

- **Đổi code (không đổi schema):** `git push` → Vercel tự build + deploy.
- **Đổi schema:** chạy lại [Bước 2 `migrate`](#bước-2--migrate--seed-từ-máy-local) **trước**,
  rồi mới push code mới (migration của repo này luôn cộng thêm, nên migrate trước thì bản cũ
  vẫn chạy bình thường trong lúc deploy).
- **Rollback:** Vercel → Deployments → chọn build cũ → **Promote to Production**.

### (Tuỳ chọn) Tự migrate trong build command

Muốn mỗi deploy tự migrate (giống entrypoint Docker) thì đổi **Build Command** trên Vercel:

```bash
node --import tsx src/server/db/migrate.ts && node --import tsx src/server/db/seed.ts && next build
```

> Không dùng `pnpm db:migrate` ở đây: script đó có `--env-file=.env`, mà Vercel **không có**
> file `.env` → Node báo lỗi thiếu file. Phải gọi thẳng `node --import tsx` như trên.
> Lưu ý: cách này migrate vào đúng `DATABASE_URL` của môi trường đang build (cả Preview), và
> chạy mỗi lần build — chấp nhận được vì migrate/seed đều idempotent, nhưng nếu Preview và
> Production khác DB thì cân nhắc.

## Connection string cheat-sheet

| | Host:Port | Mode | Dùng ở |
|---|---|---|---|
| `DATABASE_URL` (Vercel env) | `…pooler.supabase.com:6543` | transaction | App runtime |
| Lệnh migrate/seed (local) | `…pooler.supabase.com:5432` | session | Bước 2 |

Cả hai luôn kèm `?sslmode=no-verify` (hoặc `&sslmode=no-verify` nếu đã có query param khác).

## Khắc phục sự cố

- **`self-signed certificate in certificate chain`:** thiếu `sslmode=no-verify` trong
  `DATABASE_URL` (xem [Bước 1](#bắt-buộc-thêm-sslmodeno-verify)).
- **`ENETUNREACH` / không nối được DB từ Vercel:** đang dùng **Direct connection** (IPv6).
  Đổi sang host `...pooler.supabase.com`.
- **Lỗi nối DB tuy chuỗi "trông đúng":** password chưa **URL-encode** ký tự đặc biệt.
- **Build fail `Invalid environment configuration`:** thiếu 1 trong 4 env trên Vercel, hoặc
  `COOKIE_SECRET` < 32 ký tự (`env.ts` validate lúc build).
- **`remaining connection slots` / quá nhiều kết nối:** app phải trỏ **transaction pooler
  (6543)**, không phải session/direct.
- **Login xong vẫn trống / lỗi truy vấn:** chưa chạy [Bước 2](#bước-2--migrate--seed-từ-máy-local)
  (bảng chưa tạo / chưa có workspace).
