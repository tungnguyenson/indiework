'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiKeyPublic } from '@/server/services';
import { API_KEY_SCOPE, type ApiKeyScope } from '@/lib/domain';
import { fmtDate } from '@/lib/dates';
import { updateWorkspace } from '@/app/_actions/workspace';
import { createApiKey, revokeApiKey } from '@/app/_actions/apikeys';
import { Ic } from '@/components/ui/icons';
import { UI_FONTS } from '@/lib/fonts';
import { useUiFont } from '@/lib/use-ui-font';
import { commitOnEnter } from '@/lib/inline-edit';

interface Workspace {
  id: string;
  name: string;
  emoji: string | null;
  tagline: string | null;
}

type SettingsSection = 'appearance' | 'api';

/** Neutral English default for the font preview; users can type their own
 *  (Vietnamese, currency, anything) to test a face. */
const FONT_SAMPLE_DEFAULT = 'Plan, build & ship — $12,840';

const SECTIONS: { id: SettingsSection; label: string; icon: keyof typeof Ic }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'type' },
  { id: 'api', label: 'API keys', icon: 'key' },
];

/** App-wide settings: appearance + API keys. Workspace identity lives on its
 *  own screen ({@link WorkspaceSettingsScreen}) reached from the switcher. */
export function SettingsScreen({
  apiKeys,
  initialSection = 'appearance',
}: {
  apiKeys: ApiKeyPublic[];
  initialSection?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  return (
    <div className="settings">
      <nav className="settings-nav">
        <div className="settings-navlabel">App settings</div>
        {SECTIONS.map(({ id, label, icon }) => {
          const Icon = Ic[icon];
          return (
            <button
              key={id}
              className="settings-navitem"
              data-active={section === id ? '' : undefined}
              onClick={() => setSection(id)}
              type="button"
            >
              <Icon size={16} /> {label}
            </button>
          );
        })}
      </nav>
      <div className="settings-main">
        {section === 'appearance' && <AppearancePane />}
        {section === 'api' && <ApiKeysPane apiKeys={apiKeys} />}
      </div>
    </div>
  );
}

function AppearancePane() {
  const [uiFont, setUiFont] = useUiFont();
  const [preview, setPreview] = useState('');
  const sample = preview.trim() ? preview : FONT_SAMPLE_DEFAULT;
  return (
    <div className="settings-pane">
      <h1 className="settings-h">Appearance</h1>
      <p className="settings-sub">
        Choose the typeface IndieWork uses across the app. Every option supports Vietnamese and
        the wider Latin range, so accented characters render cleanly. Type below to preview your
        own text in each face.
      </p>
      <input
        className="set-input font-preview-input"
        value={preview}
        onChange={(e) => setPreview(e.target.value)}
        placeholder={FONT_SAMPLE_DEFAULT}
        aria-label="Preview text"
        spellCheck={false}
      />
      <div className="font-pick">
        {UI_FONTS.map((f) => {
          const active = uiFont === f.id;
          return (
            <button
              key={f.id}
              className="font-opt"
              type="button"
              data-active={active ? '' : undefined}
              onClick={() => setUiFont(f.id)}
            >
              <div className="font-opt-top">
                <span className="font-opt-name" style={{ fontFamily: f.stack }}>
                  {f.label}
                </span>
                {f.tag && <span className="font-opt-tag">{f.tag}</span>}
                <span className="font-opt-check">{active && <Ic.check size={14} strokeWidth={2.6} />}</span>
              </div>
              <div className="font-opt-sample" style={{ fontFamily: f.stack }}>
                {sample}
              </div>
              <div className="font-opt-note">{f.note}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Workspace identity — its own focused screen (route: /app/settings/workspace),
 *  separate from app-wide settings. */
export function WorkspaceSettingsScreen({ workspace }: { workspace: Workspace | null }) {
  const router = useRouter();
  if (!workspace) {
    return (
      <div className="settings settings-solo">
        <div className="settings-main">
          <div className="settings-pane">
            <h1 className="settings-h">Workspace</h1>
            <p className="settings-sub">No workspace.</p>
          </div>
        </div>
      </div>
    );
  }
  const save = async (patch: Parameters<typeof updateWorkspace>[1]) => {
    await updateWorkspace(workspace.id, patch);
    router.refresh();
  };
  return (
    <div className="settings settings-solo">
      <div className="settings-main">
        <div className="settings-pane">
          <h1 className="settings-h">Workspace</h1>
          <p className="settings-sub">Your workspace identity — the name shows at the top of the sidebar.</p>
          <div className="set-card">
            <div className="set-field">
              <label>Name</label>
              <input
                className="set-input"
                defaultValue={workspace.name}
                onKeyDown={commitOnEnter}
                onBlur={(e) => e.target.value.trim() && e.target.value !== workspace.name && save({ name: e.target.value.trim() })}
              />
            </div>
            <div className="set-field">
              <label>Tagline</label>
              <input
                className="set-input"
                defaultValue={workspace.tagline ?? ''}
                onKeyDown={commitOnEnter}
                onBlur={(e) => e.target.value !== (workspace.tagline ?? '') && save({ tagline: e.target.value || null })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiKeysPane({ apiKeys }: { apiKeys: ApiKeyPublic[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiKeyScope>('read-write');
  const [busy, setBusy] = useState(false);
  const [freshSecret, setFreshSecret] = useState<{ id: string; secret: string } | null>(null);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { key, secret } = await createApiKey(name.trim(), scope);
      setFreshSecret({ id: key.id, secret });
      setName('');
      setCreating(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-pane">
      <div className="settings-head-row">
        <div>
          <h1 className="settings-h">API keys</h1>
          <p className="settings-sub">
            Keys let scripts, the CLI, and webhooks talk to IndieWork. Treat them like passwords.
          </p>
        </div>
        {!creating && (
          <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
            <Ic.plus size={15} /> Create key
          </button>
        )}
      </div>

      {creating && (
        <div className="ak-create">
          <div className="ak-create-grid">
            <input
              className="ak-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What's this key for? (e.g. Local CLI)"
              autoFocus
            />
            <div className="ak-scope-pick">
              {API_KEY_SCOPE.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ak-scope-btn"
                  data-on={scope === s ? '' : undefined}
                  onClick={() => setScope(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="ak-create-foot">
            <button className="btn" type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" type="button" onClick={submit} disabled={!name.trim() || busy}>
              Create key
            </button>
          </div>
        </div>
      )}

      {apiKeys.length === 0 && !creating ? (
        <div className="ak-empty">
          <Ic.key size={26} />
          <p>No keys yet. Create one to drive IndieWork from a script, the CLI, or a webhook.</p>
        </div>
      ) : (
        <div className="ak-list">
          {apiKeys.map((k) => {
            const isNew = freshSecret?.id === k.id;
            return (
              <div className="ak-row" key={k.id} data-new={isNew ? '' : undefined}>
                <span className="ak-icon">
                  <Ic.key size={18} />
                </span>
                <div className="ak-main">
                  <div className="ak-line">
                    <span className="ak-name">{k.name}</span>
                    <span className="ak-scope" data-scope={k.scope}>
                      {k.scope}
                    </span>
                    {isNew && <span className="ak-new-badge">Copy it now — shown once</span>}
                  </div>
                  <span className="ak-secret">{isNew ? freshSecret!.secret : k.masked}</span>
                  <span className="ak-meta">
                    Created {fmtDate(k.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {k.lastUsedAt ? ` · Last used ${fmtDate(k.lastUsedAt, { month: 'short', day: 'numeric' })}` : ' · Never used'}
                  </span>
                </div>
                <div className="ak-actions">
                  <button
                    className="icon-btn"
                    type="button"
                    title="Copy"
                    onClick={() => navigator.clipboard?.writeText(isNew ? freshSecret!.secret : k.masked)}
                  >
                    <Ic.copy size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    data-danger=""
                    type="button"
                    title="Revoke"
                    onClick={async () => {
                      await revokeApiKey(k.id);
                      router.refresh();
                    }}
                  >
                    <Ic.trash size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
