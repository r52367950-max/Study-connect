#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const checks = [
  'test:min-auth',
  'test:min-material-upload',
  'test:min-admin-review',
  'test:min-material-search',
  'test:min-material-download',
  'test:min-material-rating',
  'test:min-csrf-regression',
  'test:min-rate-limit',
];

const results = [];

for (const name of checks) {
  console.log(`\n>>> Running ${name}`);
  const run = spawnSync('npm', ['run', name], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  const ok = run.status === 0;
  results.push({ name, ok, status: run.status ?? 1 });

  if (!ok) {
    console.error(`\n✖ ${name} failed with exit code ${run.status}`);
    break;
  }
}

console.log('\n===== MIN TEST SUMMARY =====');
for (const item of results) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} - ${item.name} (code=${item.status})`);
}

const failed = results.find((item) => !item.ok);
if (failed) {
  process.exitCode = failed.status || 1;
} else {
  console.log('ALL PASS - min validation scripts completed successfully.');
}
