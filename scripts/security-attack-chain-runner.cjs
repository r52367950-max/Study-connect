#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const checks = [
  'test:min-auth',
  'test:min-auth-abuse-chain',
  'test:min-material-upload',
  'test:min-material-download',
  'test:min-admin-update-review-errors',
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

console.log('\n===== SECURITY ATTACK-CHAIN SUMMARY =====');
for (const item of results) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} - ${item.name} (code=${item.status})`);
}

const failed = results.find((item) => !item.ok);
if (failed) {
  process.exitCode = failed.status || 1;
} else {
  console.log('ALL PASS - composite attack-chain regression checks are blocked as expected.');
}
