import React, { useRef, useEffect } from 'react';
import {
  FileCode, Play, Copy, Check, Trash2, Wand2, Loader2,
  AlertOctagon, AlertTriangle, Lightbulb, CornerDownLeft
} from 'lucide-react';
import { CodeIssue } from '../types/analysis';
import { ASTNode } from '../types/ast';
import { CompileConsole, type CompileConsoleHandle } from './CompileConsole';

interface EditorPanelProps {
  code: string;
  onChange: (newCode: string) => void;
  issues: CodeIssue[];
  activeNode: ASTNode | null;
  targetLine: number | null;
  onLineClick: (line: number) => void;
  onFormat: () => void;
  onResetToDefault: () => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  code,
  onChange,
  issues,
  activeNode,
  targetLine,
  onLineClick,
  onFormat,
  onResetToDefault
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<CompileConsoleHandle>(null);
  const codeRef = useRef(code);
  const [copied, setCopied] = React.useState(false);
  const [compilerDiags, setCompilerDiags] = React.useState<any[]>([]);

  const lines = code.split('\n');

  // Keep the latest buffer reachable from the keyboard shortcut without re-binding it.
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // Map issues by line for gutter icons
  const issueMap = React.useMemo(() => {
    const map = new Map<number, CodeIssue[]>();
    issues.forEach(issue => {
      const existing = map.get(issue.line) || [];
      existing.push(issue);
      map.set(issue.line, existing);
    });
    return map;
  }, [issues]);

  // Run is delegated to the console component (interactive streaming).
  const handleRun = () => {
    consoleRef.current?.run();
  };

  // ⌘/Ctrl + Enter runs the current buffer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        handleRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRun]);

  // Auto-pairing tables for brackets, braces, parens and quotes
  const OPENERS = '({["\'';
  const CLOSERS = ')}]"\'';
  const PAIR: Record<string, string> = {
    '(': ')',
    '{': '}',
    '[': ']',
    '"': '"',
    "'": "'"
  };

  const indentOfLine = (value: string, pos: number): string => {
    const lineStart = value.lastIndexOf('\\n', pos - 1) + 1;
    const match = value.slice(lineStart, pos).match(/^(\\s*)/);
    return match ? match[1] : '';
  };

  // Handle Tab, auto-brackets, smart Enter and Backspace in the textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const value = target.value;

    // Tab -> 4 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const newCode = value.substring(0, start) + '    ' + value.substring(end);
      onChange(newCode);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
      return;
    }

    // Brackets/braces/parens are unambiguous openers -> always pair
    if (e.key === '(' || e.key === '{' || e.key === '[') {
      e.preventDefault();
      const close = PAIR[e.key];

      if (start !== end) {
        const selected = value.substring(start, end);
        const newCode = value.substring(0, start) + e.key + selected + close + value.substring(end);
        onChange(newCode);
        setTimeout(() => {
          target.selectionStart = start + 1;
          target.selectionEnd = end + 1;
        }, 0);
        return;
      }

      const newCode = value.substring(0, start) + e.key + close + value.substring(end);
      onChange(newCode);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 1;
      }, 0);
      return;
    }

    // Quotes only auto-pair when starting a string (avoid doubling when closing)
    if (e.key === '"' || e.key === "'") {
      const prevChar = start > 0 ? value[start - 1] : '';
      const isStringStart =
        start === 0 ||
        /[\s({\[=,;:+\-*/%&|!]/.test(prevChar);

      if (value[start] === e.key) {
        // already a quote under cursor -> just move past it
        e.preventDefault();
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + 1;
        }, 0);
        return;
      }

      if (!isStringStart) {
        // fall through to default single-char insertion
      } else {
        e.preventDefault();
        const close = PAIR[e.key];

        if (start !== end) {
          const selected = value.substring(start, end);
          const newCode = value.substring(0, start) + e.key + selected + close + value.substring(end);
          onChange(newCode);
          setTimeout(() => {
            target.selectionStart = start + 1;
            target.selectionEnd = end + 1;
          }, 0);
          return;
        }

        const newCode = value.substring(0, start) + e.key + close + value.substring(end);
        onChange(newCode);
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + 1;
        }, 0);
        return;
      }
    }

    // Typing a closer that already sits under the cursor just advances past it
    if (CLOSERS.includes(e.key) && value[start] === e.key) {
      e.preventDefault();
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 1;
      }, 0);
      return;
    }

    // Backspace removes an empty matching pair in one keystroke
    if (e.key === 'Backspace' && start === end && start > 0) {
      const prev = value[start - 1];
      const next = value[start];
      if (PAIR[prev] === next) {
        e.preventDefault();
        const newCode = value.substring(0, start - 1) + value.substring(start + 1);
        onChange(newCode);
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start - 1;
        }, 0);
        return;
      }
    }

    // Smart Enter: split an empty {} block across two indented lines
    if (e.key === 'Enter') {
      const prevChar = value[start - 1];
      const nextChar = value[start];
      if (prevChar === '{' && nextChar === '}') {
        e.preventDefault();
        const indent = indentOfLine(value, start);
        const newCode =
          value.substring(0, start) +
          '\n' + indent + '    ' +
          '\n' + indent +
          value.substring(start);
        onChange(newCode);
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + 1 + indent.length + 4;
        }, 0);
        return;
      }
    }
  };

  // Synchronize scroll between textarea and gutter
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Copy code handler
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-scroll when targetLine changes
  useEffect(() => {
    if (targetLine !== null && textareaRef.current) {
      const lineHeight = 21; // approx px per line
      const targetScrollTop = (targetLine - 5) * lineHeight;
      textareaRef.current.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  }, [targetLine]);

  // Highlight range from activeNode
  const highlightedRange = activeNode
    ? { start: activeNode.lineStart, end: activeNode.lineEnd }
    : targetLine !== null
    ? { start: targetLine, end: targetLine }
    : null;

  return (
    <div className="flex flex-col h-full bg-[#0b0e14] text-slate-200 border-r border-[#30363d] overflow-hidden">
      {/* Editor Top Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#30363d] text-xs">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200 font-mono">source.c</span>
          <span className="text-[10px] text-slate-500 bg-[#0d1117] px-1.5 py-0.5 rounded border border-[#30363d]">
            C99 / GCC
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRun}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors active:scale-95"
            title="Compile with Apple Clang and run (⌘/Ctrl + Enter)"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Run</span>
          </button>

          <button
            onClick={onFormat}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-slate-300 hover:text-slate-100 transition-colors"
            title="Format / Auto-Indent Code"
          >
            <Wand2 className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Format</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-slate-300 hover:text-slate-100 transition-colors"
            title="Copy source code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>

          <button
            onClick={onResetToDefault}
            className="p-1 hover:bg-[#21262d] text-slate-400 hover:text-slate-200 rounded transition-colors"
            title="Reset to default C code"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Working Area */}
      <div className="flex-1 flex overflow-hidden relative font-mono text-[13px] leading-[21px]">
        {/* Gutter with line numbers and hazard markers */}
        <div
          ref={gutterRef}
          className="w-12 bg-[#0d1117] border-r border-[#21262d] py-3 text-right select-none overflow-hidden shrink-0 flex flex-col text-slate-500"
        >
          {lines.map((_, index) => {
            const lineNum = index + 1;
            const lineIssues = issueMap.get(lineNum) || [];
            const lineDiags = compilerDiags.filter(d => d.line === lineNum);
            const hasCompileError = lineDiags.some(d => d.severity === 'error');
            const hasCompileWarning = lineDiags.some(d => d.severity === 'warning' || d.severity === 'note');
            const hasCritical = hasCompileError || lineIssues.some(i => i.severity === 'critical');
            const hasWarning = !hasCompileError && (hasCompileWarning || lineIssues.some(i => i.severity === 'warning'));
            const isHighlighted =
              highlightedRange &&
              lineNum >= highlightedRange.start &&
              lineNum <= highlightedRange.end;

            return (
              <div
                key={lineNum}
                onClick={() => onLineClick(lineNum)}
                className={`h-[21px] pr-2 flex items-center justify-end gap-1 cursor-pointer transition-colors ${
                  isHighlighted ? 'text-cyan-300 font-bold bg-cyan-950/40' : 'hover:text-slate-300'
                }`}
                title={
                  lineDiags.length > 0
                    ? lineDiags.map(d => `${String(d.severity).toUpperCase()}: ${d.message}`).join('\n')
                    : lineIssues.length > 0
                    ? lineIssues.map(i => `${i.severity.toUpperCase()}: ${i.title}`).join('\n')
                    : `Line ${lineNum}`
                }
              >
                {hasCritical ? (
                  <AlertOctagon className="w-3 h-3 text-rose-500 shrink-0 animate-pulse" />
                ) : hasWarning ? (
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                ) : null}
                <span className="text-[11px]">{lineNum}</span>
              </div>
            );
          })}
        </div>

        {/* Textarea code editor with overlay highlight highlights */}
        <div className="flex-1 relative overflow-hidden bg-[#0b0e14]">
          {/* Visual Highlight Underlay for AST selected lines */}
          <div
            className="absolute inset-0 pointer-events-none py-3 pl-3 pr-4 overflow-hidden"
            style={{
              transform: `translateY(-${textareaRef.current?.scrollTop || 0}px)`
            }}
          >
            {lines.map((_, index) => {
              const lineNum = index + 1;
              const lineIssues = issueMap.get(lineNum) || [];
              const hasCritical = lineIssues.some(i => i.severity === 'critical');
              const hasWarning = lineIssues.some(i => i.severity === 'warning');

              const isASTSelected =
                highlightedRange &&
                lineNum >= highlightedRange.start &&
                lineNum <= highlightedRange.end;

              let bgClass = '';
              if (isASTSelected) {
                bgClass = 'line-highlighted';
              } else if (hasCritical) {
                bgClass = 'line-danger';
              } else if (hasWarning) {
                bgClass = 'line-warning';
              }

              return (
                <div
                  key={lineNum}
                  className={`h-[21px] w-full transition-colors ${bgClass}`}
                />
              );
            })}
          </div>

          {/* Actual Code Textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="absolute inset-0 w-full h-full bg-transparent text-slate-100 font-mono text-[13px] leading-[21px] py-3 pl-3 pr-4 resize-none focus:outline-none select-text whitespace-pre overflow-auto z-10"
            placeholder="// Paste or write C code here..."
          />
        </div>
      </div>

      {/* Compile & Run Console (interactive) */}
      <CompileConsole ref={consoleRef} code={code} onSelectLine={onLineClick} onDiagnosticsChange={setCompilerDiags} />

      {/* Editor Status Footer */}
      <div className="px-3 py-1.5 bg-[#161b22] border-t border-[#30363d] flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span>{lines.length} lines</span>
          <span>•</span>
          <span>{code.length} chars</span>
          {activeNode && (
            <>
              <span>•</span>
              <span className="text-cyan-400">
                Focus: {activeNode.type} (L{activeNode.lineStart}-{activeNode.lineEnd})
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {issues.length > 0 ? (
            <span className="text-rose-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping" />
              {issues.length} {issues.length === 1 ? 'Diagnostic' : 'Diagnostics'}
            </span>
          ) : (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              All static checks passed
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
