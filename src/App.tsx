import React, { useState, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { EditorPanel } from './components/EditorPanel';
import { ASTVisualizer } from './components/ASTVisualizer';
import { VisualTree } from './components/VisualTree';
import { CodeHealthDashboard } from './components/CodeHealthDashboard';
import { ExportModal } from './components/ExportModal';
import { C_PRESETS, PresetCode } from './data/presets';
import { parseCCode } from './parser/cParser';
import { runStaticAnalysis } from './analyzer/engine';
import { ASTNode } from './types/ast';
import { CodeIssue } from './types/analysis';
import { Cpu, Activity, ShieldAlert, Sparkles, SplitSquareVertical } from 'lucide-react';

export const App: React.FC = () => {
  const [selectedPreset, setSelectedPreset] = useState<PresetCode>(C_PRESETS[0]);
  const [code, setCode] = useState<string>(C_PRESETS[0].code);
  const [activeNode, setActiveNode] = useState<ASTNode | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [rightViewMode, setRightViewMode] = useState<'split' | 'ast' | 'dashboard'>('split');
  const [astDisplayMode, setAstDisplayMode] = useState<'visual-tree' | 'graph'>('visual-tree');
  const [activeRightTab, setActiveRightTab] = useState<'ast' | 'dashboard'>('ast');
  const [mobileActivePanel, setMobileActivePanel] = useState<'editor' | 'ast' | 'dashboard'>('editor');
  const [exportModal, setExportModal] = useState<{ isOpen: boolean; type: 'ast' | 'report' }>({
    isOpen: false,
    type: 'ast'
  });

  // Parse AST from C Code
  const ast = useMemo(() => {
    return parseCCode(code);
  }, [code]);

  // Run Static Analysis
  const analysis = useMemo(() => {
    return runStaticAnalysis(ast, code);
  }, [ast, code]);

  // Handle preset change
  const handleSelectPreset = (preset: PresetCode) => {
    setSelectedPreset(preset);
    setCode(preset.code);
    setActiveNode(null);
    setSelectedLine(null);
  };

  // Jump to specific line from dashboard or AST
  const handleJumpToLine = useCallback((line: number) => {
    setSelectedLine(line);
    // Find matching AST node for this line
    let matched: ASTNode | null = null;
    let minSpan = 999999;
    function search(n: ASTNode) {
      if (line >= n.lineStart && line <= n.lineEnd) {
        const span = n.lineEnd - n.lineStart;
        if (span < minSpan) {
          minSpan = span;
          matched = n;
        }
      }
      n.children.forEach(search);
    }
    search(ast);
    if (matched) {
      setActiveNode(matched);
    }
  }, [ast]);

  // Handle AST node selection
  const handleSelectNode = useCallback((node: ASTNode | null) => {
    setActiveNode(node);
    if (node) {
      setSelectedLine(node.lineStart);
    }
  }, []);

  // One-click Apply Fix
  const handleApplyFix = (issue: CodeIssue) => {
    if (!issue.suggestedReplacement) return;
    const { startLine, endLine, replacementCode } = issue.suggestedReplacement;
    const lines = code.split('\n');

    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine);
    const newCode = [...before, replacementCode, ...after].join('\n');

    setCode(newCode);
    setSelectedLine(startLine);
  };

  // Basic C Code Formatter / Indenter
  const handleFormat = () => {
    const rawLines = code.split('\n');
    let indentLevel = 0;
    const formatted: string[] = [];

    for (let line of rawLines) {
      const trimmed = line.trim();

      // Check closing brace
      if (trimmed.startsWith('}') || trimmed.startsWith(');') || trimmed.startsWith('};')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      const indentStr = '    '.repeat(indentLevel);
      formatted.push(trimmed.length > 0 ? indentStr + trimmed : '');

      // Check opening brace
      if (trimmed.endsWith('{')) {
        indentLevel++;
      }
    }

    setCode(formatted.join('\n'));
  };

  // Reset to default preset
  const handleResetToDefault = () => {
    handleSelectPreset(C_PRESETS[0]);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0e14]">
      {/* Top Header */}
      <Header
        selectedPreset={selectedPreset}
        onSelectPreset={handleSelectPreset}
        analysis={analysis}
        rightViewMode={rightViewMode}
        onChangeRightViewMode={setRightViewMode}
        onExportAST={() => setExportModal({ isOpen: true, type: 'ast' })}
        onExportReport={() => setExportModal({ isOpen: true, type: 'report' })}
        onRunAnalysis={() => {
          // Re-trigger analysis
          setSelectedLine(null);
        }}
      />

        {/* Mobile View Toggle Bar */}
        <div className="md:hidden flex items-center justify-around bg-[#161b22] border-t border-[#30363d] p-1.5 text-xs font-medium z-30">
          <button
            onClick={() => setMobileActivePanel('editor')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              mobileActivePanel === 'editor' ? 'bg-purple-600 text-white' : 'text-slate-400'
            }`}
          >
            <span>Code Editor</span>
          </button>
          <button
            onClick={() => setMobileActivePanel('ast')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              mobileActivePanel === 'ast' ? 'bg-purple-600 text-white' : 'text-slate-400'
            }`}
          >
            <span>AST Map</span>
          </button>
          <button
            onClick={() => setMobileActivePanel('dashboard')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
              mobileActivePanel === 'dashboard' ? 'bg-purple-600 text-white' : 'text-slate-400'
            }`}
          >
            <span>Health Dashboard</span>
          </button>
        </div>

        {/* Main Two-Panel Layout */}
        <main className="flex-1 flex overflow-hidden">
          {/* Left Panel: C Code Editor (50% width on desktop) */}
          <div className={`w-full md:w-1/2 h-full ${mobileActivePanel === 'editor' ? 'block' : 'hidden md:block'}`}>
            <EditorPanel
              code={code}
              onChange={setCode}
              issues={analysis.issues}
              activeNode={activeNode}
              targetLine={selectedLine}
              onLineClick={line => {
                setSelectedLine(line);
                handleJumpToLine(line);
              }}
              onFormat={handleFormat}
              onResetToDefault={handleResetToDefault}
            />
          </div>

          {/* Right Panel: Interactive AST Visualizer & Code Health Dashboard */}
          <div className={`w-full md:w-1/2 h-full bg-[#0d1117] overflow-hidden ${
            mobileActivePanel !== 'editor' ? 'flex flex-col' : 'hidden md:flex flex-col'
          }`}>
            {mobileActivePanel === 'ast' ? (
              <div className="flex flex-col h-full w-full overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] text-xs">
                  <span className="font-semibold text-slate-300">AST Representation</span>
                  <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded p-0.5 text-xs">
                    <button
                      onClick={() => setAstDisplayMode('visual-tree')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        astDisplayMode === 'visual-tree' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Visual Node Tree
                    </button>
                    <button
                      onClick={() => setAstDisplayMode('graph')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        astDisplayMode === 'graph' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Graph Map
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  {astDisplayMode === 'visual-tree' ? (
                    <VisualTree
                      ast={ast}
                      issues={analysis.issues}
                      selectedLine={selectedLine}
                      activeNode={activeNode}
                      onSelectNode={handleSelectNode}
                      onLineClick={handleJumpToLine}
                    />
                  ) : (
                    <ASTVisualizer
                      ast={ast}
                      selectedLine={selectedLine}
                      onSelectNode={handleSelectNode}
                      activeNode={activeNode}
                    />
                  )}
                </div>
              </div>
            ) : mobileActivePanel === 'dashboard' ? (
              <CodeHealthDashboard
                analysis={analysis}
                onJumpToLine={handleJumpToLine}
                onApplyFix={handleApplyFix}
              />
            ) : rightViewMode === 'split' ? (
              /* Split View: Top half AST, Bottom half Health Dashboard */
              <div className="flex flex-col h-full">
                {/* Top sub-panel: Visual AST Tree Map (52% height) */}
                <div className="h-[52%] border-b border-[#30363d] overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-[#30363d] text-xs">
                    <span className="font-semibold text-slate-300 text-[11px]">AST Representation</span>
                    <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded p-0.5 text-[10px]">
                      <button
                        onClick={() => setAstDisplayMode('visual-tree')}
                        className={`px-2 py-0.5 rounded font-medium transition-colors ${
                          astDisplayMode === 'visual-tree' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Visual Tree
                      </button>
                      <button
                        onClick={() => setAstDisplayMode('graph')}
                        className={`px-2 py-0.5 rounded font-medium transition-colors ${
                          astDisplayMode === 'graph' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Graph Map
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {astDisplayMode === 'visual-tree' ? (
                      <VisualTree
                        ast={ast}
                        selectedLine={selectedLine}
                        activeNode={activeNode}
                        onSelectNode={handleSelectNode}
                        onLineClick={handleJumpToLine}
                      />
                    ) : (
                      <ASTVisualizer
                        ast={ast}
                        selectedLine={selectedLine}
                        onSelectNode={handleSelectNode}
                        activeNode={activeNode}
                      />
                    )}
                  </div>
                </div>

                {/* Bottom sub-panel: Code Health Dashboard (48% height) */}
                <div className="h-[48%] overflow-hidden">
                  <CodeHealthDashboard
                    analysis={analysis}
                    onJumpToLine={handleJumpToLine}
                    onApplyFix={handleApplyFix}
                  />
                </div>
              </div>
            ) : rightViewMode === 'ast' ? (
              /* Full Height AST View */
              <div className="flex flex-col h-full w-full overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] text-xs">
                  <span className="font-semibold text-slate-300">AST Representation</span>
                  <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded p-0.5 text-xs">
                    <button
                      onClick={() => setAstDisplayMode('visual-tree')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        astDisplayMode === 'visual-tree' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Visual Node Tree
                    </button>
                    <button
                      onClick={() => setAstDisplayMode('graph')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                        astDisplayMode === 'graph' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Graph Map
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  {astDisplayMode === 'visual-tree' ? (
                    <VisualTree
                      ast={ast}
                      issues={analysis.issues}
                      selectedLine={selectedLine}
                      activeNode={activeNode}
                      onSelectNode={handleSelectNode}
                      onLineClick={handleJumpToLine}
                    />
                  ) : (
                    <ASTVisualizer
                      ast={ast}
                      selectedLine={selectedLine}
                      onSelectNode={handleSelectNode}
                      activeNode={activeNode}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* Full Height Code Health Dashboard */
              <CodeHealthDashboard
                analysis={analysis}
                onJumpToLine={handleJumpToLine}
                onApplyFix={handleApplyFix}
              />
            )}
          </div>
        </main>

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModal.isOpen}
        onClose={() => setExportModal({ ...exportModal, isOpen: false })}
        type={exportModal.type}
        ast={ast}
        analysis={analysis}
        sourceCode={code}
      />
    </div>
  );
};
export default App;
