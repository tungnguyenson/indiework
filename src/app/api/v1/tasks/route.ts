import { taskService } from '@/server/services';
import { requireBearer } from '@/server/auth/token';
import { ok, unauthorized, handleServiceError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

const csv = (v: string | null) => v?.split(',').map((s) => s.trim()).filter(Boolean);
const bool = (v: string | null) => (v === null ? undefined : v !== 'false');

export async function GET(req: Request) {
  if (!(await requireBearer(req))) return unauthorized();
  try {
    const q = new URL(req.url).searchParams;
    const tasks = await taskService.list({
      projectId: q.get('projectId') ?? undefined,
      moduleId: q.get('moduleId') ?? undefined,
      milestoneId: q.get('milestoneId') ?? undefined,
      inbox: bool(q.get('inbox')),
      hideDone: bool(q.get('hideDone')),
      status: csv(q.get('status')),
      priority: csv(q.get('priority')),
    });
    return ok(tasks);
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function POST(req: Request) {
  const userId = await requireBearer(req);
  if (!userId) return unauthorized();
  try {
    const body = await req.json();
    const task = await taskService.create(body, userId);
    return ok(task, 201);
  } catch (e) {
    return handleServiceError(e);
  }
}
