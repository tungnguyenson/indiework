import type { Metadata } from 'next';
import { taskService, projectService } from '@/server/services';
import { InboxScreen } from '@/components/app/inbox';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Inbox' };

export default async function InboxPage() {
  const [tasks, projects] = await Promise.all([taskService.listInbox(), projectService.list()]);
  return <InboxScreen tasks={tasks} projects={projects} />;
}
