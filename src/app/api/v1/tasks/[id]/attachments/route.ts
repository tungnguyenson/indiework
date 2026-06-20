import { attachmentService } from '@/server/services';
import { requireBearer } from '@/server/auth/token';
import { apiRateState } from '@/server/auth/rate-limit';
import { MAX_ATTACHMENT_BYTES } from '@/server/attachment-limits';
import { ok, unauthorized, tooManyRequests, fail, handleServiceError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rate = apiRateState(req);
  if (rate.limited) return tooManyRequests(rate.retryAfterSec);
  const userId = await requireBearer(req);
  if (!userId) return unauthorized();
  try {
    const { id: taskId } = await ctx.params;
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('file is required (multipart field "file")', 400);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return fail(`File exceeds the ${MAX_ATTACHMENT_BYTES} byte limit`, 413);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const att = await attachmentService.upload({
      taskId,
      name: file.name,
      bytes,
      contentType: file.type || 'application/octet-stream',
    });
    return ok(att, 201);
  } catch (e) {
    return handleServiceError(e);
  }
}
