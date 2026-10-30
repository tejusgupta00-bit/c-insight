import React, { useState } from 'react';
import { X, Copy, Check, Download, FileCode, FileText } from 'lucide-react';
import { ASTNode } from '../types/ast';
import { AnalysisResult } from '../types/analysis';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'ast' | 'report';
  ast: ASTNode;
  analysis: AnalysisResult;
  sourceCode: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  type,
  ast,
  analysis,
  sourceCode
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const getExportContent = () => {
    if (type === 'ast') {
      return JSON.stringify(ast, null, 2);
    } else {
      // Generate clean Markdown Report
      return `# C-Insight Static Analysis Report
Generated: ${new Date().toLocaleString()}

## Overall Code Health
- **Score:** ${analysis.healthScore}/100 (Grade ${analysis.letterGrade})
- **Summary:** ${analysis.summary}
- **Memory Safety Rating:** ${analysis.metrics.memorySafetyScore}%
- **Maintainability Index:** ${analysis.metrics.maintainabilityIndex}/100

## Key Code Metrics
- **Total Lines:** ${analysis.metrics.totalLines}
- **Source Lines of Code (SLOC):** ${analysis.metrics.sloc}
- **Cyclomatic Complexity V(G):** ${analysis.metrics.cyclomaticComplexity}
- **Cognitive Complexity:** ${analysis.metrics.cognitiveComplexity}
- **Max Nesting Depth:** ${analysis.metrics.maxNestingDepth}
- **Total Functions:** ${analysis.metrics.functionCount}
- **Dynamic Heap Allocations:** ${analysis.allocations.length} (${analysis.metrics.freedCount} properly freed)

## Diagnostics & Memory Hazards (${analysis.issues.length})
${analysis.issues.length === 0 ? '_No issues detected. Clean static check._\n' : ''}
${analysis.issues
  .map(
    (issue, i) => `### ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.title}
- **Category:** ${issue.category}
- **Standard:** ${issue.cwe || 'C Guidelines'}
- **Line:** ${issue.line}
- **Description:** ${issue.description}
- **Recommendation:** ${issue.suggestion}
${issue.suggestedReplacement ? `\`\`\`c\n${issue.suggestedReplacement.replacementCode}\n\`\`\`` : ''}
`
  )
  .join('\n')}

## Heap Allocation Trace Table
| Pointer | Alloc Call | NULL Checked | Freed | Status |
|---------|------------|--------------|-------|--------|
${analysis.allocations
  .map(
    a =>
      `| \`${a.pointerName}\` | \`${a.allocFunction}()\` L${a.allocLine} | ${a.nullChecked ? 'Yes' : '**NO**'} | ${
        a.freed ? `Yes (L${a.freeLine})` : '**NO (LEAK)**'
      } | ${a.status} |`
  )
  .join('\n')}

## Analyzed C Source Code
\`\`\`c
${sourceCode}
\`\`\`
`;
    }
  };

  const content = getExportContent();
  const filename = type === 'ast' ? 'ast_tree.json' : 'static_analysis_report.md';

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: type === 'ast' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d] bg-[#0d1117]">
          <div className="flex items-center gap-2">
            {type === 'ast' ? (
              <FileCode className="w-5 h-5 text-purple-400" />
            ) : (
              <FileText className="w-5 h-5 text-cyan-400" />
            )}
            <h3 className="text-sm font-bold text-slate-100">
              {type === 'ast' ? 'Export Abstract Syntax Tree (JSON)' : 'Export Static Analysis Report (Markdown)'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-[#21262d] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Box */}
        <div className="p-4 flex-1 overflow-auto bg-[#0b0e14]">
          <pre className="font-mono text-xs text-slate-200 whitespace-pre leading-relaxed select-text">
            {content}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#161b22] border-t border-[#30363d] flex items-center justify-between text-xs">
          <span className="text-slate-400 font-mono text-[11px]">{filename}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-slate-200 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard' : 'Copy'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors shadow-md"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
