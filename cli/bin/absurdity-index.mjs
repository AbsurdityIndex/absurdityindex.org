#!/usr/bin/env node

// Entry point - delegates to compiled TypeScript
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(__dirname, '../dist/index.js');
const srcEntry = resolve(__dirname, '../src/index.ts');

if (existsSync(distEntry)) {
  const { run } = await import(distEntry);
  run();
} else {
  // Dev mode: use tsx
  const { execSync } = await import('node:child_process');
  execSync(`npx tsx ${srcEntry} ${process.argv.slice(2).join(' ')}`, {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  });
}
