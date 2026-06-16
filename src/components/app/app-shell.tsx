'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ShellData } from '@/server/load';
import { useTaskNav, refFromPath } from '@/lib/task-nav';
import { Sidebar } from './sidebar';
import { DetailPanel } from './detail-panel';
import { ProjectForm } from './project-form';
import { WorkspaceForm } from './workspace-form';
import { CommandPalette } from './command-palette';
import { Ic } from '@/components/ui/icons';

export function AppShell({ shell, children }: { shell: ShellData; children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { closeTask } = useTaskNav();
  // The open task comes from a ref path (/app/p/IW/issue/IW-11/slug) for project
  // tasks, or the legacy ?task=<uuid> overlay for Inbox tasks (no ref yet).
  const taskRef = refFromPath(pathname)?.ref ?? null;
  const legacyTaskId = params.get('task');
  const detailKey = taskRef ?? legacyTaskId;

  const [width, setWidth] = useState(256);
  const [resizing, setResizing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // sidebar width + collapsed state persisted to localStorage (iw-*)
  useEffect(() => {
    const v = parseInt(localStorage.getItem('iw-sidebar-w') ?? '', 10);
    if (v >= 180 && v <= 440) setWidth(v);
    setCollapsed(localStorage.getItem('iw-sb-collapsed') === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('iw-sidebar-w', String(width));
  }, [width]);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('iw-sb-collapsed', next ? '1' : '0');
      return next;
    });
  }, []);

  // keyboard: ⌘K search, c quick-capture
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowSearch((s) => !s);
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/input|textarea/i.test(el.tagName) || el.isContentEditable);
      if (e.key === 'c' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('iw:focus-capture'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const left = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().left;
    const onMove = (ev: MouseEvent) => setWidth(Math.min(440, Math.max(180, ev.clientX - left)));
    const onUp = () => {
      setResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div
      className="app"
      data-detail={detailKey ? '' : undefined}
      data-resizing={resizing ? '' : undefined}
      data-sb-collapsed={collapsed ? '' : undefined}
      style={{ '--sidebar-w': `${collapsed ? 0 : width}px` } as React.CSSProperties}
    >
      <Sidebar
        shell={shell}
        onNewProject={() => setShowProject(true)}
        onNewWorkspace={() => setShowWorkspace(true)}
        onOpenSearch={() => setShowSearch(true)}
        onCollapse={toggleCollapsed}
      />
      {!collapsed && <div className="col-resizer" onMouseDown={startResize} title="Drag to resize" />}
      {collapsed && (
        <button className="sb-expand" type="button" onClick={toggleCollapsed} title="Expand sidebar" aria-label="Expand sidebar">
          <Ic.list size={18} />
        </button>
      )}

      <div className="main-col">{children}</div>

      {/* No key on the panel: switching issues re-fetches in place instead of
          remounting, so the slide-in animation only plays when opening from
          closed (not on every issue switch). */}
      {detailKey && <DetailPanel taskRef={taskRef} taskId={legacyTaskId} onClose={closeTask} />}

      {showProject && (
        <ProjectForm
          workspaceId={shell.activeWorkspace?.id ?? null}
          onClose={() => setShowProject(false)}
        />
      )}
      {showWorkspace && <WorkspaceForm onClose={() => setShowWorkspace(false)} />}
      {showSearch && <CommandPalette onClose={() => setShowSearch(false)} />}
    </div>
  );
}
