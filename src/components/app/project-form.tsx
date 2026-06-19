'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { IconPicker } from '@/components/ui/icon-picker';
import { createProject } from '@/app/_actions/projects';
import { PROJECT_COLORS, suggestKey } from '@/lib/colors';
import { isValidProjectKey } from '@/lib/domain';

export function ProjectForm({
  workspaceId,
  onClose,
}: {
  workspaceId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [key, setKey] = useState('');
  const [emoji, setEmoji] = useState('🚀');
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [shortDesc, setShortDesc] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = keyTouched ? key : suggestKey(name);
  const canSubmit = name.trim().length > 0 && isValidProjectKey(effectiveKey);

  const onName = (v: string) => {
    setName(v);
    if (!keyTouched) setKey(suggestKey(v));
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createProject({
        name: name.trim(),
        key: effectiveKey,
        emoji,
        color,
        shortDesc: shortDesc.trim() || null,
        statusNote: statusNote.trim() || null,
        workspaceId,
      });
      router.push(`/app/p/${project.key}`);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create project');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={submit} disabled={!canSubmit || busy}>
            Create project
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field" style={{ flex: 'none' }}>
          <label>Icon</label>
          <IconPicker
            value={emoji}
            onPick={(p) => p.value !== undefined && setEmoji(p.value)}
            triggerClass="emoji-solo"
            triggerSize={22}
            showColor={false}
          />
        </div>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => onName(e.target.value)} placeholder="Aurora API" autoFocus />
        </div>
        <div className="field" style={{ flex: '0 0 110px' }}>
          <label>Key</label>
          <input
            className="key-input"
            value={effectiveKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value.toUpperCase());
            }}
            placeholder="AUR"
            maxLength={10}
          />
        </div>
      </div>

      <div className="field">
        <label>Color</label>
        <div className="color-grid">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="color-pick"
              data-on={c === color ? '' : undefined}
              style={{ background: c, color: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label>Short description</label>
        <input
          value={shortDesc}
          onChange={(e) => setShortDesc(e.target.value)}
          placeholder="One line about this project"
        />
      </div>

      <div className="field">
        <label>Status note</label>
        <input
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          placeholder="Where is this project right now?"
        />
      </div>

      {error && <p className="login-err">{error}</p>}
    </Modal>
  );
}
