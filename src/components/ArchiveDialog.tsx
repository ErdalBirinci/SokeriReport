import { useEffect, useRef, useState } from 'react';
import type { ArchiveSummary } from '../lib/archive';
import { dateLong } from '../lib/format';
import { trapFocus } from '../lib/focusTrap';

interface Props {
  entries: ArchiveSummary[];
  defaultLabel: string;
  canSave: boolean;
  busy: boolean;
  notice: string | null;
  error: string | null;
  onSave: (label: string, passphrase: string) => void;
  onOpen: (id: string, passphrase: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function ArchiveDialog({
  entries,
  defaultLabel,
  canSave,
  busy,
  notice,
  error,
  onSave,
  onOpen,
  onDelete,
  onClose,
}: Props) {
  const [label, setLabel] = useState(defaultLabel);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  // Captured during render, before autoFocus moves focus into the dialog.
  const openerRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const node = modalRef.current;
    if (!node) return;
    return trapFocus(node, openerRef.current);
  }, []);

  const longEnough = passphrase.length >= 8;
  const matches = confirmation === passphrase;
  // Opening an existing report only needs the passphrase; saving a new one
  // needs both fields to match, because there is no recovery.
  const canSaveNow = canSave && longEnough && matches;

  return (
    <div className="print-modal-backdrop no-print">
      <div
        ref={modalRef}
        className="print-modal archive-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-title"
        aria-describedby="archive-intro"
      >
        <h2 id="archive-title">Encrypted local archive</h2>
        <p id="archive-intro">
          Reports are encrypted in this browser with AES-256-GCM and a passphrase-derived key. The
          passphrase and the data never leave this device. Clearing site data in your browser
          removes saved reports.
        </p>

        <div className="option-fields">
          <label className="option-field">
            <span>Label</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Review 25 Nov"
              autoFocus
            />
          </label>
          <label className="option-field">
            <span>Passphrase (at least 8 characters)</span>
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="option-field">
            <span>Repeat passphrase (needed to save)</span>
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              aria-invalid={confirmation.length > 0 && !matches}
            />
          </label>
        </div>

        <div className="archive-save-row">
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={!canSaveNow || busy}
            onClick={() => onSave(label, passphrase)}
          >
            Save current report
          </button>
          <span className="archive-hint">
            {longEnough && !matches
              ? 'The two passphrases do not match.'
              : 'The same passphrase opens every saved report. There is no recovery.'}
          </span>
        </div>

        {notice && (
          <p className="archive-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="archive-error" role="alert">
            {error}
          </p>
        )}

        <h3 className="archive-subtitle">Saved reports</h3>
        {entries.length === 0 ? (
          <p className="archive-empty">No saved reports yet.</p>
        ) : (
          <ul className="archive-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div className="archive-item">
                  <b>{entry.label}</b>
                  <span>
                    {dateLong(entry.createdAt)} · {entry.source} · {entry.fileName}
                  </span>
                </div>
                <div className="archive-item-actions">
                  <button
                    className="btn btn-ghost btn-xs"
                    type="button"
                    disabled={!longEnough || busy}
                    onClick={() => onOpen(entry.id, passphrase)}
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(entry.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="print-modal-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
