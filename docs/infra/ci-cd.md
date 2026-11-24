# CI/CD: tự động build + deploy lên VPS (GitHub Actions + GHCR)

Đây là bản **tự động hoá** của [deploy-vps.md](./deploy-vps.md) — thay vì SSH vào VPS
`git pull && up -d --build` bằng tay, mỗi `git push` lên `main` sẽ tự test → build
image trên CI → push GHCR → VPS chỉ `pull` về. Build nặng (`next build` + React
Compiler) chạy trên runner của Actions chứ không trên VPS, nên VPS nhỏ không lo OOM.

Phần chuẩn bị host (cài Postgres trên VPS, cho Docker kết nối vào, reverse proxy,
firewall) **dùng lại nguyên** [Hướng 2 trong deploy-vps.md](./deploy-vps.md#hướng-2--postgres-trên-host).
File này chỉ bổ sung phần CI/CD.

> Muốn chạy thêm **demo công khai** (`demo.indiework.space`) song song với app thật bằng
> cùng image này? Xem [demo.md](./demo.md).

> Không muốn quản VPS? Xem [deploy-vercel-supabase.md](./deploy-vercel-supabase.md) —
> deploy lên Vercel + Supabase, không cần server.

## File liên quan

- [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) — pipeline.
- [`docker/compose.prod.yml`](../../docker/compose.prod.yml) — compose chạy trên VPS,
  app-only, dùng `image:` từ GHCR (không `build:`), bind `127.0.0.1:3000`.

## Pipeline làm gì

Mỗi `git push` lên `main`:

1. **ci** — `pnpm lint` + `typecheck` + `test`. Integration test
   (`tests/services.int.test.ts`) cần Postgres thật → job dựng một Postgres tạm và
   set sẵn 4 biến môi trường (`DATABASE_URL`, `APP_PASSWORD`, `COOKIE_SECRET`,
   `API_TOKEN`) mà `src/server/env.ts` yêu cầu. Fail là dừng, không deploy.
2. **build** — build từ `docker/Dockerfile`, push GHCR 2 tag: `:latest` và `:<git-sha>`.
3. **deploy** — `ssh ci-indiework@<VPS> <sha>`. Key này bị khoá bằng `command=` trong
   `authorized_keys`: không có shell, không phải root, chỉ chạy được `indiework-deploy <sha>`
   (repo `vps/ansible`, `roles/app_deploy`). Script đó kiểm tra commit có trên `main`, pull
   `:<sha>`, chỉ khởi động lại `app` + `demo` khi image đổi, đợi cả hai trả lời, không lên thì
   đưa image cũ về. Log trên VPS: `/var/log/app-deploy/indiework.log`.

Pull request vào `main` chỉ chạy **ci**. Migration vẫn tự chạy trong entrypoint của
image lúc `up -d` (giống deploy thủ công).

## Chuẩn bị 1 lần

### Trên VPS

1. Cài Docker, cài + cấu hình Postgres host theo
   [deploy-vps.md Hướng 2 (B2.1–B2.3)](./deploy-vps.md#hướng-2--postgres-trên-host).
2. Tạo thư mục deploy, đưa compose + `.env` vào:
   ```bash
   mkdir -p ~/indiework && cd ~/indiework
   # copy docker/compose.prod.yml từ repo vào ~/indiework/compose.prod.yml
   # rồi sửa OWNER -> GitHub user của bạn (viết thường)
   ```
   Tạo `~/indiework/.env` (chmod 600, KHÔNG vào git) — 4 key như deploy-vps.md
   ([Bước 3](./deploy-vps.md#bước-3--tạo-env-với-secret-thật)), lưu ý ở đây
   **`DATABASE_URL` là bắt buộc** (compose.prod không hardcode nó):
   ```env
   DATABASE_URL=postgres://indiework:<pass>@host.docker.internal:5432/indiework
   APP_PASSWORD=...
   COOKIE_SECRET=...        # >= 32 ký tự
   API_TOKEN=...
   ```
3. Reverse proxy đã có sẵn → trỏ upstream về `http://127.0.0.1:3000`.

### GitHub secrets

Repo → Settings → Secrets and variables → Actions:

| Loại     | Tên                  | Giá trị                                                                 |
| -------- | -------------------- | ----------------------------------------------------------------------- |
| Secret   | `DEPLOY_SSH_KEY`     | private key của `indiework-ci-deploy` (user `ci-indiework` trên VPS)     |
| Variable | `DEPLOY_HOST`        | IP VPS                                                                  |
| Variable | `DEPLOY_KNOWN_HOSTS` | dòng host key ed25519 của VPS (`ssh-keyscan -t ed25519 <IP>` từ máy đã tin VPS) |

User, script và `authorized_keys` trên VPS do `ansible-playbook playbooks/app-deploy.yml` trong
repo `vps/ansible` tạo.

`GITHUB_TOKEN` (push image lúc build) là token tự cấp của Actions, không cần khai báo.

> Repo này public → GHCR package để **public**, nên VPS `pull` ẩn danh (không cần
> `docker login`/`GHCR_TOKEN`). Lần build đầu package mặc định private; vào Package
> settings đổi sang **Public** một lần là xong. Nếu giữ package private thì thêm lại
> bước `docker login` với một PAT scope `read:packages` (secret `GHCR_TOKEN`).

> Repo đã có remote trên GitHub (`origin` → `github.com:tungnguyenson/indiework`),
> nên chỉ cần `git push origin main` là Actions chạy.
>
> Image GHCR mặc định private. Vào Package settings, bật "Inherit access from
> repository" để CI push được và `GHCR_TOKEN` đọc được.

## Deploy

`git push` lên `main`, theo dõi ở tab **Actions**.

## Rollback

Mỗi build có tag `:<git-sha>`. Chạy lại job **deploy** của một run cũ trên tab Actions, hoặc
trên VPS với quyền root:

```bash
sudo /usr/local/sbin/indiework-deploy <git-sha-cũ>
```

`up -d` không set `IMAGE` để quay lại `:latest`.

## Khắc phục sự cố

- **CI fail ở `pnpm test`:** integration test cần DB + 4 env — đã set sẵn trong job `ci`.
- **`pull` báo denied:** kiểm tra `GHCR_TOKEN` còn hạn, `OWNER` trong
  `compose.prod.yml` viết thường, package đã link với repo.
- **App restart liên tục:** `docker compose -f compose.prod.yml logs -f app` — thường
  do `.env` sai (env validation fail) hoặc không nối được Postgres host (xem
  [B2.3](./deploy-vps.md#b23--cho-container-kết-nối-vào-postgres-host)).
