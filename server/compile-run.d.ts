export interface CompileAndRunOptions {
  compileTimeoutMs?: number;
  runTimeoutMs?: number;
  stdin?: string;
}

export interface CompileDiagnostic {
  file: string;
  line: number;
  column: number | null;
  severity: 'error' | 'warning' | 'note';
  message: string;
  raw: string;
}

export interface CompileAndRunResult {
  success: boolean;
  phase: 'compile' | 'run';
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  outputLimitExceeded?: boolean;
  signal?: string | null;
  diagnostics?: CompileDiagnostic[];
  durationMs?: number;
}

export function parseCompilerDiagnostics(stderr: string): CompileDiagnostic[];
export function compileAndRun(
  source: string,
  options?: CompileAndRunOptions
): Promise<CompileAndRunResult>;