#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const checks = [
  'test:min-auth',
  'test:min-auth-session-invalidation',
  'test:min-material-upload',
  'test:min-admin-review',
  'test:min-material-search',
  'test:min-search-fts',
  'test:min-material-download',
  'test:min-material-rating',
  'test:min-csrf-regression',
  'test:min-rate-limit',
  'test:min-rate-limit-identity',
  'test:min-recommendations',
  'test:min-recommend-tiering',
  'test:min-admin-update-review-errors',
  'test:min-material-upload-size-boundary',
  'test:min-material-upload-security-regression',
  'test:min-cors-config',
  'test:min-auth-token-hardening',
  'test:min-file-scan-async',
  'test:min-file-scan-claim-concurrency',
  'test:min-rate-limit-shared-store',
  'test:min-admin-audit-log-transaction',
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
