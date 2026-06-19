/** Shared `{ data, error }` envelope + error mapping for the REST API. */
import { ZodError } from 'zod';
import { ServiceError } from '@/server/services';

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ data, error: null }, { status });
}

export function fail(error: string, status: number): Response {
  return Response.json({ data: null, error }, { status });
}

export function unauthorized(): Response {
  return fail('Unauthorized', 401);
}

export function tooManyRequests(retryAfterSec: number): Response {
  return Response.json(
    { data: null, error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

export function handleServiceError(e: unknown): Response {
  if (e instanceof ZodError) {
    const msg = e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    return fail(msg, 400);
  }
  if (e instanceof ServiceError) {
    const status = e.code === 'not_found' ? 404 : e.code === 'conflict' ? 409 : 400;
    return fail(e.message, status);
  }
  if (e instanceof SyntaxError) return fail('Invalid JSON body', 400);
  console.error('[api] unexpected error:', e);
  return fail('Internal server error', 500);
}
