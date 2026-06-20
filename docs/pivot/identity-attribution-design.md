# Thiết kế: Identity + Attribution (admin & agent)

> Ngày: 2026-06-20 · Trạng thái: **đã triển khai** (IW-54)
> Driver: làm cho task/comment do AI tạo mang `createdBy = Agent`, và cho phép
> nhiều danh tính agent thay vì một token tĩnh dùng chung.
>
> Companion: [team-gap-analysis.md](team-gap-analysis.md),
> [multi-tenant-gap-analysis.md](multi-tenant-gap-analysis.md),
> [team-implementation-plan.md](team-implementation-plan.md). Nguồn single-user:
> [../scope.md](../scope.md).

---

## 0. Định vị: đây KHÔNG phải "team app"

Ba doc pivot kia phân tích một sản phẩm **team / multi-tenant đầy đủ**: assignee,
`workspace_members`, `invitations`, RBAC, isolation dữ liệu giữa các workspace. Và
[team-implementation-plan.md](team-implementation-plan.md) đã chốt một hướng: *indie
và team là hai sản phẩm riêng, chia sẻ `packages/core`; indie giữ password đơn giản,
real users sống trong app team.*

Doc này mô tả một bước **hẹp hơn nhiều và khác mục đích**:

| | team-gap-analysis (team đầy đủ) | Doc này (identity + attribution) |
|---|---|---|
| Mục đích | con người cộng tác | **AI agent ghi nhận việc nó làm** |
| `users` | có, kèm membership | có, **nhẹ**: chỉ identity + role-nhãn |
| RBAC | bắt buộc, refactor toàn service layer | **không** (role chỉ để hiển thị) |
| Multi-tenant / scoping | bắt buộc | **không** (vẫn single-tenant) |
| `workspace_members`, `invitations` | có | **không** |
| Agent | không phải khái niệm | **trung tâm**: AI qua MCP, xác thực bằng token |

### Căng thẳng cần bạn xác nhận khi review

Việc thêm `users` + login email/password vào app indie hiện tại **va chạm** với câu
*"indie stays deliberately simple… password stays per-app"* trong
team-implementation-plan. Hai cách hiểu, cần bạn chọn:

- **(A) Tiến hóa indie tại chỗ:** indie có thêm một lớp identity mỏng cho mục đích
  attribution AI-agent, vẫn single-tenant, vẫn "calm". Doc này giả định hướng (A).
- **(B) Đây thực ra là mầm của app team:** nếu vậy nên đi theo con đường monorepo
  trong team-implementation-plan thay vì sửa indie.

**Khung để quyết cho đúng:** driver (attribution "AI làm vs tôi làm") cần trên indie
*bất kể* A hay B, vì indie single-user vẫn chạy AI agent qua MCP. Đó là phân biệt
người-với-AI trên một product một người. Trục team (người với người) là chuyện khác và
đã được giao cho một product riêng. Nên A/B *không* quyết "có muốn agent attribution
không" (luôn muốn), mà quyết: **indie có cần cả một hệ identity `users` +
email/password, hay giữ single-password + attribution agent nhẹ, để dành real identity
cho app team vốn đã sở hữu nó?** Lưu ý: lựa chọn "nền multi-user đầy đủ" được chốt
*trước khi* gắn với context team-pivot trong phiên này; chính các doc của bạn đã đặt
heavy human-identity vào product riêng, nên `users` + login đầy đủ trên indie (một
người) có thể *một phần thừa*. Đây là product call của bạn, tôi không tự chọn.

→ Doc viết theo **(A)**. Nếu bạn nghiêng (B), dừng lại và đổi hướng trước khi code.

---

## 1. Hiện trạng (tóm tắt, chi tiết ở các gap-analysis)

- Không có bảng `users`. Session = cookie ký HMAC chứng minh "biết `APP_PASSWORD`",
  **không mang danh tính** ([session.ts](../../src/server/auth/session.ts)).
- Một `API_TOKEN` tĩnh dùng chung cho REST + MCP ([token.ts](../../src/server/auth/token.ts)).
- Task/comment **không có `createdBy`**; comment chỉ có `source` (web/api/mcp/agent).
- `api_keys` đã reserved trong schema nhưng chưa wired, **chưa có `userId`**.

---

## 2. Mô hình dữ liệu

**Tách identity khỏi credential.** Một bảng `users` cho cả người lẫn agent; *cách
đăng nhập* khác nhau (người: password; agent: api_key).

```
users
  id            uuid  pk
  email         text  unique             -- NOT NULL với admin; NULL với agent (passwordless, định danh bằng name + api_key)
  name          text
  role          'admin' | 'agent'   not null      -- chỉ là NHÃN, chưa enforce
  passwordHash  text                              -- NULL với agent (passwordless)
  disabledAt    timestamptz                       -- NULL = active; set để vô hiệu ngay
  createdAt / updatedAt

api_keys  (mở rộng bảng đã reserved)
  + userId  uuid → users.id                       -- mỗi key thuộc một agent; nhiều key OK
  (scope read|write|read-write GIỮ nhưng CHƯA enforce)

tasks
  + createdById     uuid → users.id   (nullable — để backfill)
comments
  + createdById     uuid → users.id   (nullable)
  source GIỮ nguyên = kênh vào; createdById = principal — HAI trục khác nhau
```

`role` là `text + { enum }` theo đúng quy ước schema hiện tại (không dùng pg enum).
Agent không có email tự nhiên nên `email` để NULL (Postgres cho phép nhiều NULL dưới
ràng buộc unique); agent định danh bằng `name` + `api_key`. Admin bắt buộc có email.

---

## 3. Luồng xác thực

| Cửa | Credential | Resolve ra | Ghi nhận |
|---|---|---|---|
| Web | email + password (`scrypt`) | session cookie `<userId>.<ts>.<hmac>` | `createdById` = admin, `source='web'` |
| REST / MCP | Bearer = api_key secret | tra `api_keys.hash` → agent user | `createdById` = agent, `source='api'/'mcp'` |

- **`proxy.ts` không đổi bản chất:** vẫn chỉ verify chữ ký + đọc `userId` (stateless,
  không tra DB). `role` / `disabledAt` tra ở server action khi cần.
- **Cookie chỉ nhúng `userId`**, KHÔNG nhúng `role`. Vì cookie sống 30 ngày; nhúng
  role thì disable/đổi-role trễ tới 30 ngày. Tra role server-side mỗi request.
- **Back-compat (quan trọng):** `API_TOKEN` tĩnh **vẫn được chấp nhận**, map sang một
  user `default-agent`. MCP đang chạy ở `app.indiework.space/mcp` không vỡ. Đánh dấu
  `@deprecated`. Xem ràng buộc bảo mật ở §6.

---

## 4. Migration cho người đã fork

Nền versioned migration **đã có** cho Postgres: `drizzle/*.sql` + `_journal.json`,
chạy qua [migrate.ts](../../src/server/db/migrate.ts); Docker tự `migrate && seed`
mỗi boot ([Dockerfile:44](../../docker/Dockerfile#L44)). Người fork upgrade =
`git pull` → restart. Vấn đề là Drizzle **chỉ sinh DDL**, không sinh phần data.

**Tách hai tầng:**

1. **DDL → Drizzle migration `.sql`** (versioned): `CREATE TABLE users`,
   `ALTER api_keys ADD user_id`, `ALTER tasks/comments ADD created_by` (nullable).
2. **Bootstrap + backfill → mở rộng [seed.ts](../../src/server/db/seed.ts)** (vốn đã
   idempotent, check `select … limit 1` trước khi insert). Chạy SAU migrate mỗi boot:
   - ensure admin từ env `ADMIN_EMAIL` / `ADMIN_PASSWORD` (hash bằng `scrypt`).
   - ensure user `default-agent` + một `api_key` map từ `API_TOKEN` cũ.
   - **backfill** `UPDATE … WHERE created_by IS NULL` (xem §5). Sau lần đầu không còn
     NULL → các boot sau là no-op. An toàn để chạy lặp.

   Lý do để ở JS chứ không SQL thuần: cần **đọc env + hash password**, và cần biết id
   của admin/default-agent (được tạo ngay trên đó) → SQL trong file migration không làm được.

**Lỗ hổng SQLite:** nhánh SQLite dùng `drizzle-kit push` (diff trực tiếp, **không có
history**). Lần này toàn *thêm* nên push nuốt được; nhưng thay đổi *phá hủy* về sau
(rename/drop) thì push nguy hiểm và không backfill. → Nợ cần quyết: chấp nhận giới hạn
push, hay đầu tư versioned migration cho cả SQLite.

**Export/import?** Đã cân nhắc thay migration bằng "export data cũ → lấy code mới →
import". Kết luận: **không thay thế được migration**: importer vẫn phải chứa đúng logic
backfill ("rows cũ thiếu `createdById` → gán ai"), chỉ là dời từ DB (SQL, tự động) sang
app (mapper, thủ công), và dễ lệch id/FK/seq hơn. Export/import **đáng làm như feature
bổ trợ**: (1) backup/restore, (2) cầu **Postgres ↔ SQLite**, chỗ migration không bắc
qua được. KHÔNG phải con đường upgrade chính.

**Tài liệu:** thêm `UPGRADING.md` ("git pull → set `ADMIN_EMAIL`/`ADMIN_PASSWORD` →
migrate → restart", cảnh báo `API_TOKEN` deprecated) + cập nhật `.env.example`.

---

## 5. Quy tắc backfill `createdById`

| Đối tượng cũ | Gán cho |
|---|---|
| comment có `source ∈ {mcp, agent}` | user `default-agent` |
| comment có `source ∈ {web, api}` | admin |
| mọi task cũ (không có source) | admin |

Hợp lý theo dữ liệu sẵn có, không phải đoán.

---

## 6. Bảo mật

- **`scrypt`** (`node:crypto`) cho password, chậm sẵn, không thêm dependency. Login
  là bề mặt brute-force nên thêm **rate limit** cơ bản.
- Cookie chỉ chứa `userId` (xem §3).
- **Back-compat `API_TOKEN`, ranh giới rõ:** trong phạm vi **single-tenant** này, giữ
  token tĩnh map sang `default-agent` **không làm xấu** posture hiện tại (vốn đã là một
  token tĩnh full quyền trên chính install đó; rò token = lộ đúng install đó, y như giờ).
  NHƯNG team-gap-analysis §2.1 cảnh báo đúng: trong **multi-tenant**, rò một token =
  lộ *mọi* tenant. → **Điều kiện tiên quyết:** phải GỠ back-compat token (và shared
  password) *trước* bất kỳ bước multi-tenant nào. Ghi rõ để không mang nợ này qua ranh giới.

---

## 7. Vùng code phải đụng

`session.ts` (nhúng userId) · `require-session.ts` (trả userId + `getCurrentUser()`) ·
`token.ts` (bearer → agent user, giữ back-compat) · `_actions/auth.ts` (login
email+password) · service layer (`create*` nhận `createdById`) · 6 route REST/MCP đang
gọi `requireBearer` · UI (màn login mới, badge "Agent") · `seed.ts` · migration mới ·
`README` + `.env.example` + `UPGRADING.md`.

---

## 8. Cố ý hoãn (YAGNI)

RBAC / enforce quyền · `api_keys.scope` enforcement · UI quản lý users & keys · nhiều
admin (schema cho phép, UI sau) · multi-tenant scoping · `workspace_members` /
`invitations` · assignee · export/import (feature riêng, không chặn pivot này).

---

## 9. Open questions

1. **Hướng (A) hay (B)** ở §0. Đây là CỔNG quyết định: chọn (B) thì phần lớn doc này
   gập vào lộ trình Team (`users` ở apps/team P4, indie chỉ nhận cột attribution
   nullable mà P2 đã ghi). Hai câu dưới chỉ áp dụng nếu chọn (A).
2. SQLite: chấp nhận `push` hay làm versioned migration cho cả hai engine?
3. Cho phép **nhiều admin** ngay từ schema (đã cho) nhưng có cần UI tạo admin #2 ở
   pivot này không, hay chỉ một admin seed-từ-env là đủ?
