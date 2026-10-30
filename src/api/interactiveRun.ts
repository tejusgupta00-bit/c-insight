import type { CompileRunResult } from '../types/compile';

export interface InteractiveHandlers {
  onSession?: (id: string) => void;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onCompileWarning?: (diagnostics: unknown[]) => void;
  onCompileError?: (result: unknown) => void;
  onExit?: (result: CompileRunResult) => void;
  onError?: (message: string) => void;
}

export interface RunController {
  sendInput: (data: string) => void;
  endInput: () => void;
  cancel: () => void;
}

interface DesktopBridge {
  startCompileRun?: (source: string) => Promise<{ id: string | null; [k: string]: unknown }>;
  writeCompileRunInput?: (id: string, data: string, end?: boolean) => Promise<unknown>;
  cancelCompileRun?: (id: string) => Promise<unknown>;
  onCompileRunEvent?: (cb: (payload: unknown) => void) => () => void;
}

export async function startInteractiveRun(
  source: string,
  handlers: InteractiveHandlers
): Promise<RunController | null> {
  const bridge = (window as unknown as { cinsight?: DesktopBridge }).cinsight;
  if (bridge?.startCompileRun) {
    return startElectron(source, handlers, bridge);
  }
  return startWeb(source, handlers);
}

async function startWeb(source: string, handlers: InteractiveHandlers): Promise<RunController | null> {
  let sessionId: string | null = null;
  const pendingInput: string[] = [];
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const flushPending = () => {
    while (pendingInput.length && sessionId) {
      const data = pendingInput.shift() as string;
      fetch('/api/compile-run/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, data })
      }).catch(() => {});
    }
  };

  const sendInput = (data: string) => {
    if (sessionId) {
      fetch('/api/compile-run/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, data })
      }).catch(() => {});
    } else {
      pendingInput.push(data);
    }
  };

  try {
    const res = await fetch('/api/compile-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ source }),
      signal: controller.signal
    });
    if (!res.ok || !res.body) {
      handlers.onError?.(`HTTP ${res.status}`);
      return null;
    }
    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader!.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            let eventType = 'message';
            let dataStr = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) eventType = line.slice(6).trim();
              else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            let data: any;
            try { data = JSON.parse(dataStr); } catch { continue; }
            if (eventType === 'session') {
              sessionId = data.id;
              handlers.onSession?.(data.id);
              flushPending();
            } else if (eventType === 'stdout') handlers.onStdout?.(data.text);
            else if (eventType === 'stderr') handlers.onStderr?.(data.text);
            else if (eventType === 'compile-warning') handlers.onCompileWarning?.(data.diagnostics);
            else if (eventType === 'compile-error') handlers.onCompileError?.(data);
            else if (eventType === 'exit') handlers.onExit?.(data);
            else if (eventType === 'error') handlers.onError?.(data.message);
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) handlers.onError?.(e instanceof Error ? e.message : 'stream error');
      }
    })();
  } catch (e) {
    handlers.onError?.(e instanceof Error ? e.message : 'request failed');
    return null;
  }

  return {
    sendInput: (data) => sendInput(data),
    endInput: () => {
      if (sessionId) {
        fetch('/api/compile-run/input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: sessionId, data: '', end: true })
        }).catch(() => {});
      }
    },
    cancel: () => {
      controller.abort();
      if (sessionId) {
        fetch('/api/compile-run/cancel' , { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sessionId }) }).catch(() => {});
      }
    }
  };
}

async function startElectron(source: string, handlers: InteractiveHandlers, bridge: DesktopBridge): Promise<RunController | null> {
  let sessionId: string | null = null;
  let unsubscribe: (() => void) | null = null;

  const result = await bridge.startCompileRun!(source);
  if (!result || !result.id) {
    if (result && (result as any).stderr) handlers.onCompileError?.(result);
    else handlers.onError?.('Failed to start session.');
    return null;
  }
  sessionId = result.id as string;
  handlers.onSession?.(sessionId);

  unsubscribe = bridge.onCompileRunEvent?.((payload: any) => {
    if (!payload || payload.id !== sessionId) return;
    switch (payload.type) {
      case 'stdout': handlers.onStdout?.(payload.text); break;
      case 'stderr': handlers.onStderr?.(payload.text); break;
      case 'compile-warning': handlers.onCompileWarning?.(payload.diagnostics); break;
      case 'compile-error': handlers.onCompileError?.(payload); break;
      case 'exit': handlers.onExit?.(payload); break;
      case 'error': handlers.onError?.(payload.message); break;
    }
  }) || null;

  return {
    sendInput: (data) => { if (sessionId) bridge.writeCompileRunInput?.(sessionId, data); },
    endInput: () => { if (sessionId) bridge.writeCompileRunInput?.(sessionId, '', true); },
    cancel: () => {
      if (sessionId) bridge.cancelCompileRun?.(sessionId);
      unsubscribe?.();
    }
  };
}