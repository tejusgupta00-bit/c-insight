export type CompilePhase = 'compile' | 'run';

export type DiagnosticSeverity = 'error' | 'warning' | 'note';

export interface CompileDiagnostic {
  file: string;
  line: number;
  column: number | null;
  severity: DiagnosticSeverity;
  message: string;
  raw: string;
}

export interface CompileRunResult {
  success: boolean;
  phase: CompilePhase;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  outputLimitExceeded?: boolean;
  signal?: string | null;
  diagnostics?: CompileDiagnostic[];
  durationMs?: number;
}

export type RunStatus = 'idle' | 'running' | 'finished';

export interface RunState {
  status: RunStatus;
  result: CompileRunResult | null;
  requestError: string | null;
}

interface DesktopBridge {
  isDesktop?: boolean;
  compileAndRun?: (source: string, stdin?: string) => Promise<CompileRunResult>;
}

/** Compile & run via the Electron main process when available, else the Vite dev middleware. */
export async function requestCompileAndRun(
  code: string,
  stdin?: string,
  signal?: AbortSignal
): Promise<CompileRunResult> {
  const bridge = (window as unknown as { cinsight?: DesktopBridge }).cinsight;

  if (bridge?.compileAndRun) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await bridge.compileAndRun(code, stdin);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return result;
  }

  const response = await fetch('/api/compile-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: code, stdin }),
    signal
  });

  const payload = (await response.json().catch(() => null)) as (CompileRunResult & { error?: string }) | null;

  if (!response.ok) {
    throw new Error(payload?.error || `Compile service responded with HTTP ${response.status}.`);
  }
  if (!payload || typeof payload.phase !== 'string') {
    throw new Error('Compile service returned an unexpected response.');
  }

  return payload;
}