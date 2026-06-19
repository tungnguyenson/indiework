'use client';

/**
 * Standalone full-page task view (2-column, Linear-style). Reached from the
 * inspector panel's "open full page" link. Reuses the same hook + sections as
 * the panel; the only differences are layout (a centered two-column grid with a
 * properties rail) and navigation — related tasks open as full pages here
 * (`router.push`), not as peek overlays.
 */
import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TaskDetail } from '@/app/_actions/queries';
import type { OpenableTask } from '@/lib/task-nav';
import { taskFullPath, projectPathForRef } from '@/lib/task-nav';
import { parseRef } from '@/lib/domain';
import { RefTag } from '@/components/ui/interactive';
import { Ic } from '@/components/ui/icons';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { useTaskDetail } from './task-detail/use-task-detail';
import { TitleEditor, StatusNote, Attachments } from './task-detail/parts';
import { ParentLink, TaskProperties, TaskSubtasks, TaskActivity, DeleteControl } from './task-detail/sections';

export function TaskPageView({ taskRef, initialDetail }: { taskRef: string; initialDetail: TaskDetail }) {
  const router = useRouter();
  const { detail, missing, patch, saveStatusNote, addComment, editComment, addChild, toggleChild, remove, reload } = useTaskDetail({
    taskRef,
    taskId: null,
    initialDetail,
  });

  // Related tasks (parent / sub-tasks) open as full pages too, not peek overlays.
  const openFull = useCallback(
    (t: OpenableTask) => {
      const path = t.ref ? taskFullPath(t.ref, t.title) : null;
      if (path) router.push(path);
    },
    [router],
  );

  const projectPath = projectPathForRef(taskRef);
  const projectKey = parseRef(taskRef)?.key ?? null;

  if (missing) {
    return (
      <div className="task-page">
        <header className="tp-bar">
          {projectPath && (
            <Link className="tp-back" href={projectPath} aria-label="Back to project">
              <Ic.arrowLeft size={17} />
            </Link>
          )}
        </header>
        <div className="tp-empty">This task no longer exists.</div>
      </div>
    );
  }

  if (!detail) return <div className="task-page" aria-busy />;

  const { task, displayRef, parent, comments, attachments } = detail;
  const pending = task.status === 'pending';

  return (
    <article className="task-page">
      <header className="tp-bar">
        {projectPath && (
          <Link className="tp-back" href={projectPath} aria-label="Back to project">
            <Ic.arrowLeft size={17} />
          </Link>
        )}
        <nav className="tp-crumbs" aria-label="Breadcrumb">
          {projectPath && projectKey && (
            <Link className="tp-crumb" href={projectPath}>
              {projectKey}
            </Link>
          )}
          {parent?.ref && (
            <>
              <Ic.chevronRight size={13} className="tp-crumb-sep" />
              <button className="tp-crumb" type="button" onClick={() => openFull(parent)}>
                {parent.ref}
              </button>
            </>
          )}
          {displayRef && (
            <>
              <Ic.chevronRight size={13} className="tp-crumb-sep" />
              <RefTag value={displayRef} />
            </>
          )}
        </nav>
      </header>

      <div className="tp-grid">
        <main className="tp-main">
          <ParentLink parent={parent} onOpenTask={openFull} />

          <div className="dp-check-title">
            <TitleEditor key={task.id} value={task.title} onSave={(title) => patch({ title })} />
          </div>

          <StatusNote key={`note-${task.id}`} value={task.statusNote ?? ''} pending={pending} onSave={saveStatusNote} />

          <p className="dp-section-label">Description</p>
          <MarkdownEditor
            key={`desc-${task.id}`}
            value={task.description ?? ''}
            onSave={(d) => patch({ description: d })}
            placeholder="Add a description…"
          />

          <TaskSubtasks detail={detail} onOpenTask={openFull} toggleChild={toggleChild} addChild={addChild} />

          <Attachments taskId={task.id} items={attachments} onChanged={reload} />

          <TaskActivity comments={comments} addComment={addComment} editComment={editComment} />
        </main>

        <aside className="tp-side">
          <p className="dp-section-label tp-side-label">Properties</p>
          <TaskProperties detail={detail} patch={patch} layout="rail" />
          <div className="tp-side-foot">
            <DeleteControl
              onDelete={async () => {
                await remove();
                router.push(projectPath ?? '/app');
              }}
            />
          </div>
        </aside>
      </div>
    </article>
  );
}
