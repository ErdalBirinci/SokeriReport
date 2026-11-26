import { useEffect, useRef, useState } from 'react';
import { trapFocus } from '../lib/focusTrap';
import type { PrintOptions } from '../lib/printOptions';

interface Props {
  initial: PrintOptions;
  onSave: (options: PrintOptions) => void;
  onClose: () => void;
}

export default function PrintOptionsDialog({ initial, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<PrintOptions>(initial);
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

  const update = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="print-modal-backdrop no-print">
      <div
        ref={modalRef}
        className="print-modal print-options-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-options-title"
        aria-describedby="print-options-intro"
      >
        <h2 id="print-options-title">Print setup</h2>
        <p id="print-options-intro">
          Customize the printed A4 report. Optional sections are measured again before printing, and
          these settings are remembered in this browser.
        </p>

        <div className="option-fields">
          <label className="option-field">
            <span>Institution / practice</span>
            <input
              value={draft.institution}
              onChange={(event) => update('institution', event.target.value)}
              placeholder="Optional"
              autoFocus
            />
          </label>
          <label className="option-field">
            <span>Prepared by</span>
            <input
              value={draft.preparedBy}
              onChange={(event) => update('preparedBy', event.target.value)}
              placeholder="Clinician name (optional)"
            />
          </label>
        </div>

        <div className="option-toggles">
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={draft.signature}
              onChange={(event) => update('signature', event.target.checked)}
            />
            <span>
              <b>Signature line</b>
              <small>Adds a signature line above the footer.</small>
            </span>
          </label>
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={draft.grayscale}
              onChange={(event) => update('grayscale', event.target.checked)}
            />
            <span>
              <b>Black &amp; white print</b>
              <small>Grayscale output with stronger contrast for mono printers.</small>
            </span>
          </label>
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={draft.showQuality}
              onChange={(event) => update('showQuality', event.target.checked)}
            />
            <span>
              <b>Data quality section</b>
              <small>Sensor coverage, gaps and per-day strip in the printout.</small>
            </span>
          </label>
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={draft.showComparison}
              onChange={(event) => update('showComparison', event.target.checked)}
            />
            <span>
              <b>Previous report comparison</b>
              <small>Only printed when a comparison file is loaded.</small>
            </span>
          </label>
          <label className="option-toggle">
            <input
              type="checkbox"
              checked={draft.showQuestions}
              onChange={(event) => update('showQuestions', event.target.checked)}
            />
            <span>
              <b>Questions for the clinician</b>
              <small>The three discussion prompts, when available.</small>
            </span>
          </label>
        </div>

        <div className="print-modal-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onSave(draft)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
