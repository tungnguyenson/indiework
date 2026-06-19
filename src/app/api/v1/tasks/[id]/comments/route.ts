import { commentService } from '@/server/services';
import { requireBearer, API_COMMENT_SOURCE } from '@/server/auth/token';
import { apiRateState } from '@/server/auth/rate-limit';
import { ok, unauthorized, tooManyRequests, handleServiceError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rate = apiRateState(req);
  if (rate.limited) return tooManyRequests(rate.retryAfterSec);
  if (!requireBearer(req)) return unauthorized();
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const comment = await commentService.add({ taskId: id, body: body?.body }, API_COMMENT_SOURCE);
    return ok(comment, 201);
  } catch (e) {
    return handleServiceError(e);
  }
}
