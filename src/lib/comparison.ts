import { fmt1 } from './format';
import { fmtGlucoseDelta, type GlucoseUnit } from './glucose';
import type { Metrics } from './metrics';

/** One plain-language sentence for the report screen; numbers stay explicit. */
export function comparisonNarrative(
  current: Metrics,
  previous: Metrics,
  unit: GlucoseUnit,
): string {
  const deltaTir = current.target - previous.target;
  const deltaLow = current.low + current.veryLow - (previous.low + previous.veryLow);
  const deltaCv = current.cv - previous.cv;
  const deltaMean = current.mean - previous.mean;
  const flat = (value: number, threshold: number) => Math.abs(value) < threshold;

  const tir =
    flat(deltaTir, 0.5) ? 'TIR is unchanged'
      : `TIR is ${deltaTir > 0 ? 'up' : 'down'} ${fmt1(Math.abs(deltaTir))} pp`;
  const lows =
    flat(deltaLow, 0.5) ? 'time below range is unchanged'
      : `time below range is ${deltaLow > 0 ? 'up' : 'down'} ${fmt1(Math.abs(deltaLow))} pp`;
  const cv =
    flat(deltaCv, 0.5) ? 'CV is unchanged'
      : `CV is ${deltaCv > 0 ? 'up' : 'down'} ${fmt1(Math.abs(deltaCv))} pp`;
  const mean = flat(deltaMean, unit === 'mmol/L' ? 0.2 : 2)
    ? 'mean glucose is unchanged'
    : `mean glucose is ${deltaMean > 0 ? 'up' : 'down'} ${fmtGlucoseDelta(Math.abs(deltaMean), unit)} ${unit}`;

  const direction = deltaTir > 0.5 && deltaLow < -0.5
    ? 'Both point in a favourable direction.'
    : deltaTir < -0.5 && deltaLow > 0.5
      ? 'Both point in an unfavourable direction.'
      : 'The measures move in different directions; read them together.';

  return `${tir}, ${lows}, ${cv} and ${mean}. ${direction}`;
}
