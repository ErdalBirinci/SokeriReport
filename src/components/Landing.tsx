import type { PointerEvent as ReactPointerEvent } from 'react';
import DropZone from './DropZone';

const GITHUB_REPO = 'https://github.com/ErdalBirinci/SokeriReport';

interface Props {
  onFiles: (files: File[]) => void;
  onDemo: () => void;
  busy: boolean;
}

export default function Landing({ onFiles, onDemo, busy }: Props) {
  const handleStageMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    event.currentTarget.style.setProperty('--tilt-x', `${(x * 6).toFixed(2)}deg`);
    event.currentTarget.style.setProperty('--tilt-y', `${(y * -5).toFixed(2)}deg`);
  };

  const resetTilt = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--tilt-x', '0deg');
    event.currentTarget.style.setProperty('--tilt-y', '0deg');
  };

  return (
    <div className="landing">
      <div className="landing-atmosphere" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>

      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">
            <span className="lock">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
                <path
                  d="M7 10V8a5 5 0 0 1 10 0v2"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <rect x="4.5" y="10" width="15" height="10" rx="3" fill="white" />
              </svg>
            </span>
            Zero-cloud CGM report
          </span>

          <h1>
            A glycemic summary in <em>10 seconds</em>, before your appointment.
          </h1>

          <p className="hero-lead">
            Drop in your LibreView, Dexcom Clarity or Nightscout export — CSV, JSON, or a PDF with a
            glucose readings table. TIR, glycemic variability, the dawn phenomenon and your most
            frequent hypoglycemia hours become a clean, one-page report for your doctor — for the
            last 14 days, 1 month or 3 months. The file never leaves your browser.
          </p>

          <div className="drop-wrap">
            <DropZone onFiles={onFiles} busy={busy} />
          </div>

          <div className="hero-actions">
            <button className="btn btn-primary" type="button" onClick={onDemo} disabled={busy}>
              Try with sample data
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <path
                  d="M5 12h13m0 0-5-5m5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <a
              className="btn btn-ghost"
              href={GITHUB_REPO}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Open the SokeriReport source code on GitHub"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              GitHub
            </a>
            <span className="hero-note">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
                <path
                  d="M7 10V8a5 5 0 0 1 10 0v2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <rect
                  x="4.5"
                  y="10"
                  width="15"
                  height="10"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              No install · no account · no upload
            </span>
          </div>
        </div>

        <aside className="hero-side" aria-hidden="true">
          <div className="stage" onPointerMove={handleStageMove} onPointerLeave={resetTilt}>
            <span className="stage-glow" />
            <span className="stage-plane" />
            <span className="stage-card-back" />

            <div className="preview">
              <div className="preview-chrome">
                <i>A4 · one page</i>
              </div>

              <div className="preview-head">
                <div>
                  <div className="preview-kicker">Sample 1-month AGP</div>
                  <div className="preview-title">Glycemic Control</div>
                </div>
                <div className="preview-periods" aria-hidden="true">
                  <span>14d</span>
                  <span className="is-active">1m</span>
                  <span>3m</span>
                </div>
              </div>

              <div className="preview-grid">
                <div className="preview-kpi">
                  <span>Time in range</span>
                  <b>78%</b>
                </div>
                <div className="preview-kpi">
                  <span>CV</span>
                  <b>29%</b>
                </div>
                <div className="preview-kpi">
                  <span>GMI</span>
                  <b>6.4%</b>
                </div>
              </div>

              <div className="preview-tir" aria-hidden="true">
                <span style={{ width: '78%', background: '#0ea47a' }} />
                <span style={{ width: '14%', background: '#f59e0b' }} />
                <span style={{ width: '5%', background: '#f43f5e' }} />
                <span style={{ width: '3%', background: '#8b5cf6' }} />
              </div>

              <svg className="preview-chart" viewBox="0 0 320 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
                  </linearGradient>
                  <linearGradient id="preview-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3b6cf6" />
                    <stop offset="100%" stopColor="#0d9488" />
                  </linearGradient>
                </defs>
                <rect x="0" y="34" width="320" height="44" fill="#0ea47a" opacity="0.09" />
                {[0, 1, 2, 3, 4].map((index) => (
                  <line
                    key={index}
                    x1="0"
                    x2="320"
                    y1={12 + index * 24}
                    y2={12 + index * 24}
                    stroke="rgba(19,42,74,.06)"
                    strokeDasharray="2 5"
                  />
                ))}
                <line
                  x1="0"
                  y1="34"
                  x2="320"
                  y2="34"
                  stroke="#f59e0b"
                  strokeOpacity="0.5"
                  strokeDasharray="3 4"
                />
                <line
                  x1="0"
                  y1="78"
                  x2="320"
                  y2="78"
                  stroke="#f43f5e"
                  strokeOpacity="0.4"
                  strokeDasharray="3 4"
                />
                <path
                  d="M0 62 C 22 60, 34 50, 48 44 S 74 30, 92 48 S 120 88, 142 66 S 176 38, 196 54 S 228 96, 250 70 S 286 44, 320 58 L320 120 L0 120 Z"
                  fill="url(#preview-fill)"
                />
                <path
                  d="M0 62 C 22 60, 34 50, 48 44 S 74 30, 92 48 S 120 88, 142 66 S 176 38, 196 54 S 228 96, 250 70 S 286 44, 320 58"
                  fill="none"
                  stroke="url(#preview-line)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>

              <div className="preview-foot">
                <span className="pill">
                  <span className="pill-dot" /> Calculated in your browser
                </span>
                <span>8,640 readings · 0 bytes uploaded</span>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="proof-strip" aria-label="Report capabilities">
        <div className="proof-item">
          <b>3 formats</b>
          <span>CSV, JSON and PDF tables</span>
        </div>
        <div className="proof-item">
          <b>14d · 1m · 3m</b>
          <span>AGP, TIR and risk windows</span>
        </div>
        <div className="proof-item">
          <b>One A4 page</b>
          <span>Measured before every print</span>
        </div>
        <div className="proof-item">
          <b>0 bytes sent</b>
          <span>All parsing stays in the browser</span>
        </div>
      </section>

      <section className="how" aria-label="How it works">
        <div className="how-head">
          <span className="section-tag">Workflow</span>
          <h2>From export to consultation, in three steps.</h2>
          <p>No install, no account, no upload. Open the file, check the report, hand it over.</p>
        </div>

        <div className="how-grid">
          <div className="how-card">
            <span className="how-num">01</span>
            <h3>Download it from your device</h3>
            <p>
              In LibreView export the “Glucose Data” CSV, in Clarity the “Export” CSV, in Nightscout
              the entries JSON. A PDF with a date/time + glucose table works too.
            </p>
          </div>

          <div className="how-card">
            <span className="how-num">02</span>
            <h3>Drop it here</h3>
            <p>
              Parsing and every calculation run in your browser. You will not see a single request
              in the Network tab; the data never leaves your device.
            </p>
          </div>

          <div className="how-card">
            <span className="how-num">03</span>
            <h3>Take it as a PDF</h3>
            <p>
              Choose 14 days, 1 month or 3 months, then print the A4 report: TIR, CV, GMI, dawn
              phenomenon, hypoglycemia by hour and the clinical summary on a single page by
              default; optional sections are measured before printing.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-note">
        <span className="note-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3 5 6v5.5c0 4.2 2.8 7.4 7 9.5 4.2-2.1 7-5.3 7-9.5V6l-7-3Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="m9 12 2.2 2.2L15.5 10"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <strong>Privacy by architecture</strong>
          <p>
            Patient data is processed without being uploaded to third-party portals, so no data
            transfer arises under GDPR. When you close the tab the data is cleared from memory;
            the only copy is an encrypted archive you explicitly save in this browser.
          </p>
        </div>
        <div className="note-tags">
          <span>GDPR aware</span>
          <span>AES-256 archive</span>
        </div>
      </section>
    </div>
  );
}
