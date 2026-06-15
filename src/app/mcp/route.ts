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
} from '@/server/services';
import { requireBearer, MCP_COMMENT_SOURCE } from '@/server/auth/token';
import { ServiceError } from '@/server/services';
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

const TOOLS: Tool[] = [
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
      taskService.create({
        title: a.title as string,
        projectId: await projectIdFromKey(a.project),
        moduleId: (a.module as string) ?? undefined,
        milestoneId: (a.milestone as string) ?? undefined,
        status: a.status as never,
        priority: a.priority as never,
        dueDate: a.due_date ? new Date(a.due_date as string) : undefined,
      }),
  },
  {
    name: 'add_subtask',
    description: 'Add a sub-task (one level) under a parent task. `parent_ref` is the parent ref, e.g. "SITE-3". Inherits the parent project/module/milestone.',
    inputSchema: {
      type: 'object',
      properties: { parent_ref: str(), title: str() },
      required: ['parent_ref', 'title'],
    },
    run: async (a) => taskService.addSubtask(await idFromRef(a.parent_ref), a.title as string),
  },
  {
    name: 'list_tasks',
    description: 'List root tasks, optionally filtered. `project` is a project KEY; `status` is a single status.',
    inputSchema: {
      type: 'object',
      properties: { project: str(), status: { type: 'string', enum: [...TASK_STATUS] }, milestone: str(), module: str() },
    },
    run: async (a) =>
      taskService.list({
        projectId: await projectIdFromKey(a.project),
        status: a.status ? [a.status as never] : undefined,
        milestoneId: (a.milestone as string) ?? undefined,
        moduleId: (a.module as string) ?? undefined,
      }),
  },
  {
    name: 'get_task',
    description: 'Get one task by its ref, e.g. "SITE-3".',
    inputSchema: { type: 'object', properties: { ref: str() }, required: ['ref'] },
    run: async (a) => taskService.getByRef(a.ref as string),
  },
  {
    name: 'update_task',
    description: 'Patch a task by ref. `patch` may set title, status, priority, moduleId, milestoneId, dueDate, statusNote, description.',
    inputSchema: {
      type: 'object',
      properties: { ref: str(), patch: { type: 'object' } },
      required: ['ref', 'patch'],
    },
    run: async (a) => taskService.update(await idFromRef(a.ref), (a.patch as Json) ?? {}),
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
      commentService.add({ taskId: await idFromRef(a.ref), body: a.body as string }, MCP_COMMENT_SOURCE),
  },
  {
    name: 'set_status_note',
    description: "Overwrite a task's pinned status note (what's blocking / where it is).",
    inputSchema: {
      type: 'object',
      properties: { ref: str(), note: str() },
      required: ['ref', 'note'],
    },
    run: async (a) => taskService.setStatusNote(await idFromRef(a.ref), { note: a.note as string }),
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
];

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMessage(msg: Json): Promise<Json | null> {
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
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
    case 'tools/call': {
      const name = (params?.name as string) ?? '';
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await tool.run((params?.arguments as Json) ?? {});
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        const message =
          e instanceof ZodError
            ? e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
            : e instanceof ServiceError
              ? e.message
              : 'Tool execution failed';
        return rpcResult(id, { content: [{ type: 'text', text: message }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: Request) {
  if (!requireBearer(req)) {
    return Response.json(rpcError(null, -32001, 'Unauthorized'), { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((m) => handleMessage(m as Json)))).filter(Boolean);
    if (responses.length === 0) return new Response(null, { status: 202 });
    return Response.json(responses);
  }

  const response = await handleMessage(body as Json);
  if (!response) return new Response(null, { status: 202 });
  return Response.json(response);
}

export function GET() {
  // Stateless server: no server-initiated SSE stream.
  return new Response('MCP endpoint — use POST with JSON-RPC.', { status: 405 });
}
