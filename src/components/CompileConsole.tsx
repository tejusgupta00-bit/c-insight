import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import {
  Terminal, Trash2, ChevronDown, ChevronUp, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Clock, Send
} from 'lucide-react';
import { startInteractiveRun, type RunController } from '../api/interactiveRun';

export interface CompileConsoleHandle {
  run: () => void;
}

interface CompileConsoleProps {
  code: string;
  onSelectLine: (line: number) => void;
  onDiagnosticsChange?: (diagnostics: any[]) => void;
}

interface RunState {
  status: 'idle' | 'compiling' | 'running' | 'finished';
  stdout: string;
  stderr: string;
  compileError: { stderr?: string; diagnostics?: any[] } | null;
  exitResult: { success?: boolean; exitCode?: number | null; timedOut?: boolean; outputLimitExceeded?: boolean } | null;
  requestError: string | null;
  sessionId: string | null;
}

const emptyState: RunState = {
  status: 'idle',
  stdout: '',
  stderr: '',
  compileError: null,
  exitResult: null,
  requestError: null,
  sessionId: null
};

export const CompileConsole = forwardRef<CompileConsoleHandle, CompileConsoleProps>(
  ({ code, onSelectLine, onDiagnosticsChange }, ref) => {
    const [run, setRun] = useState<RunState>(emptyState);
    const [collapsed, setCollapsed] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const controllerRef = useRef<RunController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Keep latest code reachable without re-binding.
    const codeRef = useRef(code);
    useEffect(() => { codeRef.current = code; }, [code]);

    // Auto-scroll output to bottom.
    useEffect(() => {
      if (collapsed) return;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, [run.stdout, run.stderr, run.status, collapsed]);

    // Focus the input when a session becomes active.
    useEffect(() => {
      if (run.status === 'running') inputRef.current?.focus();
    }, [run.status]);

    const handleRun = async () => {
      controllerRef.current?.cancel();
      controllerRef.current = null;
      setCollapsed(false);
      setRun({ ...emptyState, status: 'compiling' });
      setInputValue('');
      onDiagnosticsChange?.([]);

      const ctrl = await startInteractiveRun(codeRef.current, {
        onSession: (id) => { onDiagnosticsChange?.([]); setRun(prev => ({ ...prev, sessionId: id, status: 'running' })); },
        onStdout: (text) => setRun(prev => ({ ...prev, stdout: prev.stdout + text })),
        onStderr: (text) => setRun(prev => ({ ...prev, stderr: prev.stderr + text })),
        onCompileWarning: (diags: any[]) => onDiagnosticsChange?.(diags ?? []),
        onCompileError: (result: any) => { onDiagnosticsChange?.(result?.diagnostics ?? []); setRun(prev => ({ ...prev, status: 'finished', compileError: result })); },
        onExit: (result: any) => setRun(prev => ({ ...prev, status: 'finished', exitResult: result, sessionId: null })),
        onError: (message) => setRun(prev => ({ ...prev, status: 'finished', requestError: message, sessionId: null }))
      });

      controllerRef.current = ctrl;
      if (!ctrl) {
        setRun(prev => (prev.status === 'compiling' ? { ...prev, status: 'finished', requestError: prev.requestError || 'Failed to start.' } : prev));
      }
    };

    useImperativeHandle(ref, () => ({ run: handleRun }), [handleRun]);

    const handleSendInput = () => {
      const value = inputValue;
      setInputValue('');
      // Echo the typed input into the output so it reads like a terminal.
      setRun(prev => ({ ...prev, stdout: prev.stdout + value + '\n' }));
      controllerRef.current?.sendInput(value + '\n');
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSendInput();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setRun(prev => ({ ...prev, stdout: prev.stdout + inputValue }));
        controllerRef.current?.endInput();
        setInputValue('');
      }
    };

    const handleClear = () => {
      controllerRef.current?.cancel();
      controllerRef.current = null;
      setRun(emptyState);
      setInputValue('');
    };

    const statusChip = (() => {
      if (run.status === 'compiling') {
        return { icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'Compiling…', className: 'text-sky-300 border-sky-800 bg-sky-950/60' };
      }
      if (run.status === 'running') {
        return { icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'Running', className: 'text-emerald-300 border-emerald-800 bg-emerald-950/60' };
      }
      if (run.requestError) {
        return { icon: <XCircle className="w-3 h-3" />, label: 'Service error', className: 'text-rose-300 border-rose-800 bg-rose-950/60' };
      }
      if (!run.exitResult && !run.compileError) return null;
      if (run.compileError) {
        return { icon: <XCircle className="w-3 h-3" />, label: 'Build failed', className: 'text-rose-300 border-rose-800 bg-rose-950/60' };
      }
      const r = run.exitResult!;
      if (r.timedOut) return { icon: <Clock className="w-3 h-3" />, label: 'Runtime timeout', className: 'text-amber-300 border-amber-800 bg-amber-950/60' };
      if (r.outputLimitExceeded) return { icon: <AlertTriangle className="w-3 h-3" />, label: 'Output limit hit', className: 'text-amber-300 border-amber-800 bg-amber-950/60' };
      if (r.success) return { icon: <CheckCircle2 className="w-3 h-3" />, label: 'Exited 0', className: 'text-emerald-300 border-emerald-800 bg-emerald-950/60' };
      return { icon: <XCircle className="w-3 h-3" />, label: `Exited ${r.exitCode ?? '—'}`, className: 'text-rose-300 border-rose-800 bg-rose-950/60' };
    })();

    const diagnostics = run.compileError?.diagnostics ?? [];

    return (
      <div className="shrink-0 flex flex-col bg-[#0b0e14] border-t border-[#30363d]">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] text-xs select-none">
          <div className="flex items-center gap-2 min-w-0">
            <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-slate-300">Console</span>
            {statusChip && (
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${statusChip.className}`}>
                {statusChip.icon}
                {statusChip.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleClear} className="p-1 hover:bg-[#21262d] text-slate-400 hover:text-slate-200 rounded transition-colors" title="Clear console output">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setCollapsed(v => !v)} className="p-1 hover:bg-[#21262d] text-slate-400 hover:text-slate-200 rounded transition-colors" title={collapsed ? 'Expand console' : 'Collapse console'}>
              {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            <div ref={scrollRef} className="overflow-auto font-mono text-[11.5px] leading-[18px] px-3 py-2 h-[150px] bg-[#0b0e14]">
              {run.status === 'idle' && (
                <p className="text-slate-500">
                  Press <span className="text-slate-300">Run</span> or{' '}
                  <span className="text-slate-300">⌘/Ctrl + Enter</span> to compile with Apple Clang
                  (<span className="text-slate-400">-std=c99 -Wall -Wextra</span>) and run interactively.
                  Type input in the box below when the program asks for it.
                </p>
              )}

              {run.status === 'compiling' && (
                <p className="text-sky-300">▸ Compiling source.c…</p>
              )}

              {run.requestError && (
                <div className="text-rose-400">
                  <p className="font-semibold">Compile service unavailable</p>
                  <p className="text-rose-300/80 whitespace-pre-wrap break-words">{run.requestError}</p>
                </div>
              )}

              {run.compileError && (
                <div className="space-y-0.5">
                  <p className="text-slate-500">Build diagnostics</p>
                  {diagnostics.length > 0 ? diagnostics.map((d: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => onSelectLine(d.line)}
                      title="Jump to this line in the editor"
                      className="block w-full text-left hover:bg-[#161b22] rounded px-1 -mx-1 whitespace-pre-wrap break-words"
                    >
                      <span className="text-slate-500">source.c:{d.line}{d.column ? `:${d.column}` : ''}:</span>{' '}
                      <span className={d.severity === 'error' ? 'text-rose-400' : d.severity === 'warning' ? 'text-amber-400' : 'text-sky-400'}>{d.severity}:</span>{' '}
                      <span className="text-slate-300">{d.message}</span>
                    </button>
                  )) : (
                    <pre className="text-rose-400 whitespace-pre-wrap break-words">{run.compileError.stderr || 'Compilation failed.'}</pre>
                  )}
                </div>
              )}

              {(run.stdout || run.stderr) && (
                <div className="whitespace-pre-wrap break-words">
                  {run.stdout && <span className="text-slate-100">{run.stdout}</span>}
                  {run.stderr && <span className="text-amber-300">{run.stderr}</span>}
                </div>
              )}

              {run.exitResult && (
                <p className="text-slate-500 pt-1 border-t border-[#21262d]">
                  exit code <span className={run.exitResult.success ? 'text-emerald-400' : 'text-rose-400'}>
                    {run.exitResult.timedOut ? 'killed (timeout)' : (run.exitResult.exitCode ?? '—')}
                  </span>
                  {run.exitResult.outputLimitExceeded ? ' · output limit hit' : ''}
                </p>
              )}
              {/* Interactive input is taken inline, inside the output area */}
              {run.status === 'running' && (
                <div className="flex items-center gap-1">
                  <span className="text-emerald-400 font-mono text-[11.5px] select-none">›</span>
                  <input
                    ref={inputRef}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder=""
                    className="flex-1 bg-transparent text-slate-100 font-mono text-[11.5px] focus:outline-none caret-emerald-400 min-w-0"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);

CompileConsole.displayName = 'CompileConsole';