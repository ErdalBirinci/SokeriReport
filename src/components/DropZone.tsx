import { useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';

interface Props {
  onFiles: (files: File[]) => void;
  busy: boolean;
}

export default function DropZone({ onFiles, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const pick = () => {
    if (!busy) inputRef.current?.click();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (busy) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) onFiles(files);
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick();
    }
  };

  return (
    <div
      className={`dropzone${dragging ? ' is-drag' : ''}${busy ? ' is-busy' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Upload a glucose data file"
      onClick={pick}
      onKeyDown={handleKey}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.json,.txt,text/csv,application/json"
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) onFiles(files);
          event.target.value = '';
        }}
      />

      <div className="drop-icon" aria-hidden="true">
        {busy ? (
          <span className="spinner" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <div className="drop-title">
        {busy ? 'Analyzing…' : dragging ? 'Drop it — analysis happens in your browser' : 'Drag your file here'}
      </div>
      <div className="drop-hint">
        or <span className="drop-cta">choose a file from your device</span> · CSV, JSON · exports work as-is
      </div>

      <div className="drop-formats" aria-hidden="true">
        <span className="format">
          <b>LibreView</b> · Glucose Data CSV
        </span>
        <span className="format">
          <b>Dexcom Clarity</b> · CSV
        </span>
        <span className="format">
          <b>Nightscout</b> · JSON
        </span>
      </div>
    </div>
  );
}
