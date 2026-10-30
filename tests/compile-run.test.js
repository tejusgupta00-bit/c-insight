import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAndRun } from '../server/compile-run.js';

test('compiles and runs valid C code in the local sandbox', async () => {
  const result = await compileAndRun('#include <stdio.h>\nint main(void) { puts("hello from C"); return 0; }');

  assert.equal(result.success, true);
  assert.equal(result.phase, 'run');
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /hello from C/);
});

test('returns compiler diagnostics for invalid C without running it', async () => {
  const result = await compileAndRun('int main(void) { this is not valid C; }');

  assert.equal(result.success, false);
  assert.equal(result.phase, 'compile');
  assert.match(result.stderr, /error/i);
});

test('stops a non-terminating C program at the runtime limit', async () => {
  const result = await compileAndRun('int main(void) { for (;;) {} }', { runTimeoutMs: 300 });

  assert.equal(result.success, false);
  assert.equal(result.phase, 'run');
  assert.equal(result.timedOut, true);
});
