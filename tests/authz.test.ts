import { describe, test, expect, vi, beforeEach } from 'vitest';
import { can, type Action, type Role } from '@/server/auth/ctx';

/**
 * Permission matrix (authorization-design.md §5). `can()` is pure — no DB — so
 * we assert the whole grid directly. Reads are deliberately NOT actions (read
 * permission is tenant membership, checked at the scope layer), so the matrix
 * is mutations + admin ops only.
 */
describe('can(role, action) — RBAC matrix', () => {
  // Expected allow-set per role, transcribed from the design doc §5.
  const EXPECT: Record<Role, Action[]> = {
    owner: [
      'workspace:update',
      'workspace:delete',
      'workspace:manage_plan',
      'member:invite',
      'member:update_role',
      'member:remove',
      'billing:manage',
      'project:create',
      'project:update',
      'project:archive',
      'project:delete',
      'task:create',
      'task:update',
      'task:delete',
      'task:assign',
      'milestone:create',
      'milestone:update',
      'module:create',
      'module:update',
      'comment:create',
      'comment:delete',
      'apikey:create',
      'apikey:revoke',
    ],
    admin: [
      'workspace:update',
      'member:invite',
      'member:update_role',
      'member:remove',
      'project:create',
      'project:update',
      'project:archive',
      'project:delete',
      'task:create',
      'task:update',
      'task:delete',
      'task:assign',
      'milestone:create',
      'milestone:update',
      'module:create',
      'module:update',
      'comment:create',
      'comment:delete',
      'apikey:create',
      'apikey:revoke',
    ],
    member: [
      'project:create',
      'project:update',
      'project:archive',
      'task:create',
      'task:update',
      'task:delete',
      'task:assign',
      'milestone:create',
      'milestone:update',
      'module:create',
      'module:update',
      'comment:create',
      'apikey:create',
      'apikey:revoke',
    ],
    viewer: [],
  };

  const ALL_ACTIONS = EXPECT.owner; // owner allows everything → full action list

  for (const role of Object.keys(EXPECT) as Role[]) {
    const allowed = new Set(EXPECT[role]);
    for (const action of ALL_ACTIONS) {
      const want = allowed.has(action);
      test(`${role} ${want ? 'CAN' : 'CANNOT'} ${action}`, () => {
        expect(can(role, action)).toBe(want);
      });
    }
  }

  test('owner is a superset of admin is a superset of member', () => {
    for (const action of EXPECT.member) expect(can('admin', action)).toBe(true);
    for (const action of EXPECT.admin) expect(can('owner', action)).toBe(true);
  });

  test('viewer is denied every mutation (deny-by-default)', () => {
    for (const action of ALL_ACTIONS) expect(can('viewer', action)).toBe(false);
  });

  test('owner-only actions are denied to admin/member/viewer', () => {
    const ownerOnly: Action[] = ['workspace:delete', 'workspace:manage_plan', 'billing:manage'];
    for (const action of ownerOnly) {
      expect(can('owner', action)).toBe(true);
      expect(can('admin', action)).toBe(false);
      expect(can('member', action)).toBe(false);
      expect(can('viewer', action)).toBe(false);
    }
  });
});

/**
 * Ctx resolver invariants (authorization-design.md §7). We mock the seams
 * (session, active workspace, membership lookup) and assert the resolver throws
 * unauthorized for the !member path and builds a correct Ctx on the happy path.
 */
const { requireSession, resolveActiveWorkspace, roleOf } = vi.hoisted(() => ({
  requireSession: vi.fn(),
  resolveActiveWorkspace: vi.fn(),
  roleOf: vi.fn(),
}));

vi.mock('@/server/auth/require-session', () => ({ requireSession }));
vi.mock('@/server/active-workspace', () => ({ resolveActiveWorkspace }));
vi.mock('@/server/services', () => ({
  memberService: { roleOf },
  workspaceService: { getDefault: vi.fn() },
}));

const USER = '11111111-1111-1111-1111-111111111111';
const WS = '22222222-2222-2222-2222-222222222222';

describe('ctxFromSession — resolver invariants', () => {
  beforeEach(() => {
    requireSession.mockReset();
    resolveActiveWorkspace.mockReset();
    roleOf.mockReset();
  });

  test('happy path: builds { userId, workspaceId, role } from membership', async () => {
    requireSession.mockResolvedValue(USER);
    resolveActiveWorkspace.mockResolvedValue({ active: { id: WS }, role: 'member' });
    roleOf.mockResolvedValue('member');

    const { ctxFromSession } = await import('@/server/auth/resolve-ctx');
    const ctx = await ctxFromSession();
    expect(ctx).toEqual({ userId: USER, workspaceId: WS, role: 'member' });
    // role comes from a server-side lookup, never from the request/cookie.
    expect(roleOf).toHaveBeenCalledWith(USER, WS);
  });

  test('no active membership → unauthorized', async () => {
    requireSession.mockResolvedValue(USER);
    resolveActiveWorkspace.mockResolvedValue({ active: null, role: null });

    const { ctxFromSession } = await import('@/server/auth/resolve-ctx');
    await expect(ctxFromSession()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  test('active workspace but caller is not a member → unauthorized', async () => {
    requireSession.mockResolvedValue(USER);
    resolveActiveWorkspace.mockResolvedValue({ active: { id: WS }, role: null });
    roleOf.mockResolvedValue(null);

    const { ctxFromSession } = await import('@/server/auth/resolve-ctx');
    await expect(ctxFromSession()).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
