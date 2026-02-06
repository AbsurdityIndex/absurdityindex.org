#!/usr/bin/env node

// Entry point - delegates to compiled TypeScript
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(__dirname, '../dist/index.js');
const srcEntry = resolve(__dirname, '../src/index.ts');

if (existsSync(distEntry)) {
  const { run } = await import(distEntry);
  run();
} else {
  // Dev mode: use tsx
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxCommand, ['tsx', srcEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }
}
