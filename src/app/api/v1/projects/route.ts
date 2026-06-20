import { projectService } from '@/server/services';
import { requireBearer } from '@/server/auth/token';
import { ok, unauthorized, handleServiceError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await requireBearer(req))) return unauthorized();
  try {
    return ok(await projectService.list());
  } catch (e) {
    return handleServiceError(e);
  }
}
