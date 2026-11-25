import { test } from 'bun:test';

test('temporary A4 required-check verification', () => {
  throw new Error('Intentional failure: this PR verifies that the A4 required check blocks merging.');
});
