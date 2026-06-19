import { projectService } from '@/server/services';
import { requireBearer } from '@/server/auth/token';
import { apiRateState } from '@/server/auth/rate-limit';
import { ok, unauthorized, tooManyRequests, handleServiceError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rate = apiRateState(req);
  if (rate.limited) return tooManyRequests(rate.retryAfterSec);
  if (!requireBearer(req)) return unauthorized();
  try {
    return ok(await projectService.list());
  } catch (e) {
    return handleServiceError(e);
  }
}
