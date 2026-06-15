# Spec — Solo Indie Dev Project Management Tool

> Tool quản lý project cá nhân, single-user, self-deploy độc lập.
> Triết lý: tối giản, không có gì của team (assignee/mention/notification/permission).
> **3 mặt tiền dùng chung 1 service layer**: Web UI · REST API · MCP server.
> Module = sub-system. Milestone = phase. Quick-view sidebar là tương tác trung tâm.

---

## 1. Mục tiêu & Non-goals

### Mục tiêu
- Quản lý task của một solo dev across nhiều project.
- Hai trục grouping độc lập: **Module** (sub-system) ⟂ **Milestone** (phase).
- Quick-view chi tiết task qua **sidebar trượt phải**, không rời list.
- **Inbox** để capture ý tưởng tức thì, triage sau (GTD-style).
- Điều khiển task từ **bên ngoài**: AI agent (MCP), Telegram/vscode (REST API).
- UI gọn hơn Linear. Làm chuẩn để mở rộng lâu dài.

### Non-goals (cố tình loại bỏ)
- ❌ Assignee, reporter, mentions
- ❌ Notification / email / digest
- ❌ Multi-user, permission, role, team view, "My Issues"
- ❌ Real-time collaboration, presence
- ❌ OAuth / account system (login = .ENV, §9)

---

## 2. Tech Stack

| Layer        | Choice                                          |
|--------------|-------------------------------------------------|
| Framework    | Next.js 15 (App Router, RSC, Route Handlers)    |
| UI           | React 19                                        |
| Styling      | TailwindCSS 4                                   |
| Components   | MVP UI lib (shadcn/ui + Untitled UI), React Aria|
| ORM          | Drizzle                                         |
| DB           | PostgreSQL                                       |
| MCP          | `@modelcontextprotocol/sdk` (HTTP transport)    |
| Auth (web)   | .ENV password + signed cookie (§9)              |
| Auth (API)   | Bearer token (.ENV), §7.2                        |
| Deploy       | Docker standalone + Postgres (VPS riêng)        |
| Package mgr  | pnpm                                             |

**Nguyên tắc:** thin abstraction. Server Actions cho web mutation, Route Handlers cho REST, MCP server riêng — **cả 3 gọi xuống cùng một service layer** (§8). Không viết lại logic.

---

## 3. Kiến trúc — Service Layer (xương sống)

Đây là quyết định kiến trúc quan trọng nhất, vì có tới 3 entry point.

```
        Web UI            Telegram / vscode        AI Agent (OpenClaw…)
     (Server Actions)       (REST API)              (MCP server)
            │                    │                       │
            └────────────────────┼───────────────────────┘
                                 ▼
                      ┌─────────────────────┐
                      │   SERVICE LAYER      │  ← toàn bộ business logic ở đây
                      │  src/server/services │     (taskService, moduleService…)
                      └─────────────────────┘
                                 ▼
                      Drizzle  →  PostgreSQL
```

- **Service layer** (`src/server/services/*`): hàm thuần TS, nhận input đã validate, trả data. Không biết gì về HTTP/MCP/React. Vd `taskService.create(input)`, `taskService.list(filter)`.
- **3 adapter mỏng** chỉ lo: parse input → gọi service → format output.
  - Server Action: parse FormData/args → service → `revalidatePath`.
  - Route Handler: parse JSON/query → service → `Response.json`.
  - MCP tool: parse tool args → service → trả text/JSON content.
- Validation (zod schema) **chia sẻ** giữa cả 3, định nghĩa 1 lần trong service.

> Lợi ích: thêm Telegram bot hay MCP tool mới = viết adapter ~10 dòng, logic đã có sẵn.

---

## 4. Data Model

7 bảng. Thiết kế mở rộng không phá vỡ.

### 4.1 `projects`
| Column      | Type        | Notes                              |
|-------------|-------------|------------------------------------|
| id          | uuid PK     |                                    |
| key         | text UNIQUE | mã ngắn, vd `VIEC` (dùng cho ref)  |
| name        | text NOT NULL |                                  |
| icon        | text        | **emoji** (vd "🚀") hoặc shortcode |
| description | text        | nullable                           |
| color       | text        | hex                                |
| status_note | text        | "project đang ở đâu" (overwrite, §8.4) |
| archived_at | timestamptz | nullable                           |
| created_at / updated_at | timestamptz |                        |

### 4.2 `milestones` (= PHASE)
Trục **phase**. Initial / Core logic / Launch… Có target date.
| Column      | Type        | Notes                              |
|-------------|-------------|------------------------------------|
| id          | uuid PK     |                                    |
| project_id  | uuid FK     | → projects, CASCADE                |
| name        | text NOT NULL | "Launch"                         |
| description | text        | nullable                           |
| status      | enum        | `planned` / `active` / `done`      |
| target_date | date        | nullable — deadline của phase      |
| position    | integer     | thứ tự phase                       |
| created_at / updated_at |             |                        |

### 4.3 `modules` (= SUB-SYSTEM)
Trục **sub-system**. Core Workflow / Onboarding Flow…
| Column      | Type        | Notes                              |
|-------------|-------------|------------------------------------|
| id          | uuid PK     |                                    |
| project_id  | uuid FK     | → projects, CASCADE                |
| name        | text NOT NULL |                                  |
| color       | text        | hex                                |
| position    | integer     |                                    |
| archived_at | timestamptz | nullable                           |
| created_at / updated_at |             |                        |

### 4.4 `tasks`
| Column       | Type        | Notes                                   |
|--------------|-------------|-----------------------------------------|
| id           | uuid PK     |                                         |
| project_id   | uuid FK     | nullable! → null = **Inbox** (§6)       |
| module_id    | uuid FK     | → modules, SET NULL, nullable           |
| milestone_id | uuid FK     | → milestones, SET NULL, nullable        |
| seq          | integer     | số chạy trong project (null khi ở Inbox)|
| title        | text NOT NULL |                                       |
| description  | text        | markdown, nullable                      |
| status       | enum        | §4.7                                    |
| priority     | enum        | §4.8                                    |
| status_note  | text        | "đang vướng gì" — overwrite (§8.4)      |
| position     | integer     |                                         |
| due_date     | date        | nullable                                |
| completed_at | timestamptz | set khi → done                          |
| created_at / updated_at |             |                             |

Ref: `{project.key}-{seq}` → `VIEC-42`. Task ở Inbox chưa có ref tới khi gán project.

### 4.5 `comments` (= timeline / nhật ký)
Append-only, ghi tiến trình theo thời gian. Solo nên không phải "thảo luận" mà là log cho chính mình.
| Column     | Type        | Notes                          |
|------------|-------------|--------------------------------|
| id         | uuid PK     |                                |
| task_id    | uuid FK     | → tasks, CASCADE               |
| body       | text NOT NULL | markdown                     |
| source     | enum        | `web` / `api` / `mcp` / `agent` — biết comment từ đâu tới |
| created_at | timestamptz |                                |

### 4.6 `labels` + `task_labels` (optional, Phase 3)
Cắt ngang tự do khi 2 trục module/milestone chưa đủ. Schema chừa sẵn, chưa build MVP.

### 4.7 Status (enum `task_status`)
`inbox` · `backlog` · `todo` · `in_progress` · `blocked` · `done` · `cancelled`
> Thêm `inbox` (chưa triage) và `blocked` (đang kẹt — kết hợp với `status_note`).

### 4.8 Priority (enum `task_priority`)
`none` · `low` · `medium` · `high` · `urgent`

### 4.9 Per-project seq
Bảng `project_counters(project_id, next_seq)` update atomic trong transaction, hoặc advisory lock. Cấp seq lúc task được gán vào project (rời Inbox).

---

## 5. Phân biệt: status_note vs comments (đừng gộp)

Hai thứ khác bản chất, tách riêng:

| | `status_note` (1 field, overwrite) | `comments` (nhiều dòng, append) |
|--|--|--|
| Bản chất | Trạng thái **hiện tại** | **Nhật ký** theo thời gian |
| Ví dụ | "Đang chờ API key của bên thứ 3" | "3/6: thử cách A, fail vì X" |
| Vị trí UI | Hiện ngay đầu detail panel, nổi bật | List phía dưới, cuộn được |
| Có ở project? | ✅ ("project đang ở đâu") | ❌ (chỉ task) |
| Khi xong | Tự xóa/cập nhật | Giữ nguyên lịch sử |

Đây là pattern "project update" của Linear nhưng rút gọn cho solo: cái nổi (status_note) trả lời "giờ đang sao", cái chìm (comments) trả lời "đã đi qua những gì".

---

## 6. Inbox / Quick Capture

Pattern GTD: nhả ý tưởng tức thì, không bắt phân loại.

- Task có `project_id = NULL` → thuộc **Inbox**.
- UI: một ô input **luôn hiện trên cùng** (mọi màn), gõ + Enter = tạo task vào Inbox. Không hỏi project/module/gì cả.
- Màn **Inbox** riêng (route `/inbox`): list task chưa triage. Hành động: gán project → (tự cấp seq) → kéo vào module/milestone.
- API & MCP cũng tạo được task thẳng vào Inbox (Telegram "nhớ làm X" lúc đang đi đường).
- Badge số task Inbox ở sidebar để không quên triage.

---

## 7. External Access — REST API + MCP

### 7.1 REST API (Telegram, vscode, script)
Route Handlers dưới `/api/v1/*`. JSON in/out. Auth = Bearer token (§7.2).

| Method | Endpoint                 | Việc                          |
|--------|--------------------------|-------------------------------|
| POST   | `/api/v1/tasks`          | Tạo task (vào Inbox nếu thiếu project) |
| GET    | `/api/v1/tasks`          | List (query: project, status, milestone, module) |
| GET    | `/api/v1/tasks/:id`      | Chi tiết 1 task               |
| PATCH  | `/api/v1/tasks/:id`      | Cập nhật field bất kỳ         |
| POST   | `/api/v1/tasks/:id/comments` | Thêm comment vào timeline |
| GET    | `/api/v1/projects`       | List project                  |
| GET    | `/api/v1/inbox`          | Task chưa triage              |

Tất cả gọi xuống service layer (§3). Response chuẩn `{ data, error }`.

### 7.2 Auth cho API
- Bearer token tĩnh trong `.ENV` (`API_TOKEN`). Header `Authorization: Bearer <token>`.
- Đủ cho personal use. Nếu sau muốn nhiều client thì thêm bảng `api_tokens`.

### 7.3 MCP Server
Cho AI agent (OpenClaw, Claude Desktop, n8n) quản task bằng ngôn ngữ tự nhiên.
- Transport: HTTP (streamable), mount tại `/mcp` hoặc chạy process riêng cùng monorepo.
- Auth: token trong header (tái dùng `API_TOKEN`).
- **Tools expose** (mỗi tool = 1 lời gọi service):
  - `create_task(title, project?, module?, milestone?, priority?, due_date?)`
  - `list_tasks(project?, status?, milestone?, module?)`
  - `get_task(ref)` — nhận `VIEC-42`
  - `update_task(ref, patch)`
  - `add_comment(ref, body)` — agent ghi tiến trình
  - `set_status_note(ref, note)` — agent cập nhật "đang vướng gì"
  - `list_projects()` / `list_inbox()`
- `source` của comment/task tạo từ MCP = `agent`, để phân biệt.

> Bạn đã quen MCP (n8n, OpenClaw) nên phần này khớp sẵn workflow.

---

## 8. Service Layer API (mutation + query surface)

Định nghĩa 1 lần, cả 3 mặt tiền dùng. (zod-validated)

**projectService**: `create` · `update` · `archive` · `setStatusNote` · `list` · `getByKey`
**milestoneService**: `create` · `update` · `setStatus` · `reorder` · `list(projectId)`
**moduleService**: `create` · `update` · `reorder` · `archive` · `list(projectId)`
**taskService**:
- `create(input)` — nếu có project → cấp seq (transaction); nếu không → Inbox
- `update(id, patch)` — title/status/priority/moduleId/milestoneId/dueDate/description
- `assignToProject(id, projectId)` — triage từ Inbox, cấp seq
- `setStatusNote(id, note)` — overwrite
- `reorder(id, ...)`
- `delete(id)`
- `list(filter)` / `getByRef(ref)` / `listInbox()`
**commentService**: `add(taskId, body, source)` · `list(taskId)`

Quy tắc chung: `status → done` set `completed_at`; rời `done` clear về null.

---

## 9. Auth (login qua .ENV)

Solo → tối giản hết mức:
- `APP_PASSWORD` trong `.ENV`. Màn `/login` 1 ô password → so khớp → set httpOnly signed cookie (ký bằng `COOKIE_SECRET`).
- Middleware check cookie, trừ `/login` và `/api/*` (API dùng Bearer riêng).
- Không bảng users, không OAuth. Nguồn chân lý là `.ENV`.

---

## 10. Màn hình & UX

### 10.1 Layout
```
┌────────────┬─────────────────────────────┬──────────────┐
│ Sidebar    │  Main (list / board)        │  Detail      │
│ 🚀 Project │  [+ Quick capture input]    │  panel       │
│ 📚 Project │                             │  (slide từ   │
│ 📥 Inbox(3)│  Tasks grouped by Module    │   phải,      │
│            │  hoặc Milestone (toggle)    │   ?task=)    │
└────────────┴─────────────────────────────┴──────────────┘
```
- Sidebar: project có **emoji icon** + name; Inbox với badge count.
- Quick capture input luôn trên cùng (§6).

### 10.2 Main view
- **List view** (default): group theo **Module** *hoặc* **Milestone** (toggle "Group by"). Mỗi section: header (icon/màu + count + % done) + task rows + inline quick-add.
- **Board view** (Kanban): cột theo `status`, kéo task giữa cột = đổi status. Toggle với list.
- Filter: status, priority, milestone, module; ẩn done/cancelled; sort.

### 10.3 Detail panel (?task=<id>)
Slide từ phải, không rời list. Thứ tự hiển thị:
1. Ref `VIEC-42` (copy) + title (inline edit)
2. **status_note** — ô nổi bật "đang vướng gì" (sửa nhanh)
3. status · priority · module · milestone · due_date
4. description (markdown)
5. **Timeline comments** (append, hiện source badge)
6. Delete (confirm) · đóng bằng Esc

### 10.4 Keyboard
`c` quick-add · `Esc` đóng panel · `Cmd+K` palette (Phase 2) · `j/k` (Phase 2)

---

## 11. Routing

```
/                          → project gần nhất / onboarding
/inbox                     → task chưa triage (badge)
/p/[projectKey]            → list view (group by module|milestone)
/p/[projectKey]?task=<id>  → + detail panel
/p/[projectKey]/board      → kanban view
/p/[projectKey]/milestones → quản lý phase (CRUD, target date)
/p/[projectKey]/modules    → quản lý sub-system
/settings                  → đổi secret, export, API token
/login
/api/v1/*                  → REST (Route Handlers)
/mcp                       → MCP server endpoint
```

---

## 12. Cấu trúc thư mục

```
pm-tool/
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── inbox/
│   │   ├── p/[projectKey]/
│   │   │   ├── page.tsx              # list (RSC)
│   │   │   ├── board/page.tsx        # kanban
│   │   │   ├── milestones/page.tsx
│   │   │   ├── modules/page.tsx
│   │   │   └── _components/
│   │   ├── api/v1/                   # REST route handlers (adapter)
│   │   │   ├── tasks/route.ts
│   │   │   ├── tasks/[id]/route.ts
│   │   │   └── ...
│   │   ├── mcp/route.ts              # MCP server (adapter)
│   │   └── _actions/                 # server actions (adapter)
│   ├── server/
│   │   ├── services/                 # ★ BUSINESS LOGIC (§3, §8)
│   │   │   ├── task.service.ts
│   │   │   ├── project.service.ts
│   │   │   ├── milestone.service.ts
│   │   │   ├── module.service.ts
│   │   │   └── comment.service.ts
│   │   ├── validators/               # zod schemas (shared)
│   │   ├── db/ (schema.ts, queries.ts, index.ts)
│   │   └── auth/
│   ├── components/ui/                # MVP UI
│   └── lib/
├── drizzle/
├── docker/ (Dockerfile, compose.postgres-container.yml, compose.postgres-host.yml)
└── package.json
```

---

## 13. Lộ trình

**Phase 1 — Core**
1. Schema 7 bảng + migration + per-project seq.
2. **Service layer** + zod validators (làm trước, là nền cho mọi mặt tiền).
3. Auth .ENV + middleware.
4. Project CRUD (+ emoji icon) + sidebar.
5. Milestone + Module CRUD.
6. Task list group-by (module/milestone toggle) + inline quick-add.
7. **Inbox** + quick capture input.
8. Detail panel (?task=) + status_note + comments timeline.
9. Docker deploy.

**Phase 2 — External + Ergonomics**
10. REST API `/api/v1/*` (adapter mỏng lên service).
11. MCP server + tools.
12. Kanban board view + dnd-kit reorder.
13. Filter/sort toolbar, keyboard, command palette.

**Phase 3 — Mở rộng (khi cần)**
14. Labels (cắt ngang).
15. Cycle/sprint.
16. Full-text search (tsvector).
17. Export/import JSON.

---

## 14. Quyết định thiết kế then chốt

| Quyết định | Lý do |
|-----------|-------|
| Module ⟂ Milestone tách 2 trục | Sub-system và phase độc lập; task thuộc cả hai. Đúng bài học từ Plane |
| Service layer tách khỏi mọi adapter | 3 mặt tiền (web/API/MCP) dùng chung logic, không viết lại |
| status_note (overwrite) ≠ comments (append) | "Đang sao" vs "đã qua gì" là 2 nhu cầu khác nhau |
| Inbox = project_id NULL | Capture trước, triage sau (GTD); không ép phân loại sớm |
| seq cấp lúc rời Inbox | Task Inbox chưa cần ref; tránh đốt số cho ý tưởng vứt đi |
| Detail panel = search param | Giữ list phía sau, deep-link đúng |
| Login .ENV + cookie | Solo + domain riêng; OAuth là thừa |
| MCP source = agent | Phân biệt task/comment do AI tạo vs người |
| Emoji icon trên project | Nhận diện nhanh ở sidebar, rẻ |
