'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { loadSearchIndex, type SearchIndex } from '@/app/_actions/queries';
import { taskPath } from '@/lib/task-nav';
import { Ic } from '@/components/ui/icons';

type Result =
  | { kind: 'project'; id: string; key: string; title: string; sub: string; tag: string }
  | { kind: 'task'; id: string; title: string; sub: string; ref: string | null; href: string };

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSearchIndex().then(setIndex);
    inputRef.current?.focus();
  }, []);

  const results = useMemo<Result[]>(() => {
    if (!index) return [];
    const query = q.trim().toLowerCase();
    const keyOf = new Map(index.projects.map((p) => [p.id, p.key]));
    const projects = index.projects
      .filter((p) => !query || p.name.toLowerCase().includes(query) || p.key.toLowerCase().includes(query))
      .slice(0, 6)
      .map<Result>((p) => ({
        kind: 'project',
        id: p.id,
        key: p.key,
        title: p.name,
        sub: p.shortDesc ?? '',
        tag: p.key,
      }));
    const tasks = index.tasks
      .filter((t) => !query || t.title.toLowerCase().includes(query) || (t.ref ?? '').toLowerCase().includes(query))
      .slice(0, 8)
      .map<Result>((t) => {
        const key = t.projectId ? keyOf.get(t.projectId) : null;
        const href = t.ref ? taskPath(t.ref, t.title) ?? `/app/p/${key}?task=${t.id}` : `/app/inbox?task=${t.id}`;
        return { kind: 'task', id: t.id, title: t.title, sub: key ?? 'Inbox', ref: t.ref, href };
      });
    return [...projects, ...tasks];
  }, [index, q]);

  useEffect(() => setActive(0), [q]);

  const open = (r: Result) => {
    if (r.kind === 'project') router.push(`/app/p/${r.key}`);
    else router.push(r.href);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) open(results[active]);
    }
  };

  const projectResults = results.filter((r) => r.kind === 'project');
  const taskResults = results.filter((r) => r.kind === 'task');
  let rowIndex = -1;

  return createPortal(
    <div className="search-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-modal" onKeyDown={onKey}>
        <div className="search-head">
          <Ic.search size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects and tasks…"
          />
          <span className="search-esc">Esc</span>
        </div>
        <div className="search-body">
          {results.length === 0 && <div className="search-empty">No matches.</div>}
          {projectResults.length > 0 && <div className="search-group">Projects</div>}
          {projectResults.map((r) => {
            rowIndex++;
            const i = rowIndex;
            return (
              <button
                key={`p-${r.id}`}
                className="search-row"
                data-active={i === active ? '' : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => open(r)}
              >
                <span className="search-emoji">{(r as { tag: string }).tag.slice(0, 1)}</span>
                <span className="search-text">
                  <span className="search-title">{r.title}</span>
                  {r.sub && <span className="search-sub">{r.sub}</span>}
                </span>
                {r.kind === 'project' && <span className="search-tag">{r.tag}</span>}
              </button>
            );
          })}
          {taskResults.length > 0 && <div className="search-group">Tasks</div>}
          {taskResults.map((r) => {
            rowIndex++;
            const i = rowIndex;
            return (
              <button
                key={`t-${r.id}`}
                className="search-row"
                data-active={i === active ? '' : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => open(r)}
              >
                <span className="search-icon">
                  <Ic.check size={16} />
                </span>
                <span className="search-text">
                  <span className="search-title">{r.title}</span>
                  <span className="search-sub">{r.sub}</span>
                </span>
                {r.kind === 'task' && r.ref && <span className="search-ref">{r.ref}</span>}
              </button>
            );
          })}
        </div>
        <div className="search-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
