'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { createWorkspace } from '@/app/_actions/workspace';

export function WorkspaceForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('◈');
  const [tagline, setTagline] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createWorkspace({ name: name.trim(), emoji, tagline: tagline.trim() || null });
      // New workspace is now active and empty — land on the app home, not a
      // project page that belongs to the previous workspace.
      router.push('/app');
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New workspace"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={submit} disabled={busy || !name.trim()}>
            Create
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field" style={{ flex: 'none' }}>
          <label>Icon</label>
          <EmojiPicker value={emoji} onPick={setEmoji} triggerClass="emoji-solo" />
        </div>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Side projects" autoFocus />
        </div>
      </div>
      <div className="field">
        <label>Tagline</label>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="what this workspace is for"
        />
      </div>
    </Modal>
  );
}
