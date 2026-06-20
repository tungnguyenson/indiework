# Gap Analysis: Bản hiện tại sang SaaS multi-tenant

> Ngày: 2026-06-17 · Trạng thái: phân tích (chưa triển khai)
> Phạm vi: phân tích khoảng cách giữa kiến trúc single-user hiện tại và một SaaS
> multi-tenant theo 4 yêu cầu: đăng ký qua invitation, auth email/password,
> bắt đổi mật khẩu lần đầu cộng forgot password, và isolation dữ liệu giữa các workspace.

## 1. Kiến trúc hiện tại (điểm xuất phát)

Bản hiện tại là **single-tenant, single-user**. Cụ thể, qua code:

| Khía cạnh | Hiện trạng | Bằng chứng |
|---|---|---|
| Danh tính người dùng | **Không có** `users` table. Session chỉ chứng minh "biết `APP_PASSWORD`", không có ai là ai. | `src/server/auth/session.ts:1-4`, `src/server/db/schema.ts` |
| Login | So 1 mật khẩu duy nhất trong `.env` | `src/app/_actions/auth.ts:23`, `src/server/env.ts:20` |
| API / MCP | 1 Bearer `API_TOKEN` tĩnh trong `.env`, full quyền | `src/server/auth/token.ts:16-21` |
| Workspace | Là **nhóm hiển thị**, không có owner/thành viên. `iw-workspace` cookie chỉ chọn workspace đang xem | `src/server/active-workspace.ts`, `src/server/db/schema.ts:45-51` |
| Phân quyền dữ liệu | **Không có**. `workspaceService.list()` trả **mọi** workspace; `projectService.list()` không lọc thì trả **mọi** project | `src/server/services/workspace.service.ts:11-13`, `src/server/services/project.service.ts:37-60` |
| Middleware | Chỉ kiểm tra chữ ký session hợp lệ, không có identity | `src/proxy.ts:11-19` |

> Kết luận: hiện tại bất kỳ ai login đều thấy và sửa **toàn bộ** dữ liệu. Không có khái niệm "của ai".

---

## 2. Gap theo từng yêu cầu

### Yêu cầu 1: Đăng ký tài khoản qua invitation

| Cần có | Hiện trạng | Gap |
|---|---|---|
| `users` table (email unique, passwordHash, name, status, mustChangePassword…) | Không có | **Tạo mới hoàn toàn** |
| `invitations` table (email, workspaceId, role, tokenHash, invitedBy, expiresAt, acceptedAt) | Không có | **Tạo mới** |
| Trang/flow nhận lời mời `/invite/[token]`, tạo user rồi tạo membership | Không có | **Tạo mới** |
| Gửi email chứa link mời | **Không có hạ tầng email nào** | **Tạo mới (blocker chung cho cả YC1 và YC3)** |

### Yêu cầu 2: Auth email/password thay vì `.env`

| Cần có | Hiện trạng | Gap |
|---|---|---|
| Tra user theo email, verify `passwordHash` | `passwordMatches()` so với `env.APP_PASSWORD` | **Viết lại login** |
| Hash mật khẩu chuẩn (argon2id / bcrypt) | Chỉ có HMAC-SHA256 (không phải password hash) | **Thêm thư viện hash** (vd `@node-rs/argon2`) |
| Session mang `userId` (để biết là ai) | Session là `issuedAt.hmac`, vô danh | **Đổi cấu trúc session** (thêm `userId`; cân nhắc `sessions` table để revoke được) |
| Bỏ `APP_PASSWORD` (hoặc chỉ dùng seed admin đầu tiên) | Bắt buộc trong env | Đổi `env.ts` |

### Yêu cầu 3: Bắt đổi mật khẩu lần đầu cộng forgot password

| Cần có | Hiện trạng | Gap |
|---|---|---|
| Cờ `users.mustChangePassword` cộng chặn app cho tới khi đổi | Không có | **Thêm cột và gate ở middleware/layout** |
| Action đổi mật khẩu (clear cờ, hủy các session khác) | Không có | **Tạo mới** |
| `password_reset_tokens` table (tokenHash, userId, expiresAt, usedAt) | Không có | **Tạo mới** |
| Flow request reset (gửi email) và flow set mật khẩu mới | Không có | **Tạo mới** (lệ thuộc email infra) |
| Rate limit trên login/reset (chống brute-force) | **Không có** | **Tạo mới** |

### Yêu cầu 4: Isolation, không xem/sửa dữ liệu workspace của người khác

Đây là gap **lớn nhất và rủi ro nhất**. Hiện tại **không một query nào** được scope theo người dùng.

| Cần có | Hiện trạng | Gap |
|---|---|---|
| `workspace_members` (workspaceId, userId, role): gắn owner/thành viên cho workspace | Workspace không có owner | **Tạo mới** |
| Mọi read/write lọc theo membership của caller | `workspaceService.list`, `projectService.list/getByKey/get`, `task/milestone/module/comment/attachment` service đều nhận id thô, **0 kiểm tra** | **Sửa toàn bộ service layer**, thêm authz context (userId cộng memberships) |
| Validate `iw-workspace` cookie thuộc về user | Cookie nhận bất kỳ workspaceId nào | **Thêm check** |
| **KEY của project unique theo từng workspace** | `projects_key_unique` đang **unique toàn cục** trên `key`, nên 2 tenant không thể trùng KEY, và ref `KEY-seq` resolve xuyên tenant | **Đổi index thành unique (workspaceId, key)** cộng scope resolve ref. *(Đây là lỗi ẩn dễ bỏ sót)* |
| API key scope theo user/workspace | `api_keys` table có sẵn nhưng **không có cột userId/workspaceId**; `API_TOKEN` global full quyền | **Thêm cột và scope MCP/REST theo key** |
| Chặn IDOR ở REST | `/api/v1/tasks/[id]` chỉ check bearer, nên token nào cũng đọc task bất kỳ | **Verify task thuộc workspace của key** |

---

## 3. Gap xuyên suốt (bắt buộc cho SaaS, chưa nằm trong 4 yêu cầu)

1. **Mô hình role/permission** (owner / admin / member / viewer): cần cho cả invitation, isolation và quyền sửa.
2. **Hạ tầng email transactional**: không tồn tại; là blocker chung cho YC1 và YC3. Cần chọn provider (Resend / SES / Cloudflare Email…).
3. **Session revocation**: cookie HMAC stateless hiện tại **không thể thu hồi**; sau khi đổi/reset mật khẩu phải vô hiệu hóa session cũ, nên cần `sessions` table hoặc token versioning.
4. **Attribution / actor**: `tasks`/`comments` không có `authorId`. Đa người dùng thường cần biết "ai tạo, ai sửa". `comments.source` chỉ là web/api/agent.
5. **Data migration**: dữ liệu single-tenant hiện tại phải gán cho 1 user/owner bootstrap khi lên multi-tenant.
6. **Đồng bộ 2 schema**: mọi thay đổi model phải mirror cả `src/server/db/schema.ts` **và** `src/server/db/schema.sqlite.ts`.
7. **Pricing/plan cộng giới hạn open issues**: chưa có model `plans`/`subscriptions`. Điểm bám: `projectService.withCounts` đã tính sẵn open-issue count (`src/server/services/project.service.ts:12-29`).

---

## 4. Đề xuất thứ tự triển khai

Có quan hệ phụ thuộc rõ ràng, nên làm tuần tự:

1. **Phase A, Identity nền tảng**: `users` cộng password hashing cộng session mang `userId` cộng `sessions` table (revoke). Giữ `APP_PASSWORD` thành seed admin đầu tiên.
2. **Phase B, Tenancy cộng Isolation** (rủi ro cao nhất, làm sớm): `workspace_members`, đổi `projects_key_unique` thành per-workspace, thêm authz context và scope **mọi** service cộng REST cộng MCP. Phần này cần security review kỹ.
3. **Phase C, Email infra**: mở khóa invitation và reset.
4. **Phase D, Invitation flow** (YC1).
5. **Phase E, Force-change cộng forgot password cộng rate limit** (YC3).
6. **Phase F, API keys scoped**: thay `API_TOKEN` global.
7. **Phase G (tách riêng)**: Plans/billing cộng enforce open-issue limit.

---

## 5. Tóm tắt rủi ro

- **Cao nhất**: Phase B (isolation). Nếu scope sót dù chỉ một service/route thì rò rỉ dữ liệu chéo tenant. Mọi truy vấn phải đi qua một authz boundary thống nhất, không để service nhận id thô như hiện tại.
- **Ẩn dễ sót**: `projects_key_unique` unique toàn cục, phải đổi trước khi có tenant thứ hai; nếu không ref `KEY-seq` sẽ va chạm/rò xuyên tenant.
- **Blocker chung**: email infra chặn cả invitation lẫn forgot-password.
