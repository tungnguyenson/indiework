import { commentService } from '@/server/services';
import { requireBearer, API_COMMENT_SOURCE } from '@/server/auth/token';
import { ok, unauthorized, handleServiceError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await requireBearer(req);
  if (!userId) return unauthorized();
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const comment = await commentService.add({ taskId: id, body: body?.body }, API_COMMENT_SOURCE, userId);
    return ok(comment, 201);
  } catch (e) {
    return handleServiceError(e);
  }
}
