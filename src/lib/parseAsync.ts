import { parseFile, type ParseOptions } from './parse';
import type { ParseOutcome } from './types';

const WORKER_LIMIT = 1_500_000;

/**
 * Large exports (months of 5-minute readings, JSON treatments) are parsed in a
 * module worker so the UI stays responsive. Small files skip worker startup.
 */
export async function parseFileAsync(
  file: File,
  options: ParseOptions = {},
): Promise<ParseOutcome> {
  if (file.size < WORKER_LIMIT || typeof Worker === 'undefined') {
    return parseFile(file, options);
  }

  return new Promise<ParseOutcome>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      parseFile(file, options).then(resolve);
      return;
    }

    let settled = false;
    const finish = (outcome: ParseOutcome) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(outcome);
    };

    worker.onmessage = (event: MessageEvent<ParseOutcome>) => finish(event.data);
    worker.onerror = () => {
      worker.terminate();
      if (settled) return;
      settled = true;
      parseFile(file, options).then(resolve);
    };
    worker.postMessage({ file, options });
  });
}
