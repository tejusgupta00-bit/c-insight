export interface InteractiveHandlers {
  onSession?: (id: string) => void;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onCompileError?: (result: { stderr: string; diagnostics: any[]; timedOut?: boolean; outputLimitExceeded?: boolean }) => void;
  onCompileWarning?: (diagnostics: any[]) => void;
  onExit?: (result: any) => void;
  onError?: (message: string) => void;
}

export interface InteractiveOptions {
  compileTimeoutMs?: number;
  runTimeoutMs?: number;
}

export function startInteractiveSession(
  source: string,
  handlers: InteractiveHandlers,
  options?: InteractiveOptions
): Promise<string | null>;

export function writeSessionInput(id: string, data: string): boolean;
export function endSessionInput(id: string): boolean;
export function cancelSession(id: string): boolean;