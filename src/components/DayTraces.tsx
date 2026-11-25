import { useMemo } from 'react';
import type { Reading } from '../lib/types';
import type { HourBucket, TargetProfile } from '../lib/metrics';
import { fmtGlucose, type GlucoseUnit } from '../lib/glucose';

const W = 920;
const H = 300;
const M = { top: 16, right: 16, bottom: 30, left: 46 };
const Y_MIN = 40;

interface Props {
  readings: Reading[];
  hourly: HourBucket[];
  unit: GlucoseUnit;
  targets: TargetProfile;
}

interface DayLine {
  key: string;
  color: string;
  points: { x: number; y: number }[];
}

export default function DayTraces({ readings, hourly, unit, targets }: Props) {
  const { lines, totalDays, sampled } = useMemo(() => {
    const groups = new Map<string, Reading[]>();
    for (const reading of readings) {
      const date = new Date(reading.t);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(reading);
      else groups.set(key, [reading]);
    }

    const allEntries = [...groups.entries()];
    // Keep the trace readable on 1- and 3-month reports: evenly sample the period
    // when it has more than 16 calendar days, always including the latest day.
    const step = Math.max(1, Math.ceil(allEntries.length / 16));
    const dayEntries = allEntries.filter(
      (_, index) => index % step === 0 || index === allEntries.length - 1,
    );
    const count = Math.max(1, dayEntries.length);

    const nextLines: DayLine[] = dayEntries.map(([, values], index) => {
      const dayStart = new Date(values[0].t);
      dayStart.setHours(0, 0, 0, 0);
      const midnight = dayStart.getTime();
      const points = values
        .filter((_, i) => i % 2 === 0)
        .map((reading) => ({
          hour: (reading.t - midnight) / 3_600_000,
          value: reading.v,
        }));
      return {
        key: `${midnight}`,
        color: `hsl(${200 + (index / count) * 70} 62% 46%)`,
        points: points.map((p) => ({ x: p.hour, y: p.value })),
      };
    });

    return {
      lines: nextLines,
      totalDays: allEntries.length,
      sampled: dayEntries.length < allEntries.length,
    };
  }, [readings]);

  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const dataMax = readings.reduce((max, r) => Math.max(max, r.v), 200);
  const yMax = Math.min(400, Math.max(300, Math.ceil((dataMax + 20) / 50) * 50));
  const clamp = (v: number) => Math.min(yMax, Math.max(Y_MIN, v));
  const x = (hour: number) => M.left + (hour / 24) * plotW;
  const y = (value: number) => M.top + ((yMax - clamp(value)) / (yMax - Y_MIN)) * plotH;

  const medianPts = hourly
    .filter((h) => h.count > 0)
    .map((h) => `${x(h.hour + 0.5).toFixed(1)},${y(h.median).toFixed(1)}`);

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Daily glucose traces in ${unit}`}
      >
        <rect
          x={M.left}
          y={y(targets.high)}
          width={plotW}
          height={y(targets.low) - y(targets.high)}
          fill="#0ea47a"
          opacity="0.07"
        />
        {[targets.low, targets.high, 250].map((tick) => (
          <g key={tick}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgba(19,42,74,.16)"
              strokeDasharray="4 5"
            />
            <text x={M.left - 9} y={y(tick) + 3.5} textAnchor="end" className="axis-label">
              {fmtGlucose(tick, unit)}
            </text>
          </g>
        ))}

        {lines.map((line) =>
          line.points.length > 1 ? (
            <polyline
              key={line.key}
              points={line.points.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={line.color}
              strokeWidth="1.5"
              strokeOpacity="0.42"
              strokeLinejoin="round"
            />
          ) : null,
        )}

        {medianPts.length > 1 && (
          <polyline
            points={medianPts.join(' ')}
            fill="none"
            stroke="#0d1b2e"
            strokeWidth="2.4"
            strokeOpacity="0.72"
            strokeLinejoin="round"
          />
        )}

        {[0, 6, 12, 18, 24].map((tick) => (
          <text
            key={tick}
            x={x(tick)}
            y={H - 9}
            textAnchor="middle"
            className="axis-label"
          >
            {tick === 24 ? '24' : String(tick).padStart(2, '0')}
          </text>
        ))}
      </svg>
      <p className="chart-note">
        Each thin line is one day; the thick dark line is the hourly median across all days.{' '}
        {sampled
          ? `${lines.length} of ${totalDays} days shown, evenly sampled across the report period.`
          : `All ${lines.length} calendar days in the report period.`}
      </p>
    </div>
  );
}
