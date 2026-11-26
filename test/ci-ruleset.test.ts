import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readLines(path: string): string[] {
  return readFileSync(join(process.cwd(), path), 'utf8').split(/\r?\n/);
}

function requiredJobName(): string {
  const lines = readLines('.github/workflows/a4-print.yml');
  const jobStart = lines.findIndex((line) => line === '  required:');
  if (jobStart === -1) throw new Error('A4 workflow has no required job');

  const nextJob = lines.findIndex(
    (line, index) => index > jobStart && /^  [A-Za-z0-9_-]+:\s*$/.test(line),
  );
  const jobLines = lines.slice(jobStart + 1, nextJob === -1 ? undefined : nextJob);
  const nameLine = jobLines.find((line) => /^    name:\s+/.test(line));
  if (!nameLine) throw new Error('A4 required job has no name');

  return nameLine.replace(/^    name:\s+/, '').trim();
}

function rulesetContext(): string {
  const ruleset = JSON.parse(
    readFileSync(join(process.cwd(), '.github/rulesets/a4-print.json'), 'utf8'),
  ) as {
    enforcement: string;
    conditions: { ref_name: { include: string[] } };
    rules: Array<{
      type: string;
      parameters?: {
        required_status_checks?: Array<{ context: string }>;
      };
    }>;
  };

  expect(ruleset.enforcement).toBe('active');
  expect(ruleset.conditions.ref_name.include).toContain('~DEFAULT_BRANCH');
  const requiredRule = ruleset.rules.find((rule) => rule.type === 'required_status_checks');
  const contexts = requiredRule?.parameters?.required_status_checks?.map((check) => check.context) ?? [];
  expect(contexts).toHaveLength(1);
  return contexts[0];
}

test('keeps the required A4 check name aligned with the ruleset context', () => {
  const workflowJobName = requiredJobName();
  const context = rulesetContext();

  expect(workflowJobName).toBe('A4 print regression required');
  expect(context).toBe(workflowJobName);
});

function triggerBlock(): string {
  const lines = readLines('.github/workflows/a4-print.yml');
  const start = lines.indexOf('on:');
  if (start === -1) throw new Error('A4 workflow has no on: block');
  const end = lines.findIndex((line, index) => index > start && /^[A-Za-z]/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

test('runs on pull requests and only on main pushes, never twice for a PR', () => {
  const lines = triggerBlock().split('\n');
  const pushIndex = lines.indexOf('  push:');

  expect(pushIndex).toBeGreaterThanOrEqual(0);
  // The push trigger must be scoped to main; a bare `push:` would run the
  // matrix a second time for every PR branch.
  expect(lines[pushIndex + 1]?.trim()).toBe('branches: [main]');
  expect(lines[pushIndex + 2]).toBe('  pull_request:');
  expect(lines).toContain('  pull_request:');
});
