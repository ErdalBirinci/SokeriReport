import type { HourBucket, TargetProfile } from '../lib/metrics';
import { fmtGlucose, rangeLabel, type GlucoseUnit } from '../lib/glucose';

const W = 920;
const H = 340;
const M = { top: 18, right: 20, bottom: 32, left: 46 };
const Y_MIN = 40;

interface Pt {
  x: number;
  y: number;
}

function smoothPath(points: Pt[]): string {
  if (!points.length) return '';
  if (points.length < 3) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

interface Props {
  hourly: HourBucket[];
  unit: GlucoseUnit;
  targets: TargetProfile;
}

export default function AgpChart({ hourly, unit, targets }: Props) {
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const dataMax = hourly.reduce((max, bucket) => Math.max(max, bucket.p95), 200);
  const yMax = Math.min(400, Math.max(300, Math.ceil((dataMax + 20) / 50) * 50));
  const clamp = (v: number) => Math.min(yMax, Math.max(Y_MIN, v));
  const x = (hour: number) => M.left + (hour / 24) * plotW;
  const y = (value: number) => M.top + ((yMax - clamp(value)) / (yMax - Y_MIN)) * plotH;

  const segments: HourBucket[][] = [];
  let current: HourBucket[] = [];
  for (const bucket of hourly) {
    if (bucket.count > 0) current.push(bucket);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);

  const ribbon = (bucket: HourBucket[], upper: number, lower: number) => {
    const top = bucket.map(
      (b) => `${x(b.hour + 0.5).toFixed(1)},${y(upper === 95 ? b.p95 : b.p75).toFixed(1)}`,
    );
    const bottom = bucket
      .slice()
      .reverse()
      .map((b) => `${x(b.hour + 0.5).toFixed(1)},${y(lower === 5 ? b.p5 : b.p25).toFixed(1)}`);
    return `M${top.join(' L')} L${bottom.join(' L')} Z`;
  };

  const ticks =
    unit === 'mmol/L'
      ? [2.2, 3.9, 5.6, 7.8, 10, 13.9, 16.7, 19.4, 22.2].map((v) => v * 18.0182)
      : [40, 70, 100, 140, 180, 250, 300, 350, 400];
  const yTicks = ticks.filter((tick) => tick <= yMax);
  const xTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <>
      <div className="chart chart-agp">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`24-hour glucose profile, target ${rangeLabel(targets.low, targets.high, unit)}`}
        >
          <defs>
            <linearGradient id="agp-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b6cf6" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
            <linearGradient id="agp-iqr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0.12" />
            </linearGradient>
            <linearGradient id="agp-range" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b6cf6" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#3b6cf6" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <rect
            x={x(0)}
            y={y(targets.high)}
            width={x(24) - x(0)}
            height={y(targets.low) - y(targets.high)}
            fill="#0ea47a"
            opacity="0.08"
          />
          <rect
            x={x(0)}
            y={y(yMax)}
            width={x(24) - x(0)}
            height={y(targets.high) - y(yMax)}
            fill="#f59e0b"
            opacity="0.05"
          />
          <rect
            x={x(0)}
            y={y(targets.low)}
            width={x(24) - x(0)}
            height={y(Y_MIN) - y(targets.low)}
            fill="#f43f5e"
            opacity="0.045"
          />

          <rect x={x(0)} y={M.top} width={x(4) - x(0)} height={plotH} fill="#8b5cf6" opacity="0.045" />
          <rect x={x(5)} y={M.top} width={x(8) - x(5)} height={plotH} fill="#f59e0b" opacity="0.06" />

          {yTicks.map((tick) => {
            const threshold =
              Math.abs(tick - targets.low) < 0.5 || Math.abs(tick - targets.high) < 0.5;
            return (
              <g key={tick}>
                <line
                  x1={x(0)}
                  x2={x(24)}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={threshold ? 'rgba(19,42,74,.22)' : 'rgba(19,42,74,.07)'}
                  strokeDasharray={threshold ? '5 4' : undefined}
                />
                <text x={M.left - 9} y={y(tick) + 3.5} textAnchor="end" className="axis-label">
                  {fmtGlucose(tick, unit)}
                </text>
              </g>
            );
          })}

          <text x={W - M.right} y={12} textAnchor="end" className="axis-unit">
            {unit}
          </text>

          {segments.map((segment, index) => (
            <g key={`seg-${index}`}>
              <path d={ribbon(segment, 95, 5)} fill="url(#agp-range)" />
              <path d={ribbon(segment, 75, 25)} fill="url(#agp-iqr)" />
              <path
                d={smoothPath(segment.map((b) => ({ x: x(b.hour + 0.5), y: y(b.median) })))}
                fill="none"
                stroke="url(#agp-line)"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}

          {xTicks.map((tick) => (
            <text key={tick} x={x(tick)} y={H - 10} textAnchor="middle" className="axis-label">
              {tick === 24 ? '24' : String(tick).padStart(2, '0')}
            </text>
          ))}
        </svg>
      </div>

      <div className="legend chart-legend">
        <span className="legend-item">
          <i className="swatch" style={{ background: 'linear-gradient(90deg,#3b6cf6,#0d9488)' }} />
          Median
        </span>
        <span className="legend-item">
          <i className="swatch" style={{ background: 'rgba(13,148,136,.35)' }} />
          25th–75th
        </span>
        <span className="legend-item">
          <i className="swatch" style={{ background: 'rgba(59,108,246,.18)' }} />
          5th–95th
        </span>
        <span className="legend-item">
          <i className="swatch" style={{ background: 'rgba(14,164,122,.16)' }} />
          Target {rangeLabel(targets.low, targets.high, unit)}
        </span>
        <span className="legend-item">
          <i className="swatch" style={{ background: 'rgba(139,92,246,.35)' }} />
          Night 00–04
        </span>
        <span className="legend-item">
          <i className="swatch" style={{ background: 'rgba(245,158,11,.4)' }} />
          Dawn 05–08
        </span>
      </div>
    </>
  );
}
