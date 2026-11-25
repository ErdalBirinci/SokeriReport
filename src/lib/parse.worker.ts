import { parseFile, type ParseOptions } from './parse';
import type { ParseOutcome } from './types';

interface WorkerScope {
  onmessage: ((event: MessageEvent<{ file: File; options?: ParseOptions }>) => void) | null;
  postMessage: (message: ParseOutcome) => void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = async (event) => {
  try {
    const outcome = await parseFile(event.data.file, event.data.options ?? {});
    scope.postMessage(outcome);
  } catch (error) {
    scope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Could not read the file.',
    });
  }
};
