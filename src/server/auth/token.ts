/**
 * Bearer-token auth for the REST API and MCP server.
 * Resolves to an agent user via managed api_keys, with back-compat for the
 * static `.ENV` API_TOKEN (maps to the `default-agent` user).
 *
 * @deprecated The static API_TOKEN path — remove before any multi-tenant step.
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '@/server/env';
import { db, schema } from '@/server/db';
import { userService } from '@/server/services/user.service';
import { workspaceService } from '@/server/services/workspace.service';
import type { ApiKeyScope, CommentSource } from '@/lib/domain';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function extractBearer(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

/**
 * Bearer principal: the user the token authenticates AS, the workspace the
 * token is bound to, and its capability scope. `workspaceId` may be null when a
 * legacy key has no workspace — the caller falls back to the default workspace.
 */
export interface BearerPrincipal {
  userId: string;
  workspaceId: string | null;
  scope: ApiKeyScope;
}

/** Look up an api_key hash → the owning agent's userId, workspace, and scope. */
async function resolveApiKeyPrincipal(token: string): Promise<BearerPrincipal | null> {
  const hash = sha256(token);
  const [row] = await db
    .select({
      id: schema.apiKeys.id,
      userId: schema.apiKeys.userId,
      workspaceId: schema.apiKeys.workspaceId,
      scope: schema.apiKeys.scope,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.hash, hash))
    .limit(1);
  if (!row?.userId) return null;
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id));
  return { userId: row.userId, workspaceId: row.workspaceId, scope: row.scope };
}

/**
 * Resolve a Bearer token to its principal (userId + workspace + scope).
 * Returns null when the token is missing or invalid.
 */
export async function resolveBearerPrincipal(req: Request): Promise<BearerPrincipal | null> {
  const token = extractBearer(req.headers.get('authorization'));
  if (!token) return null;

  const fromKey = await resolveApiKeyPrincipal(token);
  if (fromKey) return fromKey;

  // Back-compat: static API_TOKEN → default-agent in the default workspace.
  // TODO(IW-58): remove static token.
  if (constantTimeEqual(token, env.API_TOKEN)) {
    try {
      const userId = await userService.getDefaultAgentId();
      const workspaceId = (await workspaceService.getDefault())?.id ?? null;
      return { userId, workspaceId, scope: 'read-write' };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Resolve a Bearer token to the authenticated agent's userId.
 * Returns null when the token is missing or invalid.
 */
export async function resolveBearer(req: Request): Promise<string | null> {
  return (await resolveBearerPrincipal(req))?.userId ?? null;
}

/** Guard a Request; returns the agent userId when the token is valid. */
export async function requireBearer(req: Request): Promise<string | null> {
  return resolveBearer(req);
}

/** @deprecated Use resolveBearer — kept for tests that only check the static token. */
export function bearerOk(authHeader: string | null | undefined): boolean {
  const token = extractBearer(authHeader);
  if (!token) return false;
  return constantTimeEqual(token, env.API_TOKEN);
}

export const API_COMMENT_SOURCE: CommentSource = 'api';
export const MCP_COMMENT_SOURCE: CommentSource = 'agent';
