/**
 * Auth for REST routes that the web UI also hits (e.g. attachment download).
 * Accepts Bearer (REST/MCP) or a valid session cookie (browser).
 */
import { cookies } from 'next/headers';
import { resolveBearer } from '@/server/auth/token';
import { SESSION_COOKIE, parseSessionValue } from '@/server/auth/session';

export async function requireApiUser(req: Request): Promise<string | null> {
  const bearer = await resolveBearer(req);
  if (bearer) return bearer;

  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  const parsed = await parseSessionValue(value);
  return parsed?.userId ?? null;
}
