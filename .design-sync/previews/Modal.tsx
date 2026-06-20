// Modal — a centered dialog over a scrim (Esc / scrim-click close). Composed from a
// title, a body of your own content, and an optional footer of actions.
import { Modal } from 'indiework';

/** The canonical form dialog — titled, a couple of fields, Cancel / primary action. */
export function WorkspaceForm() {
  return (
    <Modal
      title="New workspace"
      onClose={() => {}}
      footer={
        <>
          <button className="btn" type="button">Cancel</button>
          <button className="btn btn-primary" type="button">Create</button>
        </>
      }
    >
      <div className="field">
        <label>Name</label>
        <input defaultValue="Side projects" />
      </div>
      <div className="field">
        <label>Tagline</label>
        <input placeholder="what this workspace is for" />
      </div>
    </Modal>
  );
}

/** A destructive confirm — same shell, body is a single explanatory line. */
export function ConfirmDelete() {
  return (
    <Modal
      title="Delete “Aurora API”?"
      onClose={() => {}}
      footer={
        <>
          <button className="btn" type="button">Cancel</button>
          <button className="btn btn-primary" type="button">Delete project</button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)' }}>
        This permanently removes the project and its 23 tasks. This can’t be undone.
      </p>
    </Modal>
  );
}
