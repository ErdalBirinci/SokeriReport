import { fmtGlucose, type GlucoseUnit } from '../lib/glucose';

const W = 560;
const H = 236;
const M = { top: 18, right: 14, bottom: 30, left: 34 };

interface Props {
  counts: number[];
  windowStart: number;
  threshold: number;
  unit: GlucoseUnit;
}

export default function HypoHistogram({ counts, windowStart, threshold, unit }: Props) {
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const max = Math.max(1, ...counts);
  const step = plotW / 24;
  const barW = step * 0.58;

  const isHighlighted = (hour: number) => {
    for (let k = 0; k < 3; k += 1) {
      if ((windowStart + k) % 24 === hour) return true;
    }
    return false;
  };

  const total = counts.reduce((a, b) => a + b, 0);
  const barH = (value: number) => (value > 0 ? Math.max(3, (value / max) * plotH) : 0);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hypoglycemia by hour of day">
        <rect x={M.left} y={M.top} width={step * 6} height={plotH} fill="#3b6cf6" opacity="0.05" />
        <text x={M.left + 6} y={M.top + 11} className="axis-unit">
          night
        </text>

        {[0, 0.5, 1].map((ratio) => {
          const value = Math.round(max * (1 - ratio));
          const yy = M.top + plotH * ratio;
          return (
            <g key={ratio}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={yy}
                y2={yy}
                stroke="rgba(19,42,74,.08)"
                strokeDasharray={ratio === 0 ? undefined : '3 4'}
              />
              <text x={M.left - 7} y={yy + 3.5} textAnchor="end" className="axis-label">
                {value}
              </text>
            </g>
          );
        })}

        {counts.map((count, hour) => {
          const height = barH(count);
          const highlight = isHighlighted(hour);
          return (
            <g key={hour}>
              <rect
                x={M.left + hour * step + (step - barW) / 2}
                y={M.top + plotH - height}
                width={barW}
                height={height}
                rx="3"
                fill={highlight ? 'url(#hypo-hot)' : '#c9d8e9'}
                opacity={count === 0 ? 0 : 1}
              />
            </g>
          );
        })}

        <defs>
          <linearGradient id="hypo-hot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f2607a" />
            <stop offset="100%" stopColor="#d92f4e" />
          </linearGradient>
        </defs>

        {[0, 6, 12, 18].map((hour) => (
          <text
            key={hour}
            x={M.left + hour * step + step / 2}
            y={H - 9}
            textAnchor="middle"
            className="axis-label"
          >
            {String(hour).padStart(2, '0')}:00
          </text>
        ))}
        <text x={W - M.right} y={H - 9} textAnchor="end" className="axis-label">
          23:00
        </text>
      </svg>
      <p className="chart-note">
        {total > 0
          ? `Distribution of ${total} low readings by hour. Red bars mark the most frequent 3-hour window.`
          : `No readings below ${fmtGlucose(threshold, unit)} ${unit} in this dataset.`}
      </p>
    </div>
  );
}
