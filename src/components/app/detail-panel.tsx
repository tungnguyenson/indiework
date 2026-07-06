'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTaskNav, taskFullPath, taskCanonicalUrl } from '@/lib/task-nav';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { RefTag, CopyLinkButton } from '@/components/ui/interactive';
import { Ic } from '@/components/ui/icons';
import { useTaskDetail } from './task-detail/use-task-detail';
import { TitleEditor, StatusNote, Attachments } from './task-detail/parts';
import { ParentLink, TaskProperties, TaskSubtasks, TaskActivity, ConvertToTaskControl, DeleteControl } from './task-detail/sections';

/**
 * Slide-in inspector (1-column overlay). Shares its fetch/mutations (the hook)
 * and inner sections with the standalone full page; the panel adds only its
 * own chrome: a ref header with an "open full page" link, escape-to-close, and
 * a footer delete. Related-task clicks open a peek overlay (`openTask`).
 */
export function DetailPanel({
  taskRef,
  taskId,
  onClose,
}: {
  taskRef: string | null;
  taskId: string | null;
  onClose: () => void;
}) {
  const { openTask } = useTaskNav();
  const { detail, missing, loadError, patch, saveStatusNote, addComment, editComment, addChild, toggleChild, convertToTask, remove, reload } = useTaskDetail({
    taskRef,
    taskId,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (missing || loadError) {
    return (
      <section className="detail-panel">
        <div className="dp-head">
          <span className="ref-tag ref-big">{taskRef ?? 'Task'}</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Ic.close size={18} />
          </button>
        </div>
        <div className="dp-body">
          {missing ? (
            <p className="dp-section-label">This task no longer exists.</p>
          ) : (
            // A thrown fetch (most often a Server Action version-skew 404 from a
            // tab left open across a deploy) — the task likely still exists, so
            // offer a refresh instead of falsely claiming it was deleted.
            <div className="dp-loaderr">
              <p className="dp-section-label">Couldn’t load this task.</p>
              <p className="dp-loaderr-hint">The app may have updated. Refresh to continue.</p>
              <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
                Refresh
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="detail-panel" aria-busy>
        <div className="dp-head">
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Ic.close size={18} />
          </button>
        </div>
      </section>
    );
  }

  const { task, displayRef, parent, comments, attachments } = detail;
  const pending = task.status === 'pending';
  const fullPath = displayRef ? taskFullPath(displayRef, task.title) : null;

  return (
    <section className="detail-panel">
      <div className="dp-head">
        {displayRef ? <RefTag value={displayRef} big /> : <span className="ref-tag ref-big">Inbox</span>}
        <span className="spacer" />
        {fullPath && displayRef && (
          <CopyLinkButton getUrl={() => taskCanonicalUrl(window.location.origin, displayRef, task.title)} />
        )}
        {fullPath && (
          <Link className="icon-btn" href={fullPath} title="Open as full page" aria-label="Open as full page">
            <Ic.maximize size={16} />
          </Link>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Ic.close size={18} />
        </button>
      </div>

      <div className="dp-body">
        <ParentLink parent={parent} onOpenTask={openTask} />

        <div className="dp-check-title">
          <TitleEditor key={task.id} value={task.title} onSave={(title) => patch({ title })} />
        </div>

        <StatusNote key={`note-${task.id}`} value={task.statusNote ?? ''} pending={pending} onSave={saveStatusNote} />

        <TaskProperties detail={detail} patch={patch} />

        <p className="dp-section-label">Description</p>
        <MarkdownEditor
          key={`desc-${task.id}`}
          value={task.description ?? ''}
          onSave={(d) => patch({ description: d })}
          placeholder="Add a description…"
        />

        <TaskSubtasks detail={detail} onOpenTask={openTask} toggleChild={toggleChild} addChild={addChild} />

        <Attachments taskId={task.id} items={attachments} onChanged={reload} />

        <TaskActivity comments={comments} addComment={addComment} editComment={editComment} />
      </div>

      <div className="dp-foot">
        {/* Keyed per task: the panel never remounts on task switch, so without
            this the inline confirm would persist across switches and a stray
            confirm could fire against the newly-opened task. */}
        {task.parentId && (
          <ConvertToTaskControl
            key={`conv-${task.id}`}
            onConvert={async () => {
              await convertToTask();
            }}
          />
        )}
        <DeleteControl
          key={task.id}
          onDelete={async () => {
            if (await remove()) onClose();
          }}
        />
      </div>
    </section>
  );
}
