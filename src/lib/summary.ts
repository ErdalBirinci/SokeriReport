import type { Metrics } from './metrics';
import type { Dataset } from './types';
import { clockLabel, dateLong, fmt1, fmtInt } from './format';
import { fmtGlucose, rangeLabel, type GlucoseUnit } from './glucose';

export function buildSummary(
  metrics: Metrics,
  dataset: Dataset,
  patient: string,
  note: string,
  unit: GlucoseUnit = 'mg/dL',
  options: { anonymise?: boolean } = {},
): string {
  const days = Math.max(1, Math.round(metrics.spanDays));
  const low = metrics.low + metrics.veryLow;
  const high = metrics.high + metrics.veryHigh;
  const t = metrics.targets;
  const lines: string[] = [];
  const anonymise = options.anonymise === true;
  const patientLabel = anonymise ? 'Patient' : patient.trim() || 'Patient not specified';
  const fileLabel = anonymise ? 'source file hidden' : dataset.meta.fileName;

  lines.push('SOKERIREPORT · GLYCEMIC CONTROL SUMMARY');
  lines.push(
    `${patientLabel} · ${dateLong(metrics.start)} – ${dateLong(metrics.end)} · ${days} ${days === 1 ? 'day' : 'days'} · ${fmtInt(metrics.count)} readings`,
  );
  lines.push(
    `${dataset.meta.source} · ${fileLabel} · targets ${t.label} (${rangeLabel(t.low, t.high, unit)})`,
  );
  lines.push('');

  lines.push('CONTROL');
  lines.push(
    `• TIR ${fmt1(metrics.target)}% (${rangeLabel(t.low, t.high, unit)}) · TITR ${fmt1(metrics.titrr)}% · low ${fmt1(low)}% · high ${fmt1(high)}%`,
  );
  lines.push(
    `• Mean ${fmtGlucose(metrics.mean, unit)} ${unit} · SD ${fmtGlucose(metrics.sd, unit)} · CV ${fmt1(metrics.cv)}% · GRI ${fmtInt(metrics.gri)} (${metrics.griZone.toLowerCase()})`,
  );
  lines.push(
    `• GMI ${fmt1(metrics.gmi)}% · ADAG eA1c ${fmt1(metrics.ea1c)}% · CGM active ${fmtInt(metrics.coverage)}%`,
  );
  lines.push('');

  lines.push('RISKS');
  lines.push(
    `• Hypoglycemia: ${metrics.hypoEvents.length} ${metrics.hypoEvents.length === 1 ? 'event' : 'events'}, longest ${metrics.longestHypoMinutes} min, level 2: ${metrics.level2HypoCount}, night share ${fmtInt(metrics.nightHypoShare)}%`,
  );
  if (metrics.hypoWindow.meaningful) {
    lines.push(
      `• Low readings cluster ${clockLabel(metrics.hypoWindow.start)}–${clockLabel(metrics.hypoWindow.end)} (${fmtInt(metrics.hypoWindow.share)}% of ${metrics.hypoReadings} lows)`,
    );
  }
  if (metrics.dawn.eligible > 0) {
    lines.push(
      `• Dawn phenomenon ${metrics.dawn.flagged}/${metrics.dawn.eligible} days · mean rise ${metrics.dawn.avgRise >= 0 ? '+' : '−'}${fmtGlucose(Math.abs(metrics.dawn.avgRise), unit)} ${unit} (05–08 vs 00–04)`,
    );
  }
  if (metrics.insulinDaily !== null) {
    lines.push(`• Mean insulin ${fmt1(metrics.insulinDaily)} U/day`);
  }
  if (metrics.coverage < 70) {
    lines.push(`• Sensor coverage is low (${fmtInt(metrics.coverage)}%); interpret results with caution`);
  }
  if (metrics.quality.gapCount > 0) {
    lines.push(
      `• Sensor gaps: ${metrics.quality.gapCount} · longest ${metrics.quality.longestGapMin} min · about ${Math.round(metrics.quality.missingMinutes / 60)} h missing`,
    );
  }
  lines.push('');

  lines.push('ASSESSMENT');
  for (const insight of metrics.insights.slice(0, 4)) {
    lines.push(`• ${insight.title}`);
  }
  if (!anonymise && note.trim()) {
    lines.push('');
    lines.push(`Clinician note: ${note.trim()}`);
  }

  return lines.join('\n');
}
