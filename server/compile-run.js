import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const COMPILER = '/usr/bin/clang';
const MAX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_COMPILE_TIMEOUT_MS = 10_000;
const DEFAULT_RUN_TIMEOUT_MS = 2_000;

/**
 * Clang emits `file:line:column: severity: message` for every diagnostic.
 * Anything else (linker notes, shell noise) is skipped.
 */
export function parseCompilerDiagnostics(stderr) {
  const diagnostics = [];
  const seen = new Set();

  for (const rawLine of stderr.split('\n')) {
    const match = /^(.+?):(\d+):(\d+):\s*(error|warning|note):\s*(.*)$/.exec(rawLine.trim());
    if (!match) continue;

    const [, file, line, column, severity, message] = match;
    if (!message) continue;

    const key = `${file}:${line}:${column}:${severity}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);

    diagnostics.push({
      file,
      line: Number(line),
      column: Number(column),
      severity,
      message,
      raw: rawLine
    });
  }

  return diagnostics;
}

function runProcess(command, args, { cwd, env, timeoutMs, maxOutputBytes = MAX_OUTPUT_BYTES, input }) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let spawnError = null;
    let settled = false;

    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, outputLimitExceeded, spawnError, ...result });
    };

    const killProcessGroup = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };

    const append = (stream, chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maxOutputBytes) {
        outputLimitExceeded = true;
        killProcessGroup();
      }
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    child.stdout.on('data', chunk => append('stdout', chunk));
    child.stderr.on('data', chunk => append('stderr', chunk));

    // Feed stdin (if any) and always close it so the child sees EOF.
    child.stdin.on('error', () => {});
    try {
      if (input != null && input !== '') {
        child.stdin.write(String(input));
      }
    } catch {
      // Ignore broken-pipe errors; the process may have exited early.
    }
    try {
      child.stdin.end();
    } catch {
      // Ignore.
    }
    child.on('error', error => {
      spawnError = error;
    });
    child.on('close', (code, signal) => finish({ exitCode: code, signal }));

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup();
    }, timeoutMs);
    timer.unref?.();
  });
}

function sandboxProfile(workDir) {
  const escapedPath = workDir.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return [
    '(version 1)',
    '(deny default)',
    '(allow process*)',
    '(allow file-read* (subpath "/"))',
    '(deny file-read* (subpath "/Users"))',
    `(allow file-write* (subpath "${escapedPath}"))`,
    '(allow sysctl-read)',
    '(deny network*)'
  ].join(' ');
}

export async function compileAndRun(source, options = {}) {
  if (process.platform !== 'darwin') {
    return {
      success: false,
      phase: 'compile',
      stdout: '',
      stderr: 'The local compile-and-run service currently requires macOS with Apple Clang and sandbox-exec.',
      exitCode: null,
      timedOut: false,
      diagnostics: [],
      durationMs: 0
    };
  }

  const temporaryDir = await mkdtemp(path.join(tmpdir(), 'c-insight-'));
  const workDir = await realpath(temporaryDir);
  const sourcePath = path.join(workDir, 'source.c');
  const executablePath = path.join(workDir, 'program');
  const env = {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: workDir,
    TMPDIR: workDir
  };

  try {
    await writeFile(sourcePath, source, { encoding: 'utf8', mode: 0o600 });
    const startedAt = Date.now();
    const compile = await runProcess(COMPILER, [
      '-std=c99', '-Wall', '-Wextra', '-O0', sourcePath, '-o', executablePath
    ], {
      cwd: workDir,
      env,
      timeoutMs: options.compileTimeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS
    });

    if (compile.spawnError || compile.exitCode !== 0 || compile.timedOut || compile.outputLimitExceeded) {
      return {
        success: false,
        phase: 'compile',
        stdout: compile.stdout,
        stderr: compile.spawnError ? compile.spawnError.message : compile.stderr,
        exitCode: compile.exitCode,
        timedOut: compile.timedOut,
        outputLimitExceeded: compile.outputLimitExceeded,
        diagnostics: parseCompilerDiagnostics(compile.spawnError ? '' : compile.stderr),
        durationMs: Date.now() - startedAt
      };
    }

    const run = await runProcess('/usr/bin/sandbox-exec', [
      '-p', sandboxProfile(workDir), '/usr/bin/stdbuf', '-o0', '-e0', executablePath
    ], {
      cwd: workDir,
      env,
      timeoutMs: options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
      input: options.stdin
    });

    return {
      success: !run.spawnError && run.exitCode === 0 && !run.timedOut && !run.outputLimitExceeded,
      phase: 'run',
      stdout: run.stdout,
      stderr: run.spawnError ? run.spawnError.message : run.stderr,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      outputLimitExceeded: run.outputLimitExceeded,
      signal: run.signal,
      // Warnings still come back on a successful build so the console can show them.
      diagnostics: parseCompilerDiagnostics(compile.stderr),
      durationMs: Date.now() - startedAt
    };
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}
