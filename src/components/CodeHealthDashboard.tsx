import React, { useState } from 'react';
import { AnalysisResult, CodeIssue, Severity, IssueCategory, AllocationTrace } from '../types/analysis';
import {
  ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon, Lightbulb,
  CheckCircle2, ArrowRight, Wrench, Activity, Database, GitBranch,
  Layers, ChevronDown, ChevronRight, Zap, Copy, Check
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CodeHealthDashboardProps {
  analysis: AnalysisResult;
  onJumpToLine: (line: number) => void;
  onApplyFix?: (issue: CodeIssue) => void;
}

export const CodeHealthDashboard: React.FC<CodeHealthDashboardProps> = ({
  analysis,
  onJumpToLine,
  onApplyFix
}) => {
  const [activeTab, setActiveTab] = useState<'issues' | 'memory' | 'metrics'>('issues');
  const [categoryFilter, setCategoryFilter] = useState<'all' | IssueCategory>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [copiedIssueId, setCopiedIssueId] = useState<string | null>(null);

  const { healthScore, letterGrade, summary, metrics, issues, allocations } = analysis;

  // Trigger confetti if high score
  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  // Filter issues
  const filteredIssues = issues.filter(issue => {
    if (categoryFilter !== 'all' && issue.category !== categoryFilter) return false;
    if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
    return true;
  });

  const criticalIssuesCount = issues.filter(i => i.severity === 'critical').length;
  const warningIssuesCount = issues.filter(i => i.severity === 'warning').length;
  const optIssuesCount = issues.filter(i => i.category === 'optimization').length;

  // Grade color
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return 'text-emerald-400 border-emerald-500/50 bg-emerald-950/40 shadow-emerald-500/20';
      case 'B':
        return 'text-blue-400 border-blue-500/50 bg-blue-950/40 shadow-blue-500/20';
      case 'C':
        return 'text-amber-400 border-amber-500/50 bg-amber-950/40 shadow-amber-500/20';
      case 'D':
      case 'F':
      default:
        return 'text-rose-400 border-rose-500/50 bg-rose-950/40 shadow-rose-500/20';
    }
  };

  const getScoreStroke = (score: number) => {
    if (score >= 85) return '#34d399';
    if (score >= 70) return '#60a5fa';
    if (score >= 50) return '#fbbf24';
    return '#f87171';
  };

  const copyFix = (issue: CodeIssue) => {
    if (issue.suggestedReplacement) {
      navigator.clipboard.writeText(issue.suggestedReplacement.replacementCode);
      setCopiedIssueId(issue.id);
      setTimeout(() => setCopiedIssueId(null), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#090c12] text-slate-200 overflow-hidden border-l border-slate-800">
      {/* Top Health Header & Summary */}
      <div className="p-4 bg-[#0e1219] border-b border-slate-800">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Circular Score Gauge */}
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  strokeDasharray={`${healthScore}, 100`}
                  stroke={getScoreStroke(healthScore)}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  className="transition-all duration-1000 ease-out"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-base font-bold font-mono text-slate-100 leading-none">
                  {healthScore}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">/100</span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">Code Health Rating</h2>
                <span
                  onClick={healthScore >= 90 ? triggerConfetti : undefined}
                  className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border shadow-md cursor-default ${getGradeColor(
                    letterGrade
                  )}`}
                >
                  Grade {letterGrade}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 max-w-md line-clamp-2">
                {summary}
              </p>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-center min-w-[70px]">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Mem Safety</span>
              <span className={`text-sm font-bold font-mono ${metrics.memorySafetyScore > 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {metrics.memorySafetyScore}%
              </span>
            </div>

            <div className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-center min-w-[70px]">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Complexity</span>
              <span className={`text-sm font-bold font-mono ${metrics.cyclomaticComplexity > 10 ? 'text-rose-400' : 'text-blue-400'}`}>
                V(G) {metrics.cyclomaticComplexity}
              </span>
            </div>

            <div className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-center min-w-[70px]">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Heap Allocs</span>
              <span className="text-sm font-bold font-mono text-purple-400">
                {allocations.length} ({metrics.freedCount} Freed)
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-4 mt-4 border-t border-[#30363d] pt-3 text-xs">
          <button
            onClick={() => setActiveTab('issues')}
            className={`flex items-center gap-1.5 pb-1 font-medium transition-colors border-b-2 ${
              activeTab === 'issues'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Diagnostics & Hazards ({issues.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('memory')}
            className={`flex items-center gap-1.5 pb-1 font-medium transition-colors border-b-2 ${
              activeTab === 'memory'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Memory Lifecycle Trace ({allocations.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('metrics')}
            className={`flex items-center gap-1.5 pb-1 font-medium transition-colors border-b-2 ${
              activeTab === 'metrics'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Complexity & Function Breakdown</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: '#090c12' }}>
        {/* TAB 1: ISSUES FEED */}
        {activeTab === 'issues' && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs pb-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 mr-1">Category:</span>
                {(['all', 'memory', 'optimization', 'security'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                      categoryFilter === cat
                        ? 'bg-purple-600 text-white'
                        : 'bg-[#161b22] text-slate-400 hover:text-slate-200 border border-[#30363d]'
                    }`}
                  >
                    {cat === 'all' ? `All (${issues.length})` : cat}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">Severity:</span>
                {(['all', 'critical', 'warning', 'info'] as const).map(sev => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors capitalize ${
                      severityFilter === sev
                        ? sev === 'critical'
                          ? 'bg-rose-600 text-white'
                          : sev === 'warning'
                          ? 'bg-amber-600 text-white'
                          : 'bg-blue-600 text-white'
                        : 'bg-[#161b22] text-slate-400 hover:text-slate-200 border border-[#30363d]'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Issues List */}
            {filteredIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 bg-[#0c1118] rounded-xl border border-slate-800 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2 animate-bounce" />
                <h3 className="text-base font-bold text-slate-100">Zero Issues Found!</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Your C code passed all static memory safety checks, boundary inspections, and loop optimization guidelines.
                </p>
                <button
                  onClick={triggerConfetti}
                  className="mt-3 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md transition-colors shadow-lg shadow-emerald-900/40"
                >
                  Celebrate Clean Code 🎉
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredIssues.map(issue => {
                  const isCritical = issue.severity === 'critical';
                  const isWarning  = issue.severity === 'warning';

                  return (
                    <div
                      key={issue.id}
                      className={`rounded-xl border transition-all duration-150 overflow-hidden ${
                        isCritical
                          ? 'bg-[#180a0f] border-rose-500/50 shadow-[0_0_18px_rgba(244,63,94,0.12)] hover:border-rose-400/70'
                          : isWarning
                          ? 'bg-[#1a1200] border-amber-500/50 shadow-[0_0_18px_rgba(245,158,11,0.10)] hover:border-amber-400/70'
                          : 'bg-[#0b0f1a] border-blue-500/30 hover:border-blue-400/50'
                      }`}
                    >
                      {/* Severity accent bar */}
                      <div className={`h-1 w-full ${
                        isCritical ? 'bg-gradient-to-r from-rose-600 to-red-500' :
                        isWarning  ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                                     'bg-gradient-to-r from-blue-600 to-indigo-500'
                      }`} />

                      <div className="p-3.5">
                        {/* Issue Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {isCritical ? (
                              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                            ) : isWarning ? (
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            ) : (
                              <Lightbulb className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <h4 className={`text-sm font-bold leading-tight ${
                                isCritical ? 'text-rose-100' : isWarning ? 'text-amber-100' : 'text-slate-100'
                              }`}>{issue.title}</h4>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {/* Severity badge */}
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded font-mono ${
                                  isCritical
                                    ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50'
                                    : isWarning
                                    ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50'
                                    : 'bg-blue-950/80 text-blue-300 border border-blue-500/50'
                                }`}>{issue.severity}</span>
                                {/* CWE badge */}
                                {issue.cwe && (
                                  <span className="text-[9px] text-slate-500 bg-slate-900/80 px-1.5 py-0.5 rounded font-mono border border-slate-700/60">
                                    {issue.cwe.split(':')[0]}
                                  </span>
                                )}
                                {/* Category badge */}
                                <span className="text-[9px] text-slate-500 bg-slate-900/60 px-1.5 py-0.5 rounded font-mono capitalize">
                                  {issue.category}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Jump-to-line button */}
                          <button
                            onClick={() => onJumpToLine(issue.line)}
                            className={`flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-semibold rounded border transition-colors shrink-0 ${
                              isCritical
                                ? 'bg-rose-950/60 text-rose-300 border-rose-500/50 hover:bg-rose-900/60 hover:border-rose-400'
                                : isWarning
                                ? 'bg-amber-950/60 text-amber-300 border-amber-500/50 hover:bg-amber-900/60 hover:border-amber-400'
                                : 'bg-slate-800 text-cyan-300 border-slate-700 hover:border-cyan-500'
                            }`}
                            title="Jump to code line"
                          >
                            <span>L{issue.line}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed pl-6">
                          {issue.description}
                        </p>

                        {/* Offending code snippet */}
                        {issue.codeSnippet && (
                          <div className={`mt-2 p-2 rounded-lg font-mono text-[11px] overflow-x-auto border ${
                            isCritical
                              ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                              : isWarning
                              ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                              : 'bg-[#0d1117] border-slate-700 text-slate-300'
                          }`}>
                            <div className="flex items-center justify-between gap-2">
                              <code className="break-all">{issue.codeSnippet}</code>
                              <span className="text-[9px] uppercase opacity-50 shrink-0">L{issue.line}</span>
                            </div>
                          </div>
                        )}

                        {/* Fix suggestion */}
                        <div className="mt-2.5 pt-2.5 border-t border-slate-800/60 flex flex-col gap-2">
                          <div className="flex items-start gap-1.5 text-xs text-emerald-300 pl-0.5">
                            <Zap className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                            <span className="leading-relaxed">{issue.suggestion}</span>
                          </div>

                          {issue.suggestedReplacement && (
                            <div className="mt-1 bg-[#060e09] border border-emerald-500/30 rounded-lg p-2.5 text-xs shadow-inner">
                              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-emerald-900/60 text-[10px] text-emerald-400">
                                <div className="flex items-center gap-1.5 font-semibold">
                                  <Zap className="w-3 h-3" />
                                  Recommended Fix:
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => copyFix(issue)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-300 transition-colors border border-slate-700"
                                  >
                                    {copiedIssueId === issue.id ? (
                                      <><Check className="w-3 h-3 text-emerald-400" /><span>Copied</span></>
                                    ) : (
                                      <><Copy className="w-3 h-3" /><span>Copy</span></>
                                    )}
                                  </button>
                                  {onApplyFix && (
                                    <button
                                      onClick={() => onApplyFix(issue)}
                                      className="flex items-center gap-1 px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-semibold transition-colors shadow-sm"
                                    >
                                      <Wrench className="w-3 h-3" />
                                      <span>Apply Fix</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <pre className="font-mono text-[11px] text-emerald-200 overflow-x-auto leading-relaxed">
                                {issue.suggestedReplacement.replacementCode}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MEMORY LIFECYCLE TRACE */}
        {activeTab === 'memory' && (
          <div className="space-y-3">
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Dynamic Heap Memory Tracking</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Static heap trace records each dynamic allocation (`malloc`, `calloc`) and verifies whether safe NULL checking and memory deallocation (`free`) occur.
              </p>
            </div>

            {allocations.length === 0 ? (
              <div className="p-6 bg-[#161b22] border border-[#30363d] rounded-lg text-center text-xs text-slate-400">
                No dynamic heap allocations detected in this C snippet. Memory is managed entirely via the program stack.
              </div>
            ) : (
              <div className="border border-[#30363d] rounded-lg overflow-hidden bg-[#161b22]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0d1117] text-slate-400 border-b border-[#30363d]">
                    <tr>
                      <th className="p-2.5">Pointer</th>
                      <th className="p-2.5">Allocation Call</th>
                      <th className="p-2.5">NULL Guard</th>
                      <th className="p-2.5">Free Status</th>
                      <th className="p-2.5">Lifecycle State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d]">
                    {allocations.map(trace => {
                      const isLeaked = trace.status === 'Leaked';
                      const isDouble = trace.status === 'DoubleFreed';

                      return (
                        <tr key={trace.id} className="hover:bg-[#1c2128]/60 transition-colors">
                          <td className="p-2.5 font-bold text-purple-300">
                            {trace.pointerName}
                          </td>
                          <td className="p-2.5 text-slate-300">
                            {trace.allocLine > 0 ? (
                              <button
                                onClick={() => onJumpToLine(trace.allocLine)}
                                className="hover:text-cyan-300 underline"
                              >
                                {trace.allocFunction}() at L{trace.allocLine}
                              </button>
                            ) : (
                              'External / Param'
                            )}
                          </td>
                          <td className="p-2.5">
                            {trace.nullChecked ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Checked
                              </span>
                            ) : (
                              <span className="text-rose-400 flex items-center gap-1 font-semibold">
                                <AlertOctagon className="w-3.5 h-3.5" /> Unchecked NULL
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {trace.freed ? (
                              <span className="text-emerald-400">
                                Freed at L{trace.freeLine}
                              </span>
                            ) : (
                              <span className="text-rose-400 font-bold">
                                Never Freed (Leak)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                trace.status === 'Safe'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : trace.status === 'Leaked'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : trace.status === 'DoubleFreed'
                                  ? 'bg-red-950 text-red-300 border border-red-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {trace.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: METRICS & COMPLEXITY */}
        {activeTab === 'metrics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Source LOC (SLOC)</span>
                <span className="text-xl font-bold font-mono text-slate-100">{metrics.sloc}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">({metrics.totalLines} total lines)</span>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Max Nesting Depth</span>
                <span className="text-xl font-bold font-mono text-cyan-400">{metrics.maxNestingDepth}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Control branch depth</span>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Cognitive Complexity</span>
                <span className="text-xl font-bold font-mono text-amber-400">{metrics.cognitiveComplexity}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Mental comprehension load</span>
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Maintainability Index</span>
                <span className="text-xl font-bold font-mono text-emerald-400">{metrics.maintainabilityIndex}/100</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">SEI Maintainability Index</span>
              </div>
            </div>

            {/* Functions Breakdown Table */}
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                Function Complexity Matrix ({metrics.functions.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0d1117] text-slate-400 border-b border-[#30363d]">
                    <tr>
                      <th className="p-2">Function</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Lines</th>
                      <th className="p-2">Cyclomatic V(G)</th>
                      <th className="p-2">Nesting</th>
                      <th className="p-2">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d]">
                    {metrics.functions.map((fn, idx) => (
                      <tr key={idx} className="hover:bg-[#1c2128]/60 transition-colors">
                        <td className="p-2 font-bold text-purple-300">
                          <button
                            onClick={() => onJumpToLine(fn.lineStart)}
                            className="hover:text-cyan-300 underline"
                          >
                            {fn.name}()
                          </button>
                        </td>
                        <td className="p-2 text-slate-400">{fn.returnType}</td>
                        <td className="p-2 text-slate-300">{fn.loc}</td>
                        <td className="p-2 font-bold text-slate-100">{fn.cyclomaticComplexity}</td>
                        <td className="p-2 text-cyan-400">{fn.nestingDepth}</td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              fn.riskRating === 'Low'
                                ? 'bg-emerald-950 text-emerald-300'
                                : fn.riskRating === 'Moderate'
                                ? 'bg-amber-950 text-amber-300'
                                : 'bg-rose-950 text-rose-300'
                            }`}
                          >
                            {fn.riskRating}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
