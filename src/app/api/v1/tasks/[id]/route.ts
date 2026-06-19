import { taskService } from '@/server/services';
import { requireBearer } from '@/server/auth/token';
import { apiRateState } from '@/server/auth/rate-limit';
import { ok, unauthorized, tooManyRequests, handleServiceError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rate = apiRateState(req);
  if (rate.limited) return tooManyRequests(rate.retryAfterSec);
  if (!requireBearer(req)) return unauthorized();
  try {
    const { id } = await ctx.params;
    return ok(await taskService.getById(id));
  } catch (e) {
    return handleServiceError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rate = apiRateState(req);
  if (rate.limited) return tooManyRequests(rate.retryAfterSec);
  if (!requireBearer(req)) return unauthorized();
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    return ok(await taskService.update(id, body));
  } catch (e) {
    return handleServiceError(e);
  }
}
