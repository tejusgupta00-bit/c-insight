import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCompilerDiagnostics } from './compile-run.js';

const COMPILER = '/usr/bin/clang';
const MAX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_COMPILE_TIMEOUT_MS = 10_000;
const DEFAULT_RUN_TIMEOUT_MS = 60_000;
const MAX_SESSIONS = 32;

const sessions = new Map();

function runProcess(command, args, { cwd, env, timeoutMs, maxOutputBytes = MAX_OUTPUT_BYTES }) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    };
    const append = (stream, chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maxOutputBytes) { outputLimitExceeded = true; killProcessGroup(); }
      if (stream === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout.on('data', chunk => append('stdout', chunk));
    child.stderr.on('data', chunk => append('stderr', chunk));
    child.on('error', e => { spawnError = e; });
    child.on('close', (code, signal) => finish({ exitCode: code, signal }));
    const timer = setTimeout(() => { timedOut = true; killProcessGroup(); }, timeoutMs);
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

function killProcessGroup(child) {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
}

export async function startInteractiveSession(source, handlers, options = {}) {
  if (process.platform !== 'darwin') {
    handlers.onError?.('The local compile-and-run service currently requires macOS with Apple Clang and sandbox-exec.');
    return null;
  }
  if (sessions.size >= MAX_SESSIONS) {
    handlers.onError?.('Too many concurrent sessions. Try again shortly.');
    return null;
  }

  const temporaryDir = await mkdtemp(path.join(tmpdir(), 'c-insight-'));
  const workDir = await realpath(temporaryDir);
  const sourcePath = path.join(workDir, 'source.c');
  const executablePath = path.join(workDir, 'program');
  const env = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: workDir, TMPDIR: workDir };

  try {
    await writeFile(sourcePath, source, { encoding: 'utf8', mode: 0o600 });
    const compile = await runProcess(COMPILER, [
      '-std=c99', '-Wall', '-Wextra', '-O0', sourcePath, '-o', executablePath
    ], {
      cwd: workDir,
      env,
      timeoutMs: options.compileTimeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS
    });

    if (compile.spawnError || compile.exitCode !== 0 || compile.timedOut || compile.outputLimitExceeded) {
      await rm(temporaryDir, { recursive: true, force: true });
      handlers.onCompileError?.({
        stderr: compile.spawnError ? compile.spawnError.message : compile.stderr,
        diagnostics: parseCompilerDiagnostics(compile.spawnError ? '' : compile.stderr),
        timedOut: compile.timedOut,
        outputLimitExceeded: compile.outputLimitExceeded
      });
      return null;
    }

    // Surface compiler warnings even on a successful build.
    const warnings = parseCompilerDiagnostics(compile.stderr);
    if (warnings.length) handlers.onCompileWarning?.(warnings);

    const child = spawn('/usr/bin/sandbox-exec', [
      '-p', sandboxProfile(workDir), '/usr/bin/stdbuf', '-o0', '-e0', executablePath
    ], {
      cwd: workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    });

    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let outputBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let settled = false;

    const session = {
      id,
      child,
      workDir,
      temporaryDir,
      timedOut: () => timedOut
    };

    const cleanup = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      await rm(temporaryDir, { recursive: true, force: true }).catch(() => {});
      sessions.delete(id);
    };

    const kill = () => killProcessGroup(child);

    child.stdout.on('data', chunk => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        outputLimitExceeded = true;
        handlers.onStderr?.('\n[output limit exceeded; process terminated]\n');
        kill();
        return;
      }
      handlers.onStdout?.(chunk.toString('utf8'));
    });
    child.stderr.on('data', chunk => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        outputLimitExceeded = true;
        handlers.onStderr?.('\n[output limit exceeded; process terminated]\n');
        kill();
        return;
      }
      handlers.onStderr?.(chunk.toString('utf8'));
    });
    child.on('error', error => {
      handlers.onError?.(error.message);
    });
    child.on('close', (code, signal) => {
      const result = {
        success: !timedOut && code === 0 && !outputLimitExceeded,
        phase: 'run',
        exitCode: timedOut ? null : code,
        signal: timedOut ? 'SIGKILL' : signal,
        timedOut,
        outputLimitExceeded
      };
      handlers.onExit?.(result);
      cleanup();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      handlers.onStderr?.('\n[runtime limit exceeded; process terminated]\n');
      kill();
    }, options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
    timer.unref?.();
    session.timer = timer;
    session.kill = kill;

    // stdin helpers
    session.writeInput = (data) => {
      try { child.stdin.write(data); return true; } catch { return false; }
    };
    session.endInput = () => {
      try { child.stdin.end(); return true; } catch { return false; }
    };

    sessions.set(id, session);
    handlers.onSession?.(id);
    return id;
  } catch (error) {
    await rm(temporaryDir, { recursive: true, force: true }).catch(() => {});
    handlers.onError?.(error instanceof Error ? error.message : 'Interactive session failed.');
    return null;
  }
}

export function writeSessionInput(id, data) {
  const s = sessions.get(id);
  if (!s) return false;
  return s.writeInput(data);
}

export function endSessionInput(id) {
  const s = sessions.get(id);
  if (!s) return false;
  return s.endInput();
}

export function cancelSession(id) {
  const s = sessions.get(id);
  if (!s) return false;
  try { s.kill(); } catch {}
  return true;
}