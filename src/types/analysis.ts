export type Severity = 'critical' | 'warning' | 'info';

export type IssueCategory = 'memory' | 'optimization' | 'security' | 'standard';

export interface CodeIssue {
  id: string;
  category: IssueCategory;
  severity: Severity;
  title: string;
  description: string;
  line: number;
  endLine?: number;
  codeSnippet?: string;
  suggestion: string;
  suggestedReplacement?: {
    startLine: number;
    endLine: number;
    replacementCode: string;
  };
  cwe?: string;
  ruleId: string;
}

export interface AllocationTrace {
  id: string;
  pointerName: string;
  allocLine: number;
  allocFunction: string;
  allocSize?: string;
  freed: boolean;
  freeLine?: number;
  nullChecked: boolean;
  status: 'Safe' | 'Leaked' | 'Unchecked' | 'DoubleFreed' | 'UseAfterFree';
}

export interface FunctionMetric {
  name: string;
  returnType: string;
  lineStart: number;
  lineEnd: number;
  loc: number;
  cyclomaticComplexity: number;
  nestingDepth: number;
  paramCount: number;
  riskRating: 'Low' | 'Moderate' | 'High';
}

export interface AnalysisMetrics {
  totalLines: number;
  sloc: number; // Source Lines of Code
  commentLines: number;
  blankLines: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maxNestingDepth: number;
  functionCount: number;
  functions: FunctionMetric[];
  pointerCount: number;
  dynamicAllocCount: number;
  freedCount: number;
  memorySafetyScore: number; // 0 - 100
  maintainabilityIndex: number; // 0 - 100
}

export interface AnalysisResult {
  healthScore: number; // 0 - 100
  letterGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  timestamp: string;
  metrics: AnalysisMetrics;
  issues: CodeIssue[];
  allocations: AllocationTrace[];
}
