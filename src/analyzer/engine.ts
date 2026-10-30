import { ASTNode } from '../types/ast';
import { CodeIssue, AllocationTrace, AnalysisMetrics, AnalysisResult, FunctionMetric } from '../types/analysis';

export function runStaticAnalysis(ast: ASTNode, sourceCode: string): AnalysisResult {
  const lines = sourceCode.split('\n');
  const issues: CodeIssue[] = [];
  const allocations: AllocationTrace[] = [];
  const functionMetrics: FunctionMetric[] = [];

  // Line analysis helper
  const rawLines = lines;
  const totalLines = rawLines.length;
  let commentLines = 0;
  let blankLines = 0;
  let sloc = 0;

  let inBlockComment = false;
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed.length === 0) {
      blankLines++;
      continue;
    }
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      commentLines++;
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('//')) {
      commentLines++;
      continue;
    }
    sloc++;
  }

  // Traverse AST to collect functions, declarations, loops, and calls
  const allNodes: ASTNode[] = [];
  function collectNodes(node: ASTNode) {
    allNodes.push(node);
    for (const child of node.children) {
      collectNodes(child);
    }
  }
  collectNodes(ast);

  // 1. Identify Functions
  const functionNodes = allNodes.filter(n => n.type === 'FunctionDefinition');

  // If no explicit FunctionDefinition found (e.g. user pasted raw snippet), treat as 1 implicit function
  const effectiveFunctions = functionNodes.length > 0 ? functionNodes : [ast];

  let totalCyclomaticComplexity = 0;
  let maxGlobalNesting = 0;

  for (const fnNode of effectiveFunctions) {
    const fnName = fnNode.metadata?.functionName || 'global_scope';
    const returnType = fnNode.metadata?.dataType || 'void';
    const lineStart = fnNode.lineStart;
    const lineEnd = fnNode.lineEnd;
    const fnLoc = Math.max(1, lineEnd - lineStart + 1);

    // Calculate Cyclomatic Complexity: 1 + decision points
    let decisions = 0;
    let localNesting = 0;
    let maxLocalNesting = 0;

    function countComplexity(n: ASTNode, depth: number) {
      if (['ForStatement', 'WhileStatement', 'DoWhileStatement', 'IfStatement'].includes(n.type)) {
        decisions++;
        localNesting++;
        if (localNesting > maxLocalNesting) maxLocalNesting = localNesting;
      }
      for (const child of n.children) {
        countComplexity(child, depth + 1);
      }
      if (['ForStatement', 'WhileStatement', 'DoWhileStatement', 'IfStatement'].includes(n.type)) {
        localNesting--;
      }
    }

    countComplexity(fnNode, 0);

    // Also scan lines for logical && and || and ternary ? which add decision branches
    for (let l = lineStart - 1; l < lineEnd && l < lines.length; l++) {
      const lineText = lines[l];
      const andMatches = (lineText.match(/&&/g) || []).length;
      const orMatches = (lineText.match(/\|\|/g) || []).length;
      const ternaryMatches = (lineText.match(/\?[^:]+:/g) || []).length;
      decisions += andMatches + orMatches + ternaryMatches;
    }

    const cc = Math.max(1, decisions + 1);
    totalCyclomaticComplexity += cc;
    if (maxLocalNesting > maxGlobalNesting) maxGlobalNesting = maxLocalNesting;

    functionMetrics.push({
      name: fnName,
      returnType,
      lineStart,
      lineEnd,
      loc: fnLoc,
      cyclomaticComplexity: cc,
      nestingDepth: maxLocalNesting,
      paramCount: fnNode.metadata?.paramCount || 0,
      riskRating: cc > 10 ? 'High' : cc > 5 ? 'Moderate' : 'Low'
    });
  }

  // 2. Track Memory Allocations (malloc, calloc, realloc)
  // Find all variable declarations or assignments that invoke malloc/calloc
  const allocNodes = allNodes.filter(n =>
    n.metadata?.isMemoryAllocation === true ||
    (n.type === 'VariableDeclaration' && n.metadata?.isMemoryAllocation)
  );

  // Also regex scan lines for malloc/calloc to catch patterns resiliently
  const mallocRegex = /([a-zA-Z0-9_]+)\s*=\s*(?:\([a-zA-Z0-9_*\s]+\))?\s*(malloc|calloc|realloc)\s*\(([^)]+)\)/g;
  const freeRegex = /free\s*\(\s*([a-zA-Z0-9_]+)\s*\)/g;

  // Track map: pointerName -> AllocationInfo
  const pointerMap = new Map<string, {
    pointerName: string;
    allocLine: number;
    allocFunc: string;
    allocSize: string;
    freeLines: number[];
  }>();

  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    let match: RegExpExecArray | null;

    // Check allocations
    mallocRegex.lastIndex = 0;
    while ((match = mallocRegex.exec(lineText)) !== null) {
      const ptrName = match[1];
      const allocFunc = match[2];
      const allocSize = match[3].trim();
      pointerMap.set(ptrName, {
        pointerName: ptrName,
        allocLine: l + 1,
        allocFunc,
        allocSize,
        freeLines: []
      });
    }

    // Check frees
    freeRegex.lastIndex = 0;
    while ((match = freeRegex.exec(lineText)) !== null) {
      const ptrName = match[1];
      if (pointerMap.has(ptrName)) {
        pointerMap.get(ptrName)!.freeLines.push(l + 1);
      } else {
        // Pointer freed without tracked malloc (or passed as argument)
        pointerMap.set(ptrName, {
          pointerName: ptrName,
          allocLine: 0,
          allocFunc: 'external',
          allocSize: 'unknown',
          freeLines: [l + 1]
        });
      }
    }
  }

  // Check for NULL pointer checks after allocations
  pointerMap.forEach((info, ptrName) => {
    if (info.allocLine === 0) return; // external pointer

    let isNullChecked = false;
    let checkedLine = 0;
    const nullCheckPattern1 = new RegExp(`if\\s*\\(\\s*${ptrName}\\s*==\\s*NULL\\s*\\)`);
    const nullCheckPattern2 = new RegExp(`if\\s*\\(\\s*!\\s*${ptrName}\\s*\\)`);
    const nullCheckPattern3 = new RegExp(`if\\s*\\(\\s*NULL\\s*==\\s*${ptrName}\\s*\\)`);
    const nullCheckPattern4 = new RegExp(`if\\s*\\(\\s*${ptrName}\\s*!=\\s*NULL\\s*\\)`);
    const nullCheckPattern5 = new RegExp(`if\\s*\\(\\s*${ptrName}\\s*\\)`);

    for (let l = info.allocLine - 1; l < lines.length; l++) {
      const lineText = lines[l];
      if (
        nullCheckPattern1.test(lineText) ||
        nullCheckPattern2.test(lineText) ||
        nullCheckPattern3.test(lineText) ||
        nullCheckPattern4.test(lineText) ||
        nullCheckPattern5.test(lineText)
      ) {
        isNullChecked = true;
        checkedLine = l + 1;
        break;
      }
    }

    const isFreed = info.freeLines.length > 0;
    const isDoubleFree = info.freeLines.length > 1;

    let status: AllocationTrace['status'] = 'Safe';
    if (!isFreed) status = 'Leaked';
    else if (isDoubleFree) status = 'DoubleFreed';
    else if (!isNullChecked) status = 'Unchecked';

    allocations.push({
      id: `alloc_${ptrName}_${info.allocLine}`,
      pointerName: ptrName,
      allocLine: info.allocLine,
      allocFunction: info.allocFunc,
      allocSize: info.allocSize,
      freed: isFreed,
      freeLine: info.freeLines[0],
      nullChecked: isNullChecked,
      status
    });

    // RULE 1: Memory Leak (MEM-001)
    if (!isFreed) {
      issues.push({
        id: `mem_leak_${ptrName}_${info.allocLine}`,
        category: 'memory',
        severity: 'critical',
        cwe: 'CWE-401: Improper Release of Memory Before Removing Last Reference',
        ruleId: 'MEM-001',
        title: `Memory Leak Detected on '${ptrName}'`,
        description: `Memory allocated via '${info.allocFunc}()' at line ${info.allocLine} is never released using 'free(${ptrName})' along all exit paths.`,
        line: info.allocLine,
        codeSnippet: lines[info.allocLine - 1]?.trim(),
        suggestion: `Ensure 'free(${ptrName});' is invoked before the function returns or when '${ptrName}' goes out of scope.`,
        suggestedReplacement: {
          startLine: Math.min(lines.length, info.allocLine + 10),
          endLine: Math.min(lines.length, info.allocLine + 10),
          replacementCode: `    free(${ptrName});\n    ${ptrName} = NULL;`
        }
      });
    }

    // RULE 2: Unchecked NULL Pointer Dereference (MEM-002)
    if (!isNullChecked) {
      issues.push({
        id: `null_deref_${ptrName}_${info.allocLine}`,
        category: 'memory',
        severity: 'critical',
        cwe: 'CWE-476: NULL Pointer Dereference',
        ruleId: 'MEM-002',
        title: `Missing NULL Check on '${ptrName}'`,
        description: `'${info.allocFunc}()' may return NULL if the heap is exhausted. Dereferencing '${ptrName}' without validation will cause a segmentation fault crash.`,
        line: info.allocLine,
        codeSnippet: lines[info.allocLine - 1]?.trim(),
        suggestion: `Always verify memory allocation immediately: 'if (${ptrName} == NULL) { return -1; /* error handling */ }'`,
        suggestedReplacement: {
          startLine: info.allocLine + 1,
          endLine: info.allocLine + 1,
          replacementCode: `    if (${ptrName} == NULL) {\n        fprintf(stderr, "Error: Memory allocation failed for ${ptrName}\\n");\n        return -1;\n    }`
        }
      });
    }

    // RULE 3: Double Free (MEM-004)
    if (isDoubleFree) {
      issues.push({
        id: `double_free_${ptrName}_${info.freeLines[1]}`,
        category: 'memory',
        severity: 'critical',
        cwe: 'CWE-415: Double Free Vulnerability',
        ruleId: 'MEM-004',
        title: `Double Free Vulnerability on '${ptrName}'`,
        description: `'free(${ptrName})' is called at line ${info.freeLines[0]} and called again at line ${info.freeLines[1]}. Double freeing corrupts heap metadata and can lead to arbitrary code execution.`,
        line: info.freeLines[1],
        codeSnippet: lines[info.freeLines[1] - 1]?.trim(),
        suggestion: `Set '${ptrName} = NULL;' immediately after freeing, or eliminate redundant 'free()' invocations.`
      });
    }

    // RULE 4: Use-After-Free (MEM-003)
    if (isFreed && info.freeLines[0] > 0) {
      const firstFree = info.freeLines[0];
      const useRegex = new RegExp(`\\b${ptrName}\\b(?:\\[|->|\\s*=)`);
      for (let l = firstFree; l < lines.length; l++) {
        const text = lines[l];
        // skip if it's setting ptr = NULL or another free
        if (text.includes(`free(${ptrName})`) || text.includes(`${ptrName} = NULL`) || text.includes(`${ptrName} = 0`)) {
          continue;
        }
        if (useRegex.test(text)) {
          issues.push({
            id: `use_after_free_${ptrName}_${l + 1}`,
            category: 'memory',
            severity: 'critical',
            cwe: 'CWE-416: Use After Free',
            ruleId: 'MEM-003',
            title: `Use-After-Free on '${ptrName}'`,
            description: `'${ptrName}' was deallocated at line ${firstFree} but is accessed again at line ${l + 1}. This causes undefined behavior and severe security hazards.`,
            line: l + 1,
            codeSnippet: text.trim(),
            suggestion: `Avoid referencing '${ptrName}' after calling 'free()', and set '${ptrName} = NULL;' immediately after freeing.`
          });
          break;
        }
      }
    }
  });

  // 3. Scan for Insecure String / Standard Functions (CWE-120, CWE-242)
  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    const lineNum = l + 1;

    // gets() - Critical
    if (/\bgets\s*\(/.test(lineText)) {
      issues.push({
        id: `unsafe_gets_${lineNum}`,
        category: 'security',
        severity: 'critical',
        cwe: 'CWE-242: Use of Inherently Dangerous Function',
        ruleId: 'SEC-001',
        title: `Prohibited Insecure Function 'gets()'`,
        description: `'gets()' cannot check buffer boundaries and was removed in ISO C11. Any input exceeding buffer size causes buffer overflow.`,
        line: lineNum,
        codeSnippet: lineText.trim(),
        suggestion: `Replace 'gets(buffer)' with 'fgets(buffer, sizeof(buffer), stdin)'.`,
        suggestedReplacement: {
          startLine: lineNum,
          endLine: lineNum,
          replacementCode: `    fgets(buffer, sizeof(buffer), stdin);`
        }
      });
    }

    // strcpy() - Warning/Critical
    if (/\bstrcpy\s*\(([^,]+),\s*([^)]+)\)/.test(lineText)) {
      const match = lineText.match(/\bstrcpy\s*\(([^,]+),\s*([^)]+)\)/);
      const dest = match ? match[1].trim() : 'dest';
      const src = match ? match[2].trim() : 'src';
      issues.push({
        id: `unsafe_strcpy_${lineNum}`,
        category: 'memory',
        severity: 'warning',
        cwe: 'CWE-120: Buffer Copy without Checking Size of Input',
        ruleId: 'MEM-005',
        title: `Potential Buffer Overflow in 'strcpy()'`,
        description: `'strcpy()' performs an unbounded memory copy from '${src}' to '${dest}'. If '${src}' exceeds '${dest}' size, it overwrites stack/heap memory.`,
        line: lineNum,
        codeSnippet: lineText.trim(),
        suggestion: `Use bounded 'strncpy(${dest}, ${src}, sizeof(${dest}) - 1);' or 'snprintf(${dest}, sizeof(${dest}), "%s", ${src});'.`,
        suggestedReplacement: {
          startLine: lineNum,
          endLine: lineNum,
          replacementCode: `    strncpy(${dest}, ${src}, sizeof(${dest}) - 1);\n    ${dest}[sizeof(${dest}) - 1] = '\\0';`
        }
      });
    }

    // sprintf() - Warning
    if (/\bsprintf\s*\(/.test(lineText) && !/\bsnprintf\s*\(/.test(lineText)) {
      issues.push({
        id: `unsafe_sprintf_${lineNum}`,
        category: 'security',
        severity: 'warning',
        cwe: 'CWE-134: Use of Externally-Controlled Format String',
        ruleId: 'SEC-002',
        title: `Unbounded Format 'sprintf()' Detected`,
        description: `'sprintf()' does not receive a buffer limit and risks buffer overflow if the formatted result is unexpectedly large.`,
        line: lineNum,
        codeSnippet: lineText.trim(),
        suggestion: `Replace with 'snprintf(buffer, sizeof(buffer), ...)' to enforce strict bounds.`
      });
    }
  }

  // 4. Array Out-of-Bounds & Off-by-One Checks (CWE-193)
  // Scan for fixed size array declarations e.g. `int arr[10];`
  const fixedArrayRegex = /(?:int|char|float|double|long|size_t)\s+([a-zA-Z0-9_]+)\s*\[\s*([0-9]+)\s*\]/g;
  const fixedArrays = new Map<string, { size: number; line: number }>();

  for (let l = 0; l < lines.length; l++) {
    fixedArrayRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fixedArrayRegex.exec(lines[l])) !== null) {
      fixedArrays.set(match[1], { size: parseInt(match[2], 10), line: l + 1 });
    }
  }

  // Check accesses like `arr[10]` when size is 10
  fixedArrays.forEach((arrInfo, arrName) => {
    const accessRegex = new RegExp(`\\b${arrName}\\s*\\[\\s*([0-9]+)\\s*\\]`, 'g');
    for (let l = 0; l < lines.length; l++) {
      if (l + 1 === arrInfo.line) continue; // skip declaration
      let match: RegExpExecArray | null;
      accessRegex.lastIndex = 0;
      while ((match = accessRegex.exec(lines[l])) !== null) {
        const index = parseInt(match[1], 10);
        if (index >= arrInfo.size) {
          issues.push({
            id: `oob_${arrName}_${l + 1}`,
            category: 'memory',
            severity: 'critical',
            cwe: 'CWE-193: Off-by-one Error (Buffer Overflow)',
            ruleId: 'MEM-006',
            title: `Static Array Out-of-Bounds Access on '${arrName}'`,
            description: `'${arrName}' is declared with size ${arrInfo.size} (indices 0..${arrInfo.size - 1}), but accessed at out-of-bounds index [${index}].`,
            line: l + 1,
            codeSnippet: lines[l].trim(),
            suggestion: `Ensure index is strictly less than ${arrInfo.size}. Valid indices for '${arrName}' are 0 to ${arrInfo.size - 1}.`
          });
        }
      }
    }
  });

  // Check For-loops with off-by-one boundary e.g. `for (int i = 0; i <= size; i++)`
  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    const forOffByOneMatch = lineText.match(/for\s*\(\s*(?:int\s+)?([a-zA-Z0-9_]+)\s*=\s*0\s*;\s*\1\s*<=\s*([a-zA-Z0-9_]+)\s*;\s*\1\+\+\s*\)/);
    if (forOffByOneMatch) {
      const idxVar = forOffByOneMatch[1];
      const boundVar = forOffByOneMatch[2];
      // If boundVar matches an array size
      issues.push({
        id: `for_off_by_one_${l + 1}`,
        category: 'memory',
        severity: 'warning',
        cwe: 'CWE-193: Off-by-one Error in Loop Guard',
        ruleId: 'MEM-007',
        title: `Suspected Off-by-One Loop Boundary ('<=' with 0-indexed count)`,
        description: `Loop initializes '${idxVar} = 0' and tests '${idxVar} <= ${boundVar}'. In C standard 0-indexed arrays of size N, this iterates N+1 times, risking an out-of-bounds access on the final iteration.`,
        line: l + 1,
        codeSnippet: lineText.trim(),
        suggestion: `Change condition from '${idxVar} <= ${boundVar}' to '${idxVar} < ${boundVar}' unless 1-indexed intentional offset is used.`,
        suggestedReplacement: {
          startLine: l + 1,
          endLine: l + 1,
          replacementCode: lineText.replace(new RegExp(`${idxVar}\\s*<=\\s*${boundVar}`), `${idxVar} < ${boundVar}`)
        }
      });
    }
  }

  // 5. Optimization Tips
  // Rule OPT-001: Loop invariant strlen() in for loop termination condition
  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    if (/for\s*\([^;]*;\s*[^;]*strlen\s*\([^)]+\)\s*;/.test(lineText)) {
      const match = lineText.match(/strlen\s*\(([^)]+)\)/);
      const strVar = match ? match[1].trim() : 'str';
      issues.push({
        id: `opt_strlen_loop_${l + 1}`,
        category: 'optimization',
        severity: 'warning',
        ruleId: 'OPT-001',
        title: `Loop Invariant 'strlen(${strVar})' in Termination Condition`,
        description: `'strlen(${strVar})' runs in O(N) time. Invoking it on every loop iteration turns this loop into an O(N²) quadratic bottleneck.`,
        line: l + 1,
        codeSnippet: lineText.trim(),
        suggestion: `Cache the string length before the loop: 'const size_t len = strlen(${strVar});' and compare against 'len'.`,
        suggestedReplacement: {
          startLine: l + 1,
          endLine: l + 1,
          replacementCode: `    const size_t len = strlen(${strVar});\n    ` + lineText.replace(/strlen\s*\([^)]+\)/, 'len')
        }
      });
    }
  }

  // Rule OPT-002: Dynamic allocation (malloc/calloc) inside a loop
  const loopNodes = allNodes.filter(n => ['ForStatement', 'WhileStatement', 'DoWhileStatement'].includes(n.type));
  for (const loopNode of loopNodes) {
    function findAllocInNode(n: ASTNode) {
      if (n.metadata?.isMemoryAllocation) {
        issues.push({
          id: `opt_malloc_in_loop_${n.lineStart}`,
          category: 'optimization',
          severity: 'info',
          ruleId: 'OPT-002',
          title: `Heap Allocation Inside Loop Body`,
          description: `Calling dynamic allocation inside a loop induces significant heap fragmentation and repeated kernel syscall overhead.`,
          line: n.lineStart,
          codeSnippet: lines[n.lineStart - 1]?.trim(),
          suggestion: `If buffer size is fixed or predictable, allocate the buffer once outside the loop and reuse it.`
        });
      }
      for (const child of n.children) {
        findAllocInNode(child);
      }
    }
    for (const child of loopNode.children) {
      findAllocInNode(child);
    }
  }

  // Rule OPT-003: Bitwise modulo optimization
  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    if (/\b%\s*2\b/.test(lineText) && (lineText.includes('for') || lineText.includes('if') || lineText.includes('while'))) {
      issues.push({
        id: `opt_bitwise_mod_${l + 1}`,
        category: 'optimization',
        severity: 'info',
        ruleId: 'OPT-004',
        title: `Bitwise Optimization Candidate ('% 2' -> '& 1')`,
        description: `Checking parity with 'x % 2 == 0' requires an integer division or rem instruction. For signed integers where x >= 0 or unsigned, '!(x & 1)' executes in 1 clock cycle.`,
        line: l + 1,
        codeSnippet: lineText.trim(),
        suggestion: `Consider using '(val & 1) == 0' for faster even/odd checks in performance-critical code.`
      });
    }
  }

  // Rule OPT-004: Uninitialized variable detection
  const uninitVarRegex = /\b(?:int|char|float|double|long)\s+([a-zA-Z0-9_]+)\s*;/g;
  for (let l = 0; l < lines.length; l++) {
    uninitVarRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = uninitVarRegex.exec(lines[l])) !== null) {
      const varName = match[1];
      // Check if next occurrence is reading it in an if or operation before assignment
      const nextLine = lines[l + 1] || '';
      if (new RegExp(`if\\s*\\(.*\\b${varName}\\b.*\\)`).test(nextLine) || new RegExp(`\\+=\\s*${varName}\\b`).test(nextLine)) {
        issues.push({
          id: `uninit_var_${varName}_${l + 1}`,
          category: 'memory',
          severity: 'critical',
          cwe: 'CWE-457: Use of Uninitialized Variable',
          ruleId: 'MEM-008',
          title: `Use of Uninitialized Variable '${varName}'`,
          description: `'${varName}' is declared without an initial value and accessed on subsequent lines. Reading uninitialized stack memory yields garbage values and undefined behavior.`,
          line: l + 1,
          codeSnippet: lines[l].trim(),
          suggestion: `Initialize '${varName}' explicitly upon declaration: e.g. 'int ${varName} = 0;'.`,
          suggestedReplacement: {
            startLine: l + 1,
            endLine: l + 1,
            replacementCode: lines[l].replace(new RegExp(`\\b${varName}\\s*;`), `${varName} = 0;`)
          }
        });
      }
    }
  }

  // Calculate Health Score (0 - 100)
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  let score = 100;
  score -= criticalCount * 22;
  score -= warningCount * 8;
  score -= infoCount * 2;

  // Complexity penalty if cyclomatic complexity is very high
  if (totalCyclomaticComplexity > 15) {
    score -= Math.min(15, (totalCyclomaticComplexity - 15) * 2);
  }

  const finalScore = Math.max(10, Math.min(100, Math.round(score)));

  let letterGrade: AnalysisResult['letterGrade'] = 'A+';
  if (finalScore >= 95) letterGrade = 'A+';
  else if (finalScore >= 85) letterGrade = 'A';
  else if (finalScore >= 70) letterGrade = 'B';
  else if (finalScore >= 55) letterGrade = 'C';
  else if (finalScore >= 40) letterGrade = 'D';
  else letterGrade = 'F';

  // Memory safety rating
  let memScore = 100;
  const memIssues = issues.filter(i => i.category === 'memory');
  memScore -= memIssues.filter(i => i.severity === 'critical').length * 28;
  memScore -= memIssues.filter(i => i.severity === 'warning').length * 12;
  const memorySafetyScore = Math.max(15, Math.min(100, Math.round(memScore)));

  const maintainabilityIndex = Math.max(
    20,
    Math.min(100, Math.round(171 - 5.2 * Math.log(Math.max(1, sloc)) - 0.23 * totalCyclomaticComplexity - 16.2 * Math.log(Math.max(1, totalLines))))
  );

  let summary = `Clean static analysis. No critical memory flaws detected.`;
  if (criticalCount > 0) {
    summary = `Alert: Found ${criticalCount} critical memory safety ${criticalCount === 1 ? 'vulnerability' : 'vulnerabilities'} that could lead to crashes or exploits.`;
  } else if (warningCount > 0) {
    summary = `Found ${warningCount} warnings and performance optimization opportunities.`;
  }

  const metrics: AnalysisMetrics = {
    totalLines,
    sloc,
    commentLines,
    blankLines,
    cyclomaticComplexity: totalCyclomaticComplexity,
    cognitiveComplexity: maxGlobalNesting * 2 + totalCyclomaticComplexity,
    maxNestingDepth: maxGlobalNesting,
    functionCount: functionMetrics.length,
    functions: functionMetrics,
    pointerCount: pointerMap.size,
    dynamicAllocCount: allocations.length,
    freedCount: allocations.filter(a => a.freed).length,
    memorySafetyScore,
    maintainabilityIndex
  };

  return {
    healthScore: finalScore,
    letterGrade,
    summary,
    timestamp: new Date().toLocaleTimeString(),
    metrics,
    issues,
    allocations
  };
}
