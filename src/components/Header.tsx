import React from 'react';
import {
  Cpu, Shield, Play, Download, Share2, Sparkles,
  Layers, Activity, FileText, ChevronDown, CheckCircle
} from 'lucide-react';
import { C_PRESETS, PresetCode } from '../data/presets';
import { AnalysisResult } from '../types/analysis';

interface HeaderProps {
  selectedPreset: PresetCode;
  onSelectPreset: (preset: PresetCode) => void;
  analysis: AnalysisResult;
  rightViewMode: 'split' | 'ast' | 'dashboard';
  onChangeRightViewMode: (mode: 'split' | 'ast' | 'dashboard') => void;
  onExportAST: () => void;
  onExportReport: () => void;
  onRunAnalysis: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedPreset,
  onSelectPreset,
  analysis,
  rightViewMode,
  onChangeRightViewMode,
  onExportAST,
  onExportReport,
  onRunAnalysis
}) => {
  return (
    <header className="h-14 bg-[#161b22] border-b border-[#30363d] px-4 flex items-center justify-between select-none z-20">
      {/* Brand & Title */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30 border border-white/10">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-slate-100 flex items-center gap-1.5">
              <span>C-Insight</span>
            </h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/80">
              Visual Static Analyzer
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-sans hidden sm:block">
            Interactive AST Tree Map & Memory Safety Diagnostics
          </p>
        </div>
      </div>

      {/* Center: Preset Selector */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg px-2.5 py-1 text-xs">
          <span className="text-slate-400 text-[11px] font-medium hidden md:inline">Preset:</span>
          <select
            value={selectedPreset.id}
            onChange={e => {
              const found = C_PRESETS.find(p => p.id === e.target.value);
              if (found) onSelectPreset(found);
            }}
            className="bg-transparent text-xs text-purple-300 font-semibold focus:outline-none cursor-pointer max-w-[200px] truncate"
          >
            {C_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id} className="bg-[#161b22] text-slate-200">
                {preset.name} ({preset.badge})
              </option>
            ))}
          </select>
        </div>

        {/* View Mode Selector for Right Panel */}
        <div className="hidden lg:flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg p-0.5 text-xs">
          <button
            onClick={() => onChangeRightViewMode('split')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              rightViewMode === 'split' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Split (AST + Health)
          </button>
          <button
            onClick={() => onChangeRightViewMode('ast')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              rightViewMode === 'ast' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            AST Map Only
          </button>
          <button
            onClick={() => onChangeRightViewMode('dashboard')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              rightViewMode === 'dashboard' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Health Dashboard
          </button>
        </div>
      </div>

      {/* Right: Actions & Exports */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRunAnalysis}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all active:scale-95"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Analyze</span>
        </button>

        <div className="flex items-center gap-1 border-l border-[#30363d] pl-2">
          <button
            onClick={onExportAST}
            className="p-1.5 hover:bg-[#21262d] text-slate-400 hover:text-slate-200 rounded transition-colors text-xs flex items-center gap-1"
            title="Export AST Tree to JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[11px]">AST JSON</span>
          </button>

          <button
            onClick={onExportReport}
            className="p-1.5 hover:bg-[#21262d] text-slate-400 hover:text-slate-200 rounded transition-colors text-xs flex items-center gap-1"
            title="Export Static Analysis Report to Markdown"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[11px]">Report</span>
          </button>
        </div>
      </div>
    </header>
  );
};
