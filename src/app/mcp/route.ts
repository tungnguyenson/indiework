/**
 * MCP server endpoint — stateless JSON-RPC 2.0 over HTTP POST. Compatible with
 * MCP "streamable HTTP" clients in stateless mode (no SSE / session needed for
 * simple tool calls). Each tool is a thin wrapper over the service layer.
 *
 * We implement the protocol directly (initialize / tools/list / tools/call)
 * rather than bridging the SDK's Node-stream transport into a Web route handler.
 */
import {
  taskService,
  projectService,
  milestoneService,
  moduleService,
  commentService,
  workspaceService,
  attachmentService,
} from '@/server/services';
import { requireBearer, MCP_COMMENT_SOURCE } from '@/server/auth/token';
import { apiRateState } from '@/server/auth/rate-limit';
import { ServiceError } from '@/server/services';
import { attachmentBlocks, attachmentView, serializeToolResult } from '@/server/mcp-content';
import {
  TASK_STATUS,
  TASK_PRIORITY,
  PROJECT_STATUS,
  MILESTONE_STATUS,
  MODULE_STATE,
  MODULE_ICONS,
} from '@/lib/domain';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'indiework', version: '0.1.0' };

type Json = Record<string, unknown>;

interface Tool {
  name: string;
  description: string;
  inputSchema: Json;
  run: (args: Json) => Promise<unknown>;
}

const str = () => ({ type: 'string' });

const projectIdFromKey = async (key: unknown): Promise<string | undefined> => {
  if (!key || typeof key !== 'string') return undefined;
  return (await projectService.getByKey(key)).id;
};
const idFromRef = async (ref: unknown): Promise<string> => {
  if (typeof ref !== 'string') throw new ServiceError('bad_request', 'ref is required');
  return (await taskService.getByRef(ref)).id;
};
/** Resolve a required project KEY → uuid (throws if absent or unknown). */
const requireProjectId = async (key: unknown): Promise<string> => {
  if (typeof key !== 'string' || !key)
    throw new ServiceError('bad_request', 'project (a project KEY) is required');
  return (await projectService.getByKey(key)).id;
};

/**
 * Parent changes go through `move_subtask` (it enforces the one-level-deep /
 * same-project invariants). The generic patch schema silently drops unknown
 * keys, so a `parent`/`parentId`/`parent_ref` slipped into a patch would no-op
 * and report success — guard against that confusing silent failure.
 */
const PARENT_PATCH_KEYS = ['parent', 'parentId', 'parent_ref'] as const;
function rejectParentInPatch(patch: unknown): void {
  if (patch && typeof patch === 'object' && PARENT_PATCH_KEYS.some((k) => k in (patch as Json))) {
    throw new ServiceError(
      'bad_request',
      "to change a task's parent, use move_subtask (update_task does not change parent)",
    );
  }
}

/** Format a thrown validation/service error into a one-line message for clients. */
function formatError(e: unknown): string {
  if (e instanceof ZodError)
    return e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
  if (e instanceof ServiceError) return e.message;
  return 'Tool execution failed';
}

// Slim projections for write results: a mutation only needs to hand back the
// addressable handle (ref/id) plus a human-readable label to confirm the write,
// not the whole row echoed verbatim. Reads (get_*/list_*) keep the full object.
const slimTask = (t: { ref: string | null; id: string; title: string; status: string }) => ({
  ref: t.ref,
  id: t.id,
  title: t.title,
  status: t.status,
});
const slimProject = (p: { key: string; id: string; name: string; status: string }) => ({
  key: p.key,
  id: p.id,
  name: p.name,
  status: p.status,
});
const slimMilestone = (m: { id: string; name: string; status: string }) => ({
  id: m.id,
  name: m.name,
  status: m.status,
});
const slimModule = (m: { id: string; name: string; state: string }) => ({
  id: m.id,
  name: m.name,
  state: m.state,
});
const slimComment = (c: { id: string; source: string }) => ({ id: c.id, source: c.source });
const commentView = (c: {
  id: string;
  body: string;
  source: string;
  createdAt: Date;
  editedAt: Date | null;
}) => ({
  id: c.id,
  body: c.body,
  source: c.source,
  createdAt: c.createdAt,
  editedAt: c.editedAt,
});

const TOOLS = (agentUserId: string): Tool[] => [
  {
    name: 'create_task',
    description: 'Create a task. Omit `project` to drop it into the Inbox. `project` is a project KEY (e.g. "SITE").',
    inputSchema: {
      type: 'object',
      properties: {
        title: str(),
        project: str(),
        module: str(),
        milestone: str(),
        status: { type: 'string', enum: [...TASK_STATUS], description: 'inbox·backlog·todo·in_progress·in_review·pending·done·cancelled' },
        priority: { type: 'string', enum: [...TASK_PRIORITY] },
        due_date: { type: 'string', description: 'ISO date, e.g. 2026-07-15' },
      },
      required: ['title'],
    },
    run: async (a) =>
      slimTask(
        await taskService.create({
          title: a.title as string,
          projectId: await projectIdFromKey(a.project),
          moduleId: (a.module as string) ?? undefined,
          milestoneId: (a.milestone as string) ?? undefined,
          status: a.status as never,
          priority: a.priority as never,
          dueDate: a.due_date ? new Date(a.due_date as string) : undefined,
        }, agentUserId),
      ),
  },
  {
    name: 'create_tasks',
    description:
      'Bulk-create tasks in one call. `project` (a project KEY) applies to every item; omit it to drop them all into the Inbox. Returns one result per item, in order: { ok: true, ref, id } or { ok: false, error }. One bad item does not abort the rest.',
    inputSchema: {
      type: 'object',
      properties: {
        project: str(),
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: str(),
              module: str(),
              milestone: str(),
              status: { type: 'string', enum: [...TASK_STATUS] },
              priority: { type: 'string', enum: [...TASK_PRIORITY] },
              due_date: { ...str(), description: 'ISO date, e.g. 2026-07-15' },
            },
            required: ['title'],
          },
        },
      },
      required: ['tasks'],
    },
    run: async (a) => {
      const projectId = await projectIdFromKey(a.project);
      const items = Array.isArray(a.tasks) ? (a.tasks as Json[]) : [];
      const results: Array<
        { ok: true; ref: string | null; id: string } | { ok: false; error: string }
      > = [];
      for (const it of items) {
        try {
          const t = await taskService.create({
            title: it.title as string,
            projectId,
            moduleId: (it.module as string) ?? undefined,
            milestoneId: (it.milestone as string) ?? undefined,
            status: it.status as never,
            priority: it.priority as never,
            dueDate: it.due_date ? new Date(it.due_date as string) : undefined,
          }, agentUserId);
          results.push({ ok: true, ref: t.ref, id: t.id });
        } catch (e) {
          results.push({ ok: false, error: formatError(e) });
        }
      }
      return results;
    },
  },
  {
    name: 'add_subtask',
    description: 'Add a sub-task (one level) under a parent task. `parent_ref` is the parent ref, e.g. "SITE-3". Inherits the parent project/module/milestone and gets its own ref (e.g. "SITE-15"). Optional `status` (defaults to "todo").',
    inputSchema: {
      type: 'object',
      properties: {
        parent_ref: str(),
        title: str(),
        status: { type: 'string', enum: [...TASK_STATUS], description: 'inbox·backlog·todo·in_progress·in_review·pending·done·cancelled' },
      },
      required: ['parent_ref', 'title'],
    },
    run: async (a) =>
      slimTask(await taskService.addSubtask(await idFromRef(a.parent_ref), a.title as string, a.status as never, agentUserId)),
  },
  {
    name: 'move_subtask',
    description:
      'Change a task\'s parent. `ref` is the task to move. Pass `parent_ref` (e.g. "SITE-3") to move it under that task as a one-level sub-task, or omit `parent_ref` to detach it back to the top level. The new parent must be a top-level task in the SAME project, and the moved task must not have sub-tasks of its own; cross-project moves are not supported. The ref stays the same. (Parent changes only happen here — `update_task` ignores parent fields.)',
    inputSchema: {
      type: 'object',
      properties: { ref: str(), parent_ref: str() },
      required: ['ref'],
    },
    run: async (a) =>
      slimTask(
        await taskService.reparent(
          await idFromRef(a.ref),
          a.parent_ref ? await idFromRef(a.parent_ref) : null,
        ),
      ),
  },
  {
    name: 'list_tasks',
    description: 'List root tasks, optionally filtered. `project` is a project KEY; `status` is a single status.',
    inputSchema: {
      type: 'object',
      properties: { project: str(), status: { type: 'string', enum: [...TASK_STATUS] }, milestone: str(), module: str() },
    },
    run: async (a) =>
      (
        await taskService.list({
          projectId: await projectIdFromKey(a.project),
          status: a.status ? [a.status as never] : undefined,
          milestoneId: (a.milestone as string) ?? undefined,
          moduleId: (a.module as string) ?? undefined,
        })
      ).filter((t) => !t.parentId), // root tasks only; sub-tasks are reached via get_task
  },
  {
    name: 'get_task',
    description:
      'Get one task by its ref, e.g. "SITE-3". Returns the task plus its `children` (sub-tasks, each with its own ref + status) and `attachments` (metadata: id, name, type, size, ext, previewable). `attachmentCount` reflects the real count; use `view_attachment` with an attachment id to fetch/see the file.',
    inputSchema: { type: 'object', properties: { ref: str() }, required: ['ref'] },
    run: async (a) => {
      const task = await taskService.getByRef(a.ref as string);
      const [children, attachments] = await Promise.all([
        taskService.listChildren(task.id),
        attachmentService.list(task.id),
      ]);
      return {
        ...task,
        attachmentCount: attachments.length,
        children: children.map(slimTask),
        attachments: attachments.map(attachmentView),
      };
    },
  },
  {
    name: 'view_attachment',
    description:
      "Fetch a task attachment by its `id` (get ids from get_task's `attachments`). Image attachments are returned as an image block so you can see them; other files return metadata only (fetch bytes via the download API).",
    inputSchema: { type: 'object', properties: { id: str() }, required: ['id'] },
    run: async (a) => {
      const id = a.id as string;
      const meta = await attachmentService.get(id);
      // Only images with stored bytes are fetchable into a viewable block; skip
      // the storage read for everything else (attachmentBlocks handles the copy).
      const opened = meta.type === 'image' && meta.path ? await attachmentService.open(id) : null;
      return attachmentBlocks(meta, opened);
    },
  },
  {
    name: 'update_task',
    description: 'Patch a task by ref. `patch` may set title, status, priority, moduleId, milestoneId, dueDate, statusNote, description. To change a task\'s parent, use move_subtask instead — parent fields here are rejected.',
    inputSchema: {
      type: 'object',
      properties: { ref: str(), patch: { type: 'object' } },
      required: ['ref', 'patch'],
    },
    run: async (a) => {
      rejectParentInPatch(a.patch);
      return slimTask(await taskService.update(await idFromRef(a.ref), (a.patch as Json) ?? {}));
    },
  },
  {
    name: 'update_tasks',
    description:
      'Bulk-patch tasks in one call. `updates` is a list of { ref, patch }; each `patch` uses camelCase keys (title, status, priority, moduleId, milestoneId, dueDate, statusNote, description). Parent changes are not allowed here — use move_subtask. Returns one result per item, in order: { ok: true, ref } or { ok: false, ref, error }.',
    inputSchema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: { ref: str(), patch: { type: 'object' } },
            required: ['ref', 'patch'],
          },
        },
      },
      required: ['updates'],
    },
    run: async (a) => {
      const items = Array.isArray(a.updates) ? (a.updates as Json[]) : [];
      const results: Array<
        { ok: true; ref: string | null } | { ok: false; ref: string | null; error: string }
      > = [];
      for (const it of items) {
        const ref = typeof it.ref === 'string' ? it.ref : null;
        try {
          rejectParentInPatch(it.patch);
          const t = await taskService.update(await idFromRef(it.ref), (it.patch as Json) ?? {});
          results.push({ ok: true, ref: t.ref });
        } catch (e) {
          results.push({ ok: false, ref, error: formatError(e) });
        }
      }
      return results;
    },
  },
  {
    name: 'add_comment',
    description: 'Append a progress note to a task timeline (recorded as source "agent").',
    inputSchema: {
      type: 'object',
      properties: { ref: str(), body: str() },
      required: ['ref', 'body'],
    },
    run: async (a) =>
      slimComment(
        await commentService.add(
          { taskId: await idFromRef(a.ref), body: a.body as string },
          MCP_COMMENT_SOURCE,
          agentUserId,
        ),
      ),
  },
  {
    name: 'list_comments',
    description:
      'List a task\'s comment timeline in chronological order (oldest first). `ref` is a task ref, e.g. "SITE-3". Each comment has an `id` (use it with update_comment / delete_comment), `body`, `source` (web·api·mcp·agent), `createdAt`, and `editedAt` (null until first edit).',
    inputSchema: { type: 'object', properties: { ref: str() }, required: ['ref'] },
    run: async (a) => (await commentService.list(await idFromRef(a.ref))).map(commentView),
  },
  {
    name: 'update_comment',
    description:
      'Edit a comment\'s body in place by its `id` (get the id from list_comments or add_comment). Stamps an "edited" badge but keeps the original source. Markdown.',
    inputSchema: {
      type: 'object',
      properties: { id: str(), body: str() },
      required: ['id', 'body'],
    },
    run: async (a) => slimComment(await commentService.update({ id: a.id, body: a.body })),
  },
  {
    name: 'delete_comment',
    description:
      'Permanently delete a comment by its `id` (get the id from list_comments). Hard delete — cannot be undone.',
    inputSchema: { type: 'object', properties: { id: str() }, required: ['id'] },
    run: async (a) => slimComment(await commentService.delete({ id: a.id })),
  },
  {
    name: 'set_status_note',
    description: "Overwrite a task's pinned status note (what's blocking / where it is).",
    inputSchema: {
      type: 'object',
      properties: { ref: str(), note: str() },
      required: ['ref', 'note'],
    },
    run: async (a) =>
      slimTask(await taskService.setStatusNote(await idFromRef(a.ref), { note: a.note as string })),
  },
  {
    name: 'list_projects',
    description: 'List all projects.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => projectService.list(),
  },
  {
    name: 'list_inbox',
    description: 'List untriaged Inbox tasks.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => taskService.listInbox(),
  },

  // ---- Projects ----
  {
    name: 'get_project',
    description:
      'Get one project by KEY (e.g. "SITE") with its milestones and modules embedded. Use this to discover milestone/module ids before update/remove/reorder.',
    inputSchema: { type: 'object', properties: { project: str() }, required: ['project'] },
    run: async (a) => {
      const project = await projectService.getByKey(a.project as string);
      const [milestones, modules] = await Promise.all([
        milestoneService.list(project.id),
        moduleService.list(project.id),
      ]);
      return { ...project, milestones, modules };
    },
  },
  {
    name: 'create_project',
    description:
      'Create a project. `key` is the unique uppercase ref prefix (2–10 chars, A–Z then A–Z/0–9, e.g. "SITE").',
    inputSchema: {
      type: 'object',
      properties: {
        key: str(),
        name: str(),
        emoji: { ...str(), description: 'An emoji glyph (e.g. "🚀") or a Lucide icon name (e.g. "rocket").' },
        color: str(),
        status: { type: 'string', enum: [...PROJECT_STATUS] },
        pinned: { type: 'boolean' },
        tags: { type: 'array', items: str() },
        short_desc: str(),
        status_note: str(),
        description: { ...str(), description: 'Markdown' },
      },
      required: ['key', 'name'],
    },
    run: async (a) =>
      slimProject(
        await projectService.create({
          key: a.key,
          name: a.name,
          emoji: a.emoji,
          color: a.color,
          status: a.status,
          pinned: a.pinned,
          tags: a.tags,
          shortDesc: a.short_desc,
          statusNote: a.status_note,
          description: a.description,
          // Anchor MCP-created projects to the default workspace so they stay
          // visible once the sidebar filters projects by active workspace.
          workspaceId: (await workspaceService.getDefault())?.id ?? null,
        }),
      ),
  },
  {
    name: 'update_project',
    description:
      'Patch a project by KEY. `patch` may set name, status, pinned, tags, emoji, color, shortDesc, statusNote, description (markdown). Keys are camelCase.',
    inputSchema: {
      type: 'object',
      properties: { project: str(), patch: { type: 'object' } },
      required: ['project', 'patch'],
    },
    run: async (a) =>
      slimProject(await projectService.update(await requireProjectId(a.project), (a.patch as Json) ?? {})),
  },
  {
    name: 'archive_project',
    description:
      'Archive (soft-delete) a project by KEY. Reversible — sets archived_at and the data is retained. There is no hard delete.',
    inputSchema: { type: 'object', properties: { project: str() }, required: ['project'] },
    run: async (a) => slimProject(await projectService.archive(await requireProjectId(a.project))),
  },

  // ---- Tasks (destructive) ----
  {
    name: 'delete_task',
    description: 'Permanently delete a task by ref, e.g. "SITE-3". Hard delete — cannot be undone.',
    inputSchema: { type: 'object', properties: { ref: str() }, required: ['ref'] },
    run: async (a) => taskService.delete(await idFromRef(a.ref)),
  },

  // ---- Milestones ----
  {
    name: 'create_milestone',
    description: 'Create a milestone in a project. `project` is a project KEY.',
    inputSchema: {
      type: 'object',
      properties: {
        project: str(),
        name: str(),
        description: str(),
        status: { type: 'string', enum: [...MILESTONE_STATUS] },
        target_date: { ...str(), description: 'ISO date, e.g. 2026-07-15' },
        position: { type: 'integer' },
      },
      required: ['project', 'name'],
    },
    run: async (a) =>
      slimMilestone(
        await milestoneService.create({
          projectId: await requireProjectId(a.project),
          name: a.name,
          description: a.description,
          status: a.status,
          targetDate: a.target_date,
          position: a.position,
        }),
      ),
  },
  {
    name: 'update_milestone',
    description:
      'Patch a milestone by id (get the id from get_project). `patch` may set name, description, status, targetDate (ISO date), position. Keys are camelCase.',
    inputSchema: {
      type: 'object',
      properties: { id: str(), patch: { type: 'object' } },
      required: ['id', 'patch'],
    },
    run: async (a) => slimMilestone(await milestoneService.update(a.id as string, (a.patch as Json) ?? {})),
  },
  {
    name: 'set_milestone_status',
    description: 'Set a milestone status by id. One of planned · active · done.',
    inputSchema: {
      type: 'object',
      properties: { id: str(), status: { type: 'string', enum: [...MILESTONE_STATUS] } },
      required: ['id', 'status'],
    },
    run: async (a) => slimMilestone(await milestoneService.setStatus(a.id as string, a.status as never)),
  },
  {
    name: 'remove_milestone',
    description:
      "Permanently delete a milestone by id. Tasks keep working — their milestone link is cleared.",
    inputSchema: { type: 'object', properties: { id: str() }, required: ['id'] },
    run: async (a) => milestoneService.remove(a.id as string),
  },
  {
    name: 'reorder_milestones',
    description:
      "Set the display order of a project's milestones. `ids` is the full ordered list of milestone ids.",
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: str() } },
      required: ['ids'],
    },
    run: async (a) => milestoneService.reorder({ ids: a.ids }),
  },

  // ---- Modules ----
  {
    name: 'create_module',
    description: 'Create a module (sub-system) in a project. `project` is a project KEY.',
    inputSchema: {
      type: 'object',
      properties: {
        project: str(),
        name: str(),
        color: str(),
        icon: {
          type: 'string',
          description: `An emoji glyph (e.g. "📦") or a Lucide icon name. Suggested: ${MODULE_ICONS.join(', ')}.`,
        },
        state: { type: 'string', enum: [...MODULE_STATE] },
        description: str(),
        position: { type: 'integer' },
      },
      required: ['project', 'name'],
    },
    run: async (a) =>
      slimModule(
        await moduleService.create({
          projectId: await requireProjectId(a.project),
          name: a.name,
          color: a.color,
          icon: a.icon,
          state: a.state,
          description: a.description,
          position: a.position,
        }),
      ),
  },
  {
    name: 'update_module',
    description:
      'Patch a module by id (get the id from get_project). `patch` may set name, color, icon, state, description, position. Keys are camelCase.',
    inputSchema: {
      type: 'object',
      properties: { id: str(), patch: { type: 'object' } },
      required: ['id', 'patch'],
    },
    run: async (a) => slimModule(await moduleService.update(a.id as string, (a.patch as Json) ?? {})),
  },
  {
    name: 'archive_module',
    description: 'Archive (soft-delete) a module by id. Reversible — sets archived_at.',
    inputSchema: { type: 'object', properties: { id: str() }, required: ['id'] },
    run: async (a) => slimModule(await moduleService.archive(a.id as string)),
  },
  {
    name: 'reorder_modules',
    description:
      "Set the display order of a project's modules. `ids` is the full ordered list of module ids.",
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: str() } },
      required: ['ids'],
    },
    run: async (a) => moduleService.reorder({ ids: a.ids }),
  },
];

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMessage(msg: Json, tools: Tool[]): Promise<Json | null> {
  const { id, method, params } = msg as { id?: unknown; method?: string; params?: Json };

  // Notifications have no id and expect no response.
  if (id === undefined || id === null) return null;

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
    case 'tools/call': {
      const name = (params?.name as string) ?? '';
      const tool = tools.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await tool.run((params?.arguments as Json) ?? {});
        return rpcResult(id, serializeToolResult(result));
      } catch (e) {
        return rpcResult(id, { content: [{ type: 'text', text: formatError(e) }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: Request) {
  const rate = apiRateState(req);
  if (rate.limited) {
    return Response.json(rpcError(null, -32099, 'Too many requests'), {
      status: 429,
      headers: { 'Retry-After': String(rate.retryAfterSec) },
    });
  }
  const agentUserId = await requireBearer(req);
  if (!agentUserId) {
    return Response.json(rpcError(null, -32001, 'Unauthorized'), { status: 401 });
  }
  const tools = TOOLS(agentUserId);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handleMessage(m as Json, tools)))).filter(Boolean);
    if (responses.length === 0) return new Response(null, { status: 202 });
    return Response.json(responses);
  }

  const response = await handleMessage(body as Json, tools);
  if (!response) return new Response(null, { status: 202 });
  return Response.json(response);
}

export function GET() {
  // Stateless server: no server-initiated SSE stream.
  return new Response('MCP endpoint — use POST with JSON-RPC.', { status: 405 });
}
