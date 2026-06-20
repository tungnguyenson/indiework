# Thiết kế phân quyền (Authorization): IndieWork Path 1

> Doc giải thích **cách thiết kế phân quyền** cho bản multi-tenant (Path 1): ai được làm gì, trong workspace nào, và cơ chế ép buộc (enforce) ở đâu. Viết để **đọc hiểu**, code/identifier giữ tiếng Anh.
>
> Liên quan: [team-implementation-plan.md](team-implementation-plan.md) (roadmap), task IW-25 / IW-37 / IW-26 / IW-56 / IW-57 / IW-62. Trạng thái: **thiết kế / chưa code**.

---

## 1. Ba câu hỏi mỗi request phải trả lời

Phân quyền trong một app multi-tenant = trả lời tuần tự 3 câu hỏi. Thiếu câu nào là một lỗ hổng.

| # | Câu hỏi | Tên gọi | Trả lời bằng |
|---|---|---|---|
| 1 | Người gọi là **ai**? | Authentication (xác thực) | session cookie / Bearer token → `userId` |
| 2 | Họ đang ở **tenant (workspace) nào**? | Tenant isolation (cô lập) | `workspace_members` → `workspaceId` |
| 3 | Trong workspace đó họ **được làm gì**? | Authorization (uỷ quyền) | `role` + `can(role, action)` |

> **Tenant** = một "khoang" dữ liệu tách biệt. Ở IndieWork, **workspace chính là tenant**: dữ liệu của workspace A phải vô hình với người của workspace B.

Cả 3 câu được gói vào **một object `Ctx`** và truyền xuống mọi service:

```
Request ──► [1] Authenticate ──► [2] Resolve tenant + role ──► Build Ctx ──► Service
              who?  userId          workspace_members          { userId,      ├─ scope:  WHERE workspace_id = ctx.workspaceId
                                    → (workspaceId, role)        workspaceId,  ├─ guard:  can(ctx.role, action) ?
                                                                 role }        └─ stamp:  created_by = ctx.userId
```

---

## 2. Năm mảnh ghép

| Mảnh | Vai trò | Trạng thái |
|---|---|---|
| `users` | **Danh tính** (identity), ai là ai (con người / agent) | ✅ đã có |
| `workspaces` | **Tenant**, khoang dữ liệu | ✅ đã có (chưa có owner/member) |
| `workspace_members` | **Cầu nối** user × workspace → **role**. Trái tim của phân quyền | ❌ IW-56 |
| `Ctx` | **Ngữ cảnh bảo mật** của 1 request: `{ userId, workspaceId, role }` | ❌ IW-25 |
| `can(role, action)` | **Policy**, luật "role này được làm action kia không" | ❌ IW-25 |

---

## 3. Data model

```
users ──< workspace_members >── workspaces
          (userId, workspaceId,
           role, status, ...)
```

`workspace_members` (IW-56):

```ts
export const workspaceMembers = pgTable('workspace_members', {
  id: uuidPk(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  role: text('role', { enum: WORKSPACE_ROLE }).notNull(),  // owner | admin | member | viewer
  status: text('status', { enum: MEMBER_STATUS }).notNull().default('active'), // active | invited | suspended
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex('ws_members_unique').on(t.workspaceId, t.userId), // 1 user 1 role / workspace
  index('ws_members_user_idx').on(t.userId),
]);
```

### Quyết định quan trọng: role nằm trên **membership**, không phải trên **user**

Một người có thể là `owner` ở workspace này nhưng `member` ở workspace khác. Nếu để `role` trên `users` thì không biểu diễn được điều đó. Vậy:

- **`users.role`** = **loại tài khoản** (account type): `human` | `agent`. (Con người đăng nhập được; agent là tài khoản máy cho MCP/API.)
- **`workspace_members.role`** = **quyền trong một workspace**: `owner | admin | member | viewer`.

> ⚠️ Tiêu đề task IW-57 ("Expand USER_ROLE → owner/admin/member/viewer") là cách nói tắt. **Đúng mô hình** là: enum quyền (`WORKSPACE_ROLE`) đặt trên `workspace_members`; `users.role` chỉ còn `human|agent`. Hiện `users.role` đang là `['admin','agent']` ([domain.ts:50](../../src/lib/domain.ts#L50)), migration đổi `admin` → `human`.

---

## 4. Roles: định nghĩa

| Role | Dành cho | Được gì (tóm tắt) |
|---|---|---|
| **owner** | Người tạo / chủ workspace (chủ billing) | Toàn quyền: billing, đổi plan, xoá workspace, quản lý mọi member kể cả admin, chuyển quyền owner |
| **admin** | Người đồng quản trị | Quản lý nội dung (project/task) + mời/đổi role member (dưới owner). **Không** billing, **không** xoá workspace |
| **member** | Cộng tác viên thường | Tạo/sửa project, task, comment; được assign. **Không** quản lý member, **không** billing |
| **viewer** | Khách chỉ xem | Chỉ đọc. Không sửa gì |
| *(agent)* | Tài khoản máy (MCP/API) | Là một `user` type=agent, **có một membership** với role thường là `member`; bị **siết thêm** bởi `api_key.scope` (xem §11) |

Nguyên tắc: **least privilege** (quyền tối thiểu) + **deny by default** (mặc định cấm). `can()` trả `false` trừ khi luật cho phép tường minh.

---

## 5. Actions & ma trận quyền

Action đặt tên theo `resource:verb`, dễ đọc, dễ mở rộng.

| Action | owner | admin | member | viewer |
|---|:--:|:--:|:--:|:--:|
| `workspace:read` | ✅ | ✅ | ✅ | ✅ |
| `workspace:update` (tên, emoji) | ✅ | ✅ | ✗ | ✗ |
| `workspace:manage_plan` / `:delete` | ✅ | ✗ | ✗ | ✗ |
| `member:read` | ✅ | ✅ | ✅ | ✅ |
| `member:invite` / `:update_role` / `:remove` | ✅ | ✅¹ | ✗ | ✗ |
| `billing:manage` | ✅ | ✗ | ✗ | ✗ |
| `project:create` / `:update` / `:archive` | ✅ | ✅ | ✅ | ✗ |
| `project:delete` | ✅ | ✅ | ✗ | ✗ |
| `task:create` / `:update` / `:assign` | ✅ | ✅ | ✅ | ✗ |
| `task:delete` | ✅ | ✅ | ✅² | ✗ |
| `milestone:* ` / `module:*` (create/update) | ✅ | ✅ | ✅ | ✗ |
| `comment:create` | ✅ | ✅ | ✅ | ✗ |
| `comment:delete` (của người khác) | ✅ | ✅ | ✗ | ✗ |
| `apikey:create` / `:revoke` | ✅ | ✅ | own³ | ✗ |
| mọi `*:read` | ✅ | ✅ | ✅ | ✅ |

¹ admin không được đụng tới owner (đổi role/remove owner). ² member chỉ xoá task mình tạo (tuỳ chọn, có thể siết). ³ member chỉ quản lý api_key của chính mình.

> Đây là **bảng khởi điểm**, không phải bất biến. Khi code `POLICY` (IW-25) thì bảng này là nguồn sự thật; sửa bảng = sửa policy.

---

## 6. `can(role, action)`: cách hoạt động

Một hàm **thuần** (pure): cùng input luôn cùng output, không đụng DB. Vì mọi dữ liệu cần (role) đã nằm trong `Ctx`.

```ts
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type Action =
  | 'workspace:update' | 'workspace:delete' | 'workspace:manage_plan'
  | 'member:invite' | 'member:update_role' | 'member:remove'
  | 'billing:manage'
  | 'project:create' | 'project:update' | 'project:archive' | 'project:delete'
  | 'task:create' | 'task:update' | 'task:delete' | 'task:assign'
  | 'comment:create' | 'comment:delete'
  | 'apikey:create' | 'apikey:revoke';

// Deny by default: chỉ liệt kê cái ĐƯỢC phép; '*' = tất cả.
const POLICY: Record<WorkspaceRole, ReadonlySet<Action | '*'>> = {
  owner:  new Set(['*']),
  admin:  new Set([
    'workspace:update',
    'member:invite', 'member:update_role', 'member:remove',
    'project:create', 'project:update', 'project:archive', 'project:delete',
    'task:create', 'task:update', 'task:delete', 'task:assign',
    'comment:create', 'comment:delete', 'apikey:create', 'apikey:revoke',
  ]),
  member: new Set([
    'project:create', 'project:update', 'project:archive',
    'task:create', 'task:update', 'task:delete', 'task:assign',
    'comment:create',
  ]),
  viewer: new Set([]), // chỉ read; read kiểm ở tầng scope, không qua can()
};

export function can(role: WorkspaceRole, action: Action): boolean {
  const allowed = POLICY[role];
  return allowed.has('*') || allowed.has(action);
}
```

> **Read không đi qua `can()`.** Quyền đọc được bảo đảm bởi **tenant scope** (§8): đã là member của workspace thì đọc được nội dung trong workspace đó. `can()` chỉ gác **mutation** (ghi/sửa/xoá) và các thao tác quản trị. Những ràng buộc tinh (admin không đụng owner, member chỉ xoá task của mình) là **check bổ sung trong service**, không nhồi hết vào `can()`.

---

## 7. `Ctx`: dựng & validate mỗi request (IW-37)

`Ctx` được dựng ở **entry point** (biên), rồi truyền xuống. Không phải biến global.

```ts
export interface Ctx {
  userId: string;       // real — không bao giờ null (kể cả agent là 1 user)
  workspaceId: string;  // tenant đang thao tác
  role: WorkspaceRole;  // role của user trong workspace đó
}
```

Dựng theo từng surface:

```ts
// (a) Web — Server Action: cookie → userId → membership
const userId = await requireSession();                       // đã có (require-session.ts)
const workspaceId = await resolveActiveWorkspace(userId);    // cookie iw-workspace, ĐÃ validate vs membership
const role = await memberService.roleOf(userId, workspaceId); // ❗ ném 403 nếu không phải member
const ctx: Ctx = { userId, workspaceId, role };

// (b) REST / MCP: Bearer → api_key → user + workspace của key
const userId = await resolveBearer(req);                     // đã có (token.ts)
const { workspaceId, scope } = apiKey;                       // key gắn vào đúng 1 workspace
const role = await memberService.roleOf(userId, workspaceId);
```

### Bất biến bảo mật (security invariants): phần quan trọng nhất

1. **`workspaceId` KHÔNG BAO GIỜ lấy từ request body.** Luôn từ session/api_key đã verify, và đối chiếu `workspace_members`. Nếu tin body, user A truyền `workspaceId` của B → **thoát tenant** (lỗi **IDOR**, Insecure Direct Object Reference: đoán/đổi id để chạm dữ liệu không thuộc về mình).
2. **`role` tra server-side** từ membership, không nhét vào cookie, không tin client. (Nhất quán với cách [session.ts](../../src/server/auth/session.ts) hiện đã tra role server-side.)
3. **Không phải member của `workspaceId` ⇒ `unauthorized()`** ngay khi dựng Ctx. Người ngoài không vào được tới service.
4. `Ctx` **immutable**, dựng xong không sửa. Dễ test, không side-effect ẩn.

---

## 8. Hai tầng enforcement (defense in depth)

Mỗi service method gác **hai** lớp độc lập, phòng thủ nhiều lớp, hỏng 1 lớp vẫn còn lớp kia:

```ts
async create(ctx: Ctx, input: unknown) {
  // Lớp 1 — PERMISSION GUARD: role có được làm action này không?
  if (!can(ctx.role, 'task:create')) throw forbidden();

  const data = createTaskSchema.parse(input);

  // Lớp 2 — TENANT SCOPE: object đụng tới có thuộc workspace của ctx không?
  await assertProjectInWorkspace(data.projectId, ctx.workspaceId);

  // STAMP: ghi người tạo từ ctx (không nhận từ input)
  return db.insert(tasks).values({ ...data, createdById: ctx.userId });
}

// READ luôn lọc theo tenant — đây là cách "quyền đọc" được bảo đảm
async list(ctx: Ctx) {
  return db.select().from(projects).where(eq(projects.workspaceId, ctx.workspaceId));
}
```

| Tầng | Trả lời | Cơ chế |
|---|---|---|
| **Permission guard** | "role được làm action?" | `can(ctx.role, action)` trước mọi mutation |
| **Tenant scope** | "object thuộc workspace của tôi?" | mọi query `WHERE workspace_id = ctx.workspaceId`; write thì verify object cha thuộc tenant |

**Vì sao đặt ở service layer, không ở middleware?** Vì cả 3 surface (web action, REST, MCP) đều gọi chung `src/server/services/*`. Gác ở service = **một nguồn sự thật**, không surface nào lọt. Middleware chỉ chặn được route, không chặn được Server Action (vốn là entry point riêng, xem [require-session.ts](../../src/server/auth/require-session.ts)).

---

## 9. Cô lập tenant & test (IW-30)

Mối đe doạ lớn nhất của multi-tenant là **rò dữ liệu chéo tenant**. Hôm nay `workspaceService.list()` trả **tất cả** workspace ([workspace.service.ts](../../src/server/services/workspace.service.ts)), an toàn với 1 user, là lỗ hổng ngay khi có user thứ 2.

Chiến lược test (lưới an toàn chốt lại toàn bộ P1):

```ts
// Cho 2 tenant A, B. Với MỌI service method:
test('user của A không đọc/ghi được dữ liệu của B', async () => {
  const ctxA = fakeCtx({ workspaceId: A, role: 'owner' });
  const taskOfB = await seedTaskIn(B);
  await expect(taskService.get(ctxA, taskOfB.id)).rejects.toThrow('not_found');
  // not_found (không phải forbidden) để KHÔNG lộ sự tồn tại của object B
});
```

> Lưu ý nhỏ nhưng quan trọng: chạm object ngoài tenant nên trả **`not_found`**, không phải `forbidden`, tránh tiết lộ "object này có tồn tại (ở tenant khác)".

---

## 10. Tương tác với tier (`workspace.plan`)

Phân quyền (role) và **tier** (`solo` | `team`, IW-61) là **hai trục độc lập**, kết hợp lại:

- **`can(role, action)`** = "role này có quyền không".
- **tier gate** = "feature này có mở ở plan này không".

Một mutation collab phải qua **cả hai**:

```ts
if (workspace.plan !== 'team') throw featureLocked('assignee');  // tier gate
if (!can(ctx.role, 'task:assign')) throw forbidden();           // permission
```

- **Solo:** `workspace_members` chỉ 1 row (owner), invite tắt, feature collab (assignee/mention/notification) ẩn → RBAC thực tế "thu về owner". Engine vẫn y nguyên.
- **Team:** mở multi-member, invite, assignment, RBAC đủ 4 role.

Nói cách khác: **role quyết định *ai trong nhóm* được làm; tier quyết định *workspace này* có tính năng nhóm hay chưa.**

---

## 11. Agent & API key: actor không phải người

Agent (MCP/API) cũng đi qua đúng mô hình, không có đường tắt:

1. Agent là một `users` row `type=agent` (passwordless).
2. Nó có **một `workspace_members`** trong workspace nó phục vụ, role thường `member`.
3. `api_key` gắn `(userId=agent, workspaceId)` → `resolveBearer` ([token.ts](../../src/server/auth/token.ts)) cho ra `userId`, từ đó dựng `Ctx`.
4. **`api_key.scope`** (`read` | `write` | `read-write`) là **cap siết thêm** trên role:

```
quyền hiệu lực của agent = perms(role)  ∩  cap(api_key.scope)
```

Ví dụ: agent role `member` nhưng key `scope=read` → chỉ đọc, dù member vốn ghi được. Đây là least-privilege cho token tự động.

> Mọi hành động agent đều **attribute về user thật** (`createdById = agent.userId`) → audit/timeline biết "ai" làm, kể cả máy. (Đã có nền: IW-39, IW-40.)

---

## 12. Edge cases & quyết định

| Tình huống | Quyết định |
|---|---|
| Xoá owner cuối cùng | **Cấm.** Luôn ≥ 1 owner/workspace. Muốn rời thì chuyển quyền owner trước |
| admin tự nâng mình thành owner | **Cấm.** Chỉ owner mới phong owner |
| admin đụng tới owner (đổi role/remove) | **Cấm** (đã ghi ở ma trận, ¹) |
| member xoá task người khác tạo | Mặc định **cấm**, chỉ xoá task mình tạo (check trong service, không qua `can()`) |
| User bị `disabled` / membership `suspended` | Dựng Ctx **thất bại** → coi như chưa đăng nhập |
| Invite chưa accept | `workspace_members.status='invited'`, **chưa** tính là member active; không vào được dữ liệu |
| User là member nhiều workspace | `Ctx` chỉ mang **1** `workspaceId` (cái đang active); đổi workspace = dựng Ctx mới |

---

## 13. Ví dụ chạy thực tế

**(a) Member (web) tạo task** → `requireSession`→userId; active workspace=W; `roleOf`→`member`; `can('member','task:create')`=✅; project thuộc W ✅; insert với `createdById=userId`. ✔

**(b) Viewer cố xoá task** → Ctx role=`viewer`; `can('viewer','task:delete')`=❌ → `forbidden()`. ✔

**(c) Agent qua MCP tạo comment** → Bearer→api_key→(agentId, W, scope=read-write); role=`member`; `can`=✅; cap write ✅; insert comment `createdById=agentId`, source=agent. ✔

**(d) User của tenant A đọc task của tenant B** → Ctx.workspaceId=A; query task B `WHERE workspace_id=A` → 0 row → `not_found`. Không lộ gì. ✔

---

## 14. Ranh giới YAGNI: cái KHÔNG làm (lúc này)

Giữ đơn giản, chỉ thêm khi có nhu cầu thật:

- ❌ **Per-resource ACL** (chia sẻ 1 project lẻ cho người ngoài role), chưa cần.
- ❌ **Custom roles** (tự định nghĩa role), 4 role cố định là đủ.
- ❌ **Tầng `organization`** trên workspace, workspace là tenant, dừng ở đó.
- ❌ **Field-level permission** (ẩn từng field), không.
- ❌ **Private project trong workspace**, mọi member thấy mọi project của workspace (đổi sau nếu cần).

---

## 15. Map sang task IW

| Phần doc | Task |
|---|---|
| `workspace_members` (§3) | **IW-56** |
| `WORKSPACE_ROLE` enum + `users.role`→`human/agent` (§4) | **IW-57** |
| `Ctx` type + `can()`/POLICY (§5–6) | **IW-25** |
| Resolver dựng Ctx + invariants (§7) | **IW-37** |
| Thread Ctx + 2 tầng enforcement (§8) | **IW-26**, **IW-27** |
| Tenant-isolation tests (§9) | **IW-30** |
| Tier gate kết hợp (§10) | **IW-61**, **IW-62** |
| Agent/api_key scope (§11) | **IW-58** (gỡ static token) |

Thứ tự làm gợi ý: **IW-56 → IW-57 → IW-25 → IW-37 → IW-26/27 → IW-30**.
