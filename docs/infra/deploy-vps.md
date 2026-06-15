# Deploy IndieWork lên VPS (Docker)

Hướng dẫn deploy IndieWork lên một VPS **trắng** (Ubuntu, chưa cài gì) bằng Docker,
theo 2 hướng tương ứng 2 file compose trong [`docker/`](../../docker/):

- **Hướng 1 — Postgres trong container** ([`compose.postgres-container.yml`](../../docker/compose.postgres-container.yml)):
  cả app và Postgres đều chạy trong Docker.
- **Hướng 2 — Postgres trên host** ([`compose.postgres-host.yml`](../../docker/compose.postgres-host.yml)):
  chỉ app chạy trong Docker, Postgres cài thẳng trên VPS.

Image app (xem [`docker/Dockerfile`](../../docker/Dockerfile)) **tự chạy migration + seed**
một workspace mặc định khi boot (cả hai đều idempotent), nên không cần thao tác DB bằng tay.

---

## Chọn hướng nào?

| | Hướng 1 — Postgres trong container | Hướng 2 — Postgres trên host |
|---|---|---|
| Trong Docker | App **+** Postgres | Chỉ App |
| Postgres | container `db`, data ở volume `iw_pgdata` | cài thẳng trên VPS (apt) |
| Khi nào dùng | **Mặc định.** VPS chỉ chạy mỗi app này | Đã có Postgres trên VPS, hoặc muốn quản DB/backup riêng |
| Độ phức tạp | 1 lệnh là xong | Phải cấu hình Postgres cho Docker kết nối vào |

Chưa chắc thì **chọn Hướng 1**.

---

## Phần chung (cả 2 hướng đều làm)

### Bước 0 — Chuẩn bị VPS
- 1 VPS Ubuntu 22.04/24.04, tối thiểu **2GB RAM** (build Next.js ngốn RAM — xem [Lưu ý](#lưu-ý-quan-trọng) nếu chỉ có 1GB).
- SSH vào được: `ssh root@<IP-VPS>`.
- (Tùy chọn) 1 domain trỏ A record về IP VPS nếu muốn HTTPS.

### Bước 1 — Cài Docker
```bash
curl -fsSL https://get.docker.com | sh        # Docker Engine + compose plugin
docker compose version                         # kiểm tra: phải in ra version
```

### Bước 2 — Đưa code lên VPS
Chọn 1 trong 2:

**Cách A — qua Git** (push repo lên GitHub/GitLab trước, rồi trên VPS):
```bash
git clone <repo-url> /opt/indiework
cd /opt/indiework
```

**Cách B — rsync thẳng từ máy local** (chạy ở máy bạn):
```bash
rsync -avz --exclude node_modules --exclude .next --exclude .git \
  ./ root@<IP-VPS>:/opt/indiework/
```

### Bước 3 — Tạo `.env` với secret thật
Trên VPS, trong `/opt/indiework`:
```bash
cp .env.example .env
openssl rand -hex 32      # dán vào COOKIE_SECRET (>= 32 ký tự)
openssl rand -hex 24      # dán vào API_TOKEN
```
Sửa `.env`, đặt:
- `APP_PASSWORD` — mật khẩu đăng nhập web.
- `COOKIE_SECRET` — chuỗi 32-byte vừa sinh.
- `API_TOKEN` — token cho REST API + MCP server.

> `DATABASE_URL` trong `.env` **không cần** cho Hướng 1 (compose đã set sẵn trỏ vào
> container `db`). Hướng 2 thì compose cũng trỏ vào host Postgres giúp bạn. `.env` đặt
> ở repo root, và **luôn chạy lệnh compose từ `/opt/indiework`** (Compose đọc `.env` ở
> thư mục hiện tại để nội suy `${APP_PASSWORD}`, `${COOKIE_SECRET}`, `${API_TOKEN}`).

---

## Hướng 1 — Postgres trong container

Sau Phần chung, chỉ 1 lệnh:

```bash
docker compose -f docker/compose.postgres-container.yml up -d --build
```

Lệnh này: build image app → dựng Postgres (volume `iw_pgdata`) → container app tự chạy
migration + seed → serve ở port 3000.

Kiểm tra:
```bash
docker compose -f docker/compose.postgres-container.yml ps
docker compose -f docker/compose.postgres-container.yml logs -f app
curl -I http://localhost:3000
```

> Postgres được map ra host ở **5433** (không phải 5432) để không đụng Postgres khác.
> Chỉ cần khi muốn nối `pnpm db:studio` từ host vào. App nói chuyện với DB nội bộ qua
> `db:5432` nên không bị ảnh hưởng.

→ Tiếp tục ở [Sau khi chạy](#sau-khi-chạy-cả-2-hướng).

---

## Hướng 2 — Postgres trên host

### B2.1 — Cài Postgres
```bash
apt update && apt install -y postgresql
```

### B2.2 — Tạo role + database
Compose hướng này hardcode user/pass `indiework:indiework` trong `DATABASE_URL`, nên tạo
đúng tên đó (hoặc sửa dòng `DATABASE_URL` trong file compose nếu muốn khác):
```bash
sudo -u postgres psql -c "CREATE ROLE indiework WITH LOGIN PASSWORD 'indiework';"
sudo -u postgres psql -c "CREATE DATABASE indiework OWNER indiework;"
```

### B2.3 — Cho container kết nối vào Postgres host
Đây là chỗ vướng duy nhất của Hướng 2. Container không thấy `127.0.0.1` của host; nó gọi
qua `host.docker.internal` (compose đã map `host-gateway`). Cần Postgres **lắng nghe trên
docker bridge** và **cho phép subnet Docker**.

1. Mở `listen_addresses` trong `/etc/postgresql/*/main/postgresql.conf`:
   ```
   listen_addresses = '*'
   ```
2. Cho phép dải IP Docker — thêm vào cuối `/etc/postgresql/*/main/pg_hba.conf`:
   ```
   # Cho phép container Docker kết nối
   host    indiework    indiework    172.16.0.0/12    scram-sha-256
   ```
3. Restart:
   ```bash
   systemctl restart postgresql
   ```

> ⚠️ Đừng mở port 5432 ra Internet. `listen_addresses='*'` chỉ an toàn khi **firewall
> chặn 5432 từ bên ngoài** (xem [Firewall](#2-firewall)). Muốn chặt hơn thì đặt
> `listen_addresses` đúng IP bridge (`172.17.0.1`) thay vì `*`.

### B2.4 — Chạy app
```bash
# Nếu Postgres host chạy port khác 5432: export DB_HOST_PORT=<port>
docker compose -f docker/compose.postgres-host.yml up -d --build
docker compose -f docker/compose.postgres-host.yml logs -f
```
Container vẫn tự migration + seed lúc boot.

---

## Sau khi chạy (cả 2 hướng)

App nghe ở `http://localhost:3000` trên VPS. Hai việc cần làm cho production:

### 1. Reverse proxy + HTTPS
`APP_PASSWORD` đi qua form login, nên **đừng để app trần qua HTTP công khai**. Gọn nhất
là **Caddy** (tự xin Let's Encrypt).

Trước hết, cho app chỉ nghe nội bộ — sửa dòng `ports` trong file compose đang dùng từ
`'3000:3000'` thành:
```yaml
    ports:
      - '127.0.0.1:3000:3000'
```
rồi `up -d` lại. Cài Caddy và tạo `/etc/caddy/Caddyfile`:
```
indiework.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```
```bash
apt install -y caddy
systemctl restart caddy
```
Caddy tự lo TLS. (Quen Nginx + certbot thì dùng cũng được — cùng ý tưởng.)

### 2. Firewall
```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```
**Không** `allow 3000` và **không** `allow 5432` — chúng chỉ phục vụ nội bộ.

---

## Vận hành

```bash
# đặt biến cho gọn (đổi -container thành -host nếu dùng Hướng 2)
COMPOSE="docker compose -f docker/compose.postgres-container.yml"

$COMPOSE logs -f app          # xem log
$COMPOSE restart app          # restart
$COMPOSE down                 # tắt (volume DB vẫn giữ)

# Update code mới:
git pull                      # hoặc rsync lại
$COMPOSE up -d --build        # build lại + restart; migration tự chạy
```

**Backup DB:**
- Hướng 1 (container): `docker exec <db-container> pg_dump -U indiework indiework > backup.sql`
- Hướng 2 (host): `sudo -u postgres pg_dump indiework > backup.sql`

---

## Lưu ý quan trọng
- **RAM khi build:** `next build` + React Compiler khá nặng. VPS 1GB dễ OOM khi `--build`.
  Khắc phục: tạo swap 2GB, hoặc **tự động hoá bằng CI** — build image trên GitHub Actions
  rồi VPS chỉ `pull` về (xem [ci-cd.md](./ci-cd.md)).
  ```bash
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  ```
- **Đổi secret sau này:** sửa `.env` rồi `up -d` lại (không cần `--build`).
- **Migration/seed** chạy tự động trong entrypoint của image — không cần `pnpm db:migrate` bằng tay.
