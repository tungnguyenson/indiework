'use client';

import { startTransition, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import type { TaskDto } from '@/server/services';
import { applyTaskOptimistic } from '@/lib/optimistic';
import { useTaskNav, useOpenTaskKey, taskKey } from '@/lib/task-nav';
import { createTask, toggleTaskDone, assignTaskToProject } from '@/app/_actions/tasks';
import { QuickCapture } from './quick-capture';
import { CircleCheck } from '@/components/ui/interactive';
import { Popover, OptionList } from '@/components/ui/popover';
import { Ic } from '@/components/ui/icons';
import { EntityIcon } from '@/components/ui/bits';

interface ProjectOpt {
  id: string;
  key: string;
  name: string;
  emoji: string | null;
  color: string | null;
}

export function InboxScreen({ tasks, projects }: { tasks: TaskDto[]; projects: ProjectOpt[] }) {
  const router = useRouter();
  const { openTask } = useTaskNav();
  const openKey = useOpenTaskKey();
  const [optimisticTasks, applyOptimistic] = useOptimistic(tasks, applyTaskOptimistic);

  const add = async (title: string) => {
    // Create needs a server-generated id, so it stays non-optimistic (see ADR 0002).
    await createTask({ title });
    router.refresh();
  };
  const toggle = (id: string) => {
    startTransition(async () => {
      applyOptimistic({ kind: 'toggleDone', id });
      await toggleTaskDone(id);
    });
  };
  const assign = (id: string, projectId: string) => {
    // Assigning to a project removes the task from the Inbox — drop it now.
    startTransition(async () => {
      applyOptimistic({ kind: 'remove', ids: [id] });
      await assignTaskToProject(id, projectId);
    });
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <span className="topbar-emoji">📥</span>
          <h1>Inbox</h1>
        </div>
      </div>
      <QuickCapture placeholder="Dump an idea into Inbox…" onAdd={add} />

      <div className="scroll-body">
        {optimisticTasks.length === 0 ? (
          <div className="empty">
            <div className="empty-emoji">📥</div>
            <h3>Inbox zero</h3>
            <p>Nothing to triage. Type an idea above, or press c anywhere.</p>
          </div>
        ) : (
          optimisticTasks.map((t) => (
            <div
              key={t.id}
              className="task-row"
              data-done={t.done ? '' : undefined}
              data-selected={openKey === taskKey(t) ? '' : undefined}
              onClick={() => openTask(t)}
              style={{ paddingLeft: 12 }}
            >
              <CircleCheck done={t.done} status={t.status} onToggle={() => toggle(t.id)} />
              <div className="task-main">
                <div className="task-line">
                  <span className="task-title">{t.title}</span>
                </div>
              </div>
              <div className="task-meta task-reveal" onClick={(e) => e.stopPropagation()}>
                <Popover
                  align="right"
                  width={220}
                  trigger={
                    <button className="meta-tag" type="button" style={{ cursor: 'pointer' }}>
                      <Ic.arrowRight size={13} /> Assign to project
                    </button>
                  }
                >
                  {(close) => (
                    <>
                      <div className="pop-label">Move to project</div>
                      <OptionList
                        options={projects.map((p) => ({ id: p.id, label: p.name }))}
                        onPick={(id) => {
                          assign(t.id, id);
                          close();
                        }}
                        renderOpt={(o) => {
                          const p = projects.find((x) => x.id === o.id);
                          return (
                            <>
                              <span className="nav-emoji" style={{ width: 18 }}>
                                <EntityIcon icon={p?.emoji} color={p?.color} size={13} />
                              </span>
                              {o.label}
                            </>
                          );
                        }}
                      />
                    </>
                  )}
                </Popover>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
