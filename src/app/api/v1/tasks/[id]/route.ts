import { taskService } from '@/server/services';
import { requireBearer } from '@/server/auth/token';
import { ok, unauthorized, handleServiceError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireBearer(req))) return unauthorized();
  try {
    const { id } = await ctx.params;
    return ok(await taskService.getById(id));
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireBearer(req))) return unauthorized();
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    return ok(await taskService.update(id, body));
  } catch (e) {
    return handleServiceError(e);
  }
}
