import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ASTNode } from '../types/ast';
import { CodeIssue } from '../types/analysis';
import {
  ChevronRight, ChevronDown, Search, Code2, Repeat,
  Box, Layers, GitBranch, AlertTriangle, AlertOctagon,
  Eye, Copy, Check, MemoryStick, FileSymlink, Braces,
  Hash, ArrowDownToLine, CircleDot, Minus
} from 'lucide-react';

/* ─────────────────────────────────────────
   TYPES
──────────────────────────────────────────*/
export interface VisualTreeProps {
  ast: ASTNode;
  issues?: CodeIssue[];
  selectedLine?: number | null;
  activeNode?: ASTNode | null;
  onSelectNode?: (node: ASTNode | null) => void;
  onLineClick?: (line: number) => void;
}

type NodeColor = 'function' | 'loop' | 'variable' | 'warning' | 'critical' | 'dim';

interface NodeStyle {
  // Card
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  cardHover: string;
  cardSelected: string;
  // Badge
  badgeBg: string;
  badgeText: string;
  // Text
  labelText: string;
  // Flow line color (CSS value, not Tailwind)
  flowColor: string;
  // Icon
  icon: React.ReactNode;
  label: string;
}

/* ─────────────────────────────────────────
   COLOR PALETTE
   • Functions  → Blue
   • Loops      → Purple
   • Variables  → Green (emerald)
   • Warnings   → Amber
   • Critical   → Rose-Red
   • Other      → Dim slate
──────────────────────────────────────────*/
const STYLES: Record<NodeColor, NodeStyle> = {
  function: {
    cardBg:       'bg-[#0c1829]',
    cardBorder:   'border-blue-500/40',
    cardShadow:   'shadow-blue-950/60',
    cardHover:    'hover:border-blue-400/70 hover:shadow-blue-900/40',
    cardSelected: 'border-blue-400 shadow-[0_0_22px_rgba(59,130,246,0.35)]',
    badgeBg:      'bg-blue-900/60 border-blue-500/50 text-blue-300',
    badgeText:    'text-blue-100',
    labelText:    'text-blue-100',
    flowColor:    'rgba(59,130,246,0.55)',
    icon:         <Code2 className="w-3.5 h-3.5 text-blue-400" />,
    label:        'Function',
  },
  loop: {
    cardBg:       'bg-[#120e24]',
    cardBorder:   'border-purple-500/40',
    cardShadow:   'shadow-purple-950/60',
    cardHover:    'hover:border-purple-400/70 hover:shadow-purple-900/40',
    cardSelected: 'border-purple-400 shadow-[0_0_22px_rgba(168,85,247,0.35)]',
    badgeBg:      'bg-purple-900/60 border-purple-500/50 text-purple-300',
    badgeText:    'text-purple-100',
    labelText:    'text-purple-100',
    flowColor:    'rgba(168,85,247,0.55)',
    icon:         <Repeat className="w-3.5 h-3.5 text-purple-400" />,
    label:        'Loop',
  },
  variable: {
    cardBg:       'bg-[#081a12]',
    cardBorder:   'border-emerald-500/40',
    cardShadow:   'shadow-emerald-950/60',
    cardHover:    'hover:border-emerald-400/70 hover:shadow-emerald-900/40',
    cardSelected: 'border-emerald-400 shadow-[0_0_22px_rgba(16,185,129,0.35)]',
    badgeBg:      'bg-emerald-900/60 border-emerald-500/50 text-emerald-300',
    badgeText:    'text-emerald-100',
    labelText:    'text-emerald-100',
    flowColor:    'rgba(16,185,129,0.55)',
    icon:         <Box className="w-3.5 h-3.5 text-emerald-400" />,
    label:        'Variable',
  },
  warning: {
    cardBg:       'bg-[#1c1200]',
    cardBorder:   'border-amber-500/60',
    cardShadow:   'shadow-amber-950/60',
    cardHover:    'hover:border-amber-400/80 hover:shadow-amber-900/40',
    cardSelected: 'border-amber-400 shadow-[0_0_22px_rgba(245,158,11,0.4)]',
    badgeBg:      'bg-amber-900/70 border-amber-500/60 text-amber-300',
    badgeText:    'text-amber-100',
    labelText:    'text-amber-100',
    flowColor:    'rgba(245,158,11,0.55)',
    icon:         <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
    label:        'Warning',
  },
  critical: {
    cardBg:       'bg-[#1a0810]',
    cardBorder:   'border-rose-500/70',
    cardShadow:   'shadow-rose-950/60',
    cardHover:    'hover:border-rose-400/80 hover:shadow-rose-900/40',
    cardSelected: 'border-rose-400 shadow-[0_0_22px_rgba(244,63,94,0.45)]',
    badgeBg:      'bg-rose-900/70 border-rose-500/60 text-rose-300',
    badgeText:    'text-rose-100',
    labelText:    'text-rose-100',
    flowColor:    'rgba(244,63,94,0.6)',
    icon:         <AlertOctagon className="w-3.5 h-3.5 text-rose-400 animate-pulse" />,
    label:        'Hazard',
  },
  dim: {
    cardBg:       'bg-[#0d1017]',
    cardBorder:   'border-slate-700/40',
    cardShadow:   'shadow-black/40',
    cardHover:    'hover:border-slate-500/60',
    cardSelected: 'border-slate-400 shadow-[0_0_18px_rgba(100,116,139,0.3)]',
    badgeBg:      'bg-slate-800/70 border-slate-700 text-slate-400',
    badgeText:    'text-slate-200',
    labelText:    'text-slate-300',
    flowColor:    'rgba(100,116,139,0.35)',
    icon:         <Layers className="w-3.5 h-3.5 text-slate-500" />,
    label:        'Node',
  },
};

/* ─────────────────────────────────────────
   NODE CLASSIFICATION
──────────────────────────────────────────*/
function classify(node: ASTNode, issues: CodeIssue[]): {
  color: NodeColor;
  hits: CodeIssue[];
} {
  const hits = issues.filter(
    iss => iss.line >= node.lineStart && iss.line <= node.lineEnd
  );
  const hasCrit = hits.some(h => h.severity === 'critical');
  const hasWarn = hits.some(h => h.severity === 'warning');

  if (hasCrit)  return { color: 'critical', hits };
  if (hasWarn)  return { color: 'warning',  hits };

  const { type, category } = node;

  // Functions — Blue
  if (
    category === 'function' ||
    type === 'FunctionDefinition' ||
    type === 'FunctionDeclaration' ||
    type === 'FunctionCall' ||
    type === 'ParameterList'
  ) return { color: 'function', hits };

  // Loops — Purple
  if (
    category === 'loop' ||
    type === 'ForStatement' ||
    type === 'WhileStatement' ||
    type === 'DoWhileStatement'
  ) return { color: 'loop', hits };

  // Variables / Declarations / Memory — Green
  if (
    category === 'declaration' ||
    category === 'memory' ||
    type === 'VariableDeclaration' ||
    type === 'Parameter' ||
    type === 'Identifier' ||
    type === 'TypeSpecifier' ||
    node.metadata?.isMemoryAllocation
  ) return { color: 'variable', hits };

  return { color: 'dim', hits };
}

/* ─────────────────────────────────────────
   SECONDARY ICON by AST type
──────────────────────────────────────────*/
function typeIcon(type: string): React.ReactNode {
  if (type.includes('For') || type.includes('While')) return <Repeat className="w-3 h-3 opacity-60" />;
  if (type.includes('If') || type.includes('Else'))   return <GitBranch className="w-3 h-3 opacity-60" />;
  if (type.includes('Return'))                         return <ArrowDownToLine className="w-3 h-3 opacity-60" />;
  if (type.includes('Variable') || type.includes('Param')) return <Hash className="w-3 h-3 opacity-60" />;
  if (type.includes('Function'))                       return <Braces className="w-3 h-3 opacity-60" />;
  if (type.includes('Call'))                           return <FileSymlink className="w-3 h-3 opacity-60" />;
  if (type.includes('malloc') || type.includes('Memory') || type.includes('free')) return <MemoryStick className="w-3 h-3 opacity-60" />;
  if (type === 'CompoundStatement')                    return <Braces className="w-3 h-3 opacity-60" />;
  return <CircleDot className="w-3 h-3 opacity-40" />;
}

/* ─────────────────────────────────────────
   ROOT COMPONENT
──────────────────────────────────────────*/
export const VisualTree: React.FC<VisualTreeProps> = ({
  ast,
  issues = [],
  selectedLine,
  activeNode,
  onSelectNode,
  onLineClick,
}) => {
  const [collapsed, setCollapsed]       = useState<Set<string>>(new Set());
  const [search,    setSearch]          = useState('');
  const [viewMode,  setViewMode]        = useState<'tree' | 'json'>('tree');
  const [copiedJson, setCopiedJson]     = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const critCount = issues.filter(i => i.severity === 'critical').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;

  /* Expand all path to activeNode automatically */
  useEffect(() => {
    if (!activeNode) return;
    const toOpen: string[] = [];
    function walk(n: ASTNode, path: string[]): boolean {
      if (n.id === activeNode?.id) { toOpen.push(...path); return true; }
      for (const c of n.children) {
        if (walk(c, [...path, n.id])) return true;
      }
      return false;
    }
    walk(ast, []);
    if (toOpen.length > 0) {
      setCollapsed(prev => {
        const next = new Set(prev);
        toOpen.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [activeNode, ast]);

  const toggle = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCollapsed(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const s = new Set<string>();
    function walk(n: ASTNode) {
      if (n.children.length && n.id !== 'root') s.add(n.id);
      n.children.forEach(walk);
    }
    walk(ast);
    setCollapsed(s);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(ast, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#090c12] text-slate-100 overflow-hidden">

      {/* ── TOOLBAR ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-[#0e1219] border-b border-slate-800 flex-wrap shrink-0 z-10">

        {/* Left: title + view toggle */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
            <span className="text-xs font-bold tracking-tight text-slate-100">AST Node Map</span>
          </div>

          <div className="flex items-center bg-[#090c12] border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all duration-150 ${
                viewMode === 'tree'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Visual Tree
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all duration-150 ${
                viewMode === 'json'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              JSON AST
            </button>
          </div>
        </div>

        {/* Center: legend pills */}
        <div className="hidden xl:flex items-center gap-1.5 font-mono">
          <LegendPill color="#3b82f6" label="Functions" glow />
          <LegendPill color="#a855f7" label="Loops" glow />
          <LegendPill color="#10b981" label="Variables" glow />
          {critCount > 0 && <LegendPill color="#f43f5e" label={`${critCount} Critical`} pulse />}
          {warnCount > 0 && <LegendPill color="#f59e0b" label={`${warnCount} Warnings`} />}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1.5">
          {viewMode === 'tree' ? (
            <>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2.5 top-[7px] text-slate-500" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter nodes…"
                  className="bg-[#090c12] border border-slate-800 text-[11px] text-slate-200 placeholder-slate-600 rounded-lg pl-8 pr-2 py-1 w-36 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                />
              </div>
              <ToolbarBtn onClick={expandAll}>Expand</ToolbarBtn>
              <ToolbarBtn onClick={collapseAll}>Collapse</ToolbarBtn>
            </>
          ) : (
            <button
              onClick={copyJson}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-[#0e1219] hover:bg-[#161d2c] border border-slate-800 text-slate-300 rounded-lg transition-colors"
            >
              {copiedJson
                ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
                : <><Copy className="w-3 h-3" /><span>Copy JSON</span></>}
            </button>
          )}
        </div>
      </div>

      {/* ── CANVAS ──────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-auto p-4"
        style={{ background: 'radial-gradient(circle at 18% 28%, rgba(59,130,246,0.04) 0%, transparent 60%), radial-gradient(circle at 82% 72%, rgba(168,85,247,0.04) 0%, transparent 60%), #090c12' }}
      >
        {viewMode === 'tree' ? (
          <div className="pb-20 space-y-0">
            <NodeCard
              node={ast}
              depth={0}
              issues={issues}
              search={search}
              activeNode={activeNode}
              collapsed={collapsed}
              onToggle={toggle}
              onSelect={n => { onSelectNode?.(n); onLineClick?.(n.lineStart); }}
              onJump={onLineClick}
              isLast={true}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-[#0b0e14] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 bg-[#0e1219] border-b border-slate-800">
              <span className="text-[11px] font-mono text-slate-400">Abstract Syntax Tree — JSON</span>
              <span className="text-[10px] text-slate-600 font-mono">{JSON.stringify(ast).length.toLocaleString()} chars</span>
            </div>
            <pre className="font-mono text-[11px] leading-5 text-slate-300 p-4 select-text whitespace-pre overflow-x-auto">
              {JSON.stringify(ast, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ── ACTIVE NODE DRAWER ──────────────────────────────── */}
      {activeNode && (() => {
        const { color, hits } = classify(activeNode, issues);
        const s = STYLES[color];
        return (
          <div className={`shrink-0 ${s.cardBg} border-t ${s.cardBorder} px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xl z-20`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border font-mono ${s.badgeBg}`}>
                {s.icon} {s.label}
              </span>
              <span className={`text-xs font-mono font-semibold truncate ${s.labelText}`}>{activeNode.label}</span>
              <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                {activeNode.type} · L{activeNode.lineStart}–{activeNode.lineEnd}
              </span>
              {hits.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/60 text-rose-300 text-[10px] font-bold shrink-0">
                  {hits.length} {hits.length === 1 ? 'Issue' : 'Issues'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onLineClick?.(activeNode.lineStart)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors shadow"
              >
                <Eye className="w-3 h-3" /> Jump L{activeNode.lineStart}
              </button>
              <button
                onClick={() => onSelectNode?.(null)}
                className="px-2 py-1 text-[11px] bg-[#161c28] hover:bg-[#1e2636] text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

/* ─────────────────────────────────────────
   RECURSIVE NODE CARD
──────────────────────────────────────────*/
interface NodeCardProps {
  node: ASTNode;
  depth: number;
  issues: CodeIssue[];
  search: string;
  activeNode?: ASTNode | null;
  collapsed: Set<string>;
  onToggle: (id: string, e?: React.MouseEvent) => void;
  onSelect: (n: ASTNode) => void;
  onJump?: (line: number) => void;
  isLast: boolean;
}

const NodeCard: React.FC<NodeCardProps> = ({
  node, depth, issues, search, activeNode,
  collapsed, onToggle, onSelect, onJump, isLast,
}) => {
  const isCollapsed  = collapsed.has(node.id);
  const isSelected   = activeNode?.id === node.id;
  const hasKids      = node.children.length > 0;

  const { color, hits } = classify(node, issues);
  const s = STYLES[color];

  const matched = search
    ? node.label.toLowerCase().includes(search.toLowerCase()) ||
      node.type.toLowerCase().includes(search.toLowerCase()) ||
      node.detail?.toLowerCase().includes(search.toLowerCase())
    : false;

  return (
    <div className="flex">
      {/* Flow lines column (for depth > 0) */}
      {depth > 0 && (
        <div className="relative shrink-0 mr-3" style={{ width: 20 }}>
          {/* Vertical spine from parent */}
          <div
            className="absolute top-0 bottom-0 left-[9px] w-[2px]"
            style={{ background: `linear-gradient(to bottom, ${s.flowColor}, rgba(75,85,99,0.12))`, display: isLast ? 'none' : 'block' }}
          />
          {/* Elbow connector */}
          <div
            className="absolute top-[22px] left-[9px] w-[11px] h-[14px] border-l-2 border-b-2 rounded-bl-lg"
            style={{ borderColor: s.flowColor }}
          />
          {!isLast && (
            <div
              className="absolute top-0 left-[9px] h-[22px] w-[2px]"
              style={{ background: s.flowColor }}
            />
          )}
        </div>
      )}

      {/* Card + children wrapper */}
      <div className="flex-1 min-w-0 pb-2.5">
        {/* ── Card ── */}
        <div
          onClick={() => onSelect(node)}
          className={`
            group relative flex flex-col gap-2 p-3 rounded-xl border cursor-pointer
            transition-all duration-150 shadow-md
            ${s.cardBg} ${s.cardBorder} ${s.cardShadow} ${s.cardHover}
            ${isSelected  ? s.cardSelected : ''}
            ${matched && !isSelected ? 'border-yellow-400/70 shadow-[0_0_14px_rgba(234,179,8,0.2)]' : ''}
            max-w-[520px]
          `}
          style={{ minWidth: 240 }}
        >
          {/* Top row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Color badge */}
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border font-mono shrink-0 ${s.badgeBg}`}>
                {s.icon}
                {s.label}
              </span>
              {/* AST type chip */}
              <span className="text-[10px] text-slate-500 font-mono truncate flex items-center gap-1">
                {typeIcon(node.type)}
                {node.type}
              </span>
            </div>

            {/* Right: line badge + collapse toggle */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={e => { e.stopPropagation(); onJump?.(node.lineStart); }}
                className="text-[10px] font-mono text-slate-400 hover:text-cyan-300 bg-black/30 hover:bg-black/50 px-1.5 py-0.5 rounded border border-slate-700/40 transition-colors"
                title="Jump to this line in editor"
              >
                L{node.lineStart}{node.lineEnd !== node.lineStart ? `–${node.lineEnd}` : ''}
              </button>
              {hasKids && (
                <button
                  onClick={e => onToggle(node.id, e)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-700/40 bg-black/30 hover:bg-black/50 text-slate-400 text-[10px] font-mono transition-colors"
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed
                    ? <><ChevronRight className="w-3 h-3 text-cyan-400" /><span>+{node.children.length}</span></>
                    : <><ChevronDown className="w-3 h-3 text-slate-500" /><span>{node.children.length}</span></>}
                </button>
              )}
            </div>
          </div>

          {/* Label */}
          <span className={`text-xs font-mono font-semibold leading-snug break-all ${isSelected ? 'text-cyan-200' : s.labelText}`}>
            {node.label}
          </span>

          {/* Detail subtitle */}
          {node.detail && (
            <span className="text-[11px] text-slate-500 truncate -mt-1">{node.detail}</span>
          )}

          {/* Health warning strips — Amber / Red */}
          {hits.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-slate-700/40">
              {hits.map(hit => (
                <div
                  key={hit.id}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-[10px] font-mono ${
                    hit.severity === 'critical'
                      ? 'bg-rose-950/80 border border-rose-500/50 text-rose-200'
                      : 'bg-amber-950/80 border border-amber-500/50 text-amber-200'
                  }`}
                >
                  <span className="shrink-0 mt-0.5">
                    {hit.severity === 'critical'
                      ? <AlertOctagon className="w-3 h-3 text-rose-400" />
                      : <AlertTriangle className="w-3 h-3 text-amber-400" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold truncate block">{hit.title}</span>
                    {hit.cwe && (
                      <span className="text-[9px] opacity-60">{hit.cwe.split(':')[0]}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Children (recursive) ── */}
        {!isCollapsed && hasKids && (
          <div className="mt-2.5 pl-5 relative space-y-0">
            {/* Continuous vertical spine for children */}
            <div
              className="absolute left-[9px] top-0 w-[2px] rounded-full pointer-events-none"
              style={{
                bottom: '12px',
                background: `linear-gradient(to bottom, ${s.flowColor}, rgba(75,85,99,0.08))`
              }}
            />
            {node.children.map((child, idx) => (
              <NodeCard
                key={child.id}
                node={child}
                depth={depth + 1}
                issues={issues}
                search={search}
                activeNode={activeNode}
                collapsed={collapsed}
                onToggle={onToggle}
                onSelect={onSelect}
                onJump={onJump}
                isLast={idx === node.children.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────
   MICRO COMPONENTS
──────────────────────────────────────────*/
const LegendPill: React.FC<{ color: string; label: string; glow?: boolean; pulse?: boolean }> = ({
  color, label, glow, pulse
}) => (
  <span
    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono ${pulse ? 'animate-pulse' : ''}`}
    style={{
      borderColor: `${color}55`,
      backgroundColor: `${color}14`,
      color: `${color}cc`,
    }}
  >
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{ backgroundColor: color, boxShadow: glow ? `0 0 6px ${color}` : 'none' }}
    />
    {label}
  </span>
);

const ToolbarBtn: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="px-2 py-1 text-[11px] bg-[#0e1219] hover:bg-[#161d2c] border border-slate-800 text-slate-300 rounded-lg transition-colors"
  >
    {children}
  </button>
);

export default VisualTree;
