'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ShellData } from '@/server/load';
import { PROJECT_STATUS, PROJECT_STATUS_LABEL, type ProjectStatus } from '@/lib/domain';
import { setActiveWorkspace } from '@/app/_actions/workspace';
import { updateProject } from '@/app/_actions/projects';
import { BrandMark } from '@/components/ui/brand';
import { Popover } from '@/components/ui/popover';
import { Ic } from '@/components/ui/icons';

type Projects = ShellData['projects'];

const DEFAULT_COLLAPSED: ReadonlySet<string> = new Set(['done', 'backlog', 'cancelled']);

export function Sidebar({
  shell,
  onNewProject,
  onNewWorkspace,
  onOpenSearch,
  onCollapse,
}: {
  shell: ShellData;
  onNewProject: () => void;
  onNewWorkspace: () => void;
  onOpenSearch: () => void;
  onCollapse?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspaces, activeWorkspace, projects, inboxCount } = shell;

  const switchWorkspace = async (id: string) => {
    if (id === activeWorkspace?.id) return;
    await setActiveWorkspace(id);
    // Leaving a project page: that project may not live in the new workspace,
    // so land on the app home instead of staring at an out-of-scope project.
    if (pathname.startsWith('/app/p/')) router.push('/app');
    else router.refresh();
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(DEFAULT_COLLAPSED));

  const groups = useMemo(() => buildGroups(projects), [projects]);

  const togglePin = async (id: string, pinned: boolean) => {
    await updateProject(id, { pinned: !pinned });
    router.refresh();
  };

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <aside className="sidebar">
      {onCollapse && (
        <button className="sb-collapse" type="button" onClick={onCollapse} title="Collapse sidebar" aria-label="Collapse sidebar">
          <Ic.arrowLeft size={16} />
        </button>
      )}
      {/* workspace switcher */}
      <Popover
        align="left"
        width={232}
        className="ws-pop-wrap"
        trigger={
          <button className="ws-switch" type="button">
            <BrandMark size={30} className="ws-mark" />
            <span className="ws-meta">
              <b>{activeWorkspace?.name ?? 'Workspace'}</b>
              <small>{activeWorkspace?.tagline ?? 'personal projects'}</small>
            </span>
            <span className="ws-caret">
              <Ic.chevronDown size={15} />
            </span>
          </button>
        }
      >
        {(close) => (
          <div className="ws-pop">
            {workspaces.map((w) => (
              <button
                key={w.id}
                className="ws-opt"
                data-active={w.id === activeWorkspace?.id ? '' : undefined}
                onClick={() => {
                  close();
                  void switchWorkspace(w.id);
                }}
                type="button"
              >
                <span className="ws-opt-text">
                  <b>{w.name}</b>
                  <small>{w.tagline}</small>
                </span>
              </button>
            ))}
            <div className="ws-pop-divider" />
            <button
              className="ws-action"
              type="button"
              onClick={() => {
                close();
                onNewWorkspace();
              }}
            >
              <Ic.plus size={15} /> New workspace
            </button>
            <Link className="ws-action" href="/app/settings/workspace" onClick={close}>
              <Ic.settings size={15} /> Workspace settings
            </Link>
          </div>
        )}
      </Popover>

      {/* search */}
      <button className="sb-search" type="button" onClick={onOpenSearch}>
        <Ic.search size={15} />
        <span>Search…</span>
        <kbd>⌘K</kbd>
      </button>

      {/* inbox */}
      <Link className="nav-item" href="/app/inbox" data-active={pathname === '/app/inbox' ? '' : undefined}>
        <span className="nav-icon">
          <Ic.inbox size={16} />
        </span>
        <span className="nav-label">Inbox</span>
        {inboxCount > 0 && <span className="nav-badge">{inboxCount}</span>}
      </Link>

      {/* projects */}
      <div className="sb-section">Projects</div>
      <div className="sb-scroll">
        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          return (
            <div className="sb-group" key={g.key}>
              <button
                className="sb-grouplabel"
                data-collapsed={isCollapsed ? '' : undefined}
                onClick={() => toggle(g.key)}
                type="button"
              >
                <span className="sb-groupcaret">
                  <Ic.chevronDown size={12} />
                </span>
                {g.key === 'pinned' ? (
                  <Ic.pin size={12} />
                ) : (
                  <span className="dot" style={{ background: `var(--st-${g.statusKey})` }} />
                )}
                <span className="sb-grouptxt">{g.label}</span>
                <span className="sb-groupcount">{g.items.length}</span>
              </button>
              {!isCollapsed && (
                <div className="sb-grouprows">
                  {g.items.map((p) => {
                    const href = `/app/p/${p.key}`;
                    return (
                      <div className="nav-item-wrap" key={p.id}>
                        <Link
                          className="nav-item"
                          href={href}
                          data-active={pathname.startsWith(href) ? '' : undefined}
                        >
                          <span className="nav-emoji">{p.emoji ?? '•'}</span>
                          <span className="nav-label">{p.name}</span>
                          {p.issues > 0 && (
                            <span className="nav-badge" data-muted="">
                              {p.issues}
                            </span>
                          )}
                        </Link>
                        <button
                          className="nav-pin"
                          type="button"
                          data-on={p.pinned ? '' : undefined}
                          title={p.pinned ? 'Unpin' : 'Pin'}
                          aria-label={p.pinned ? `Unpin ${p.name}` : `Pin ${p.name}`}
                          onClick={() => togglePin(p.id, p.pinned)}
                        >
                          <Ic.pin size={13} fill={p.pinned ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <button className="sb-viewall" type="button" onClick={onNewProject}>
          <Ic.plus size={15} /> New project
        </button>
        <Link className="sb-viewall" href="/app/all" data-active={pathname === '/app/all' ? '' : undefined}>
          <Ic.table size={15} /> All projects
        </Link>
      </div>

      {/* footer */}
      <div className="sb-foot">
        <Link
          className="sb-footbtn"
          href="/app/settings"
          data-active={pathname === '/app/settings' ? '' : undefined}
        >
          <Ic.settings size={16} /> Settings
        </Link>
      </div>
    </aside>
  );
}

type Group = { key: string; label: string; statusKey: string; items: Projects };

function buildGroups(projects: Projects): Group[] {
  const pinned = projects.filter((p) => p.pinned);
  const groups: Group[] = [];
  if (pinned.length) groups.push({ key: 'pinned', label: 'Pinned', statusKey: 'todo', items: pinned });

  // map project lifecycle status → the status palette key used for the dot.
  const dotKey: Record<ProjectStatus, string> = {
    active: 'in_progress',
    planned: 'todo',
    paused: 'blocked',
    done: 'done',
    backlog: 'backlog',
    cancelled: 'cancelled',
  };

  for (const status of PROJECT_STATUS) {
    const items = projects.filter((p) => !p.pinned && p.status === status);
    if (items.length) {
      groups.push({
        key: status,
        label: PROJECT_STATUS_LABEL[status],
        statusKey: dotKey[status],
        items,
      });
    }
  }
  return groups;
}
