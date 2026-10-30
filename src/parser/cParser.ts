import { Token, tokenize } from './lexer';
import { ASTNode, ASTNodeType, ASTCategory } from '../types/ast';

export class CParser {
  private tokens: Token[] = [];
  private current = 0;
  private nodeIdCounter = 0;
  private sourceLines: string[] = [];

  constructor(private source: string) {
    this.sourceLines = source.split('\n');
    this.tokens = tokenize(source);
  }

  private nextId(): string {
    return `node_${++this.nodeIdCounter}`;
  }

  private peek(offset = 0): Token {
    const idx = this.current + offset;
    if (idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // EOF
    }
    return this.tokens[idx];
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.tokens[this.current - 1];
  }

  private match(...values: string[]): boolean {
    for (const val of values) {
      if (this.check(val)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(value: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().value === value;
  }

  private checkType(type: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  public parse(): ASTNode {
    const root: ASTNode = {
      id: 'root',
      type: 'TranslationUnit',
      label: 'Translation Unit (Program)',
      detail: `${this.sourceLines.length} lines of C code`,
      category: 'root',
      lineStart: 1,
      lineEnd: Math.max(1, this.sourceLines.length),
      children: [],
      metadata: {}
    };

    while (!this.isAtEnd()) {
      try {
        const node = this.parseTopLevelItem();
        if (node) {
          root.children.push(node);
        } else {
          this.advance();
        }
      } catch (e) {
        // Recovery mechanism: advance until semicolon or brace
        this.advance();
      }
    }

    return root;
  }

  private parseTopLevelItem(): ASTNode | null {
    const token = this.peek();

    // 1. Comments
    if (token.type === 'COMMENT') {
      const t = this.advance();
      return {
        id: this.nextId(),
        type: 'Comment',
        label: t.value.length > 30 ? t.value.slice(0, 30) + '...' : t.value,
        category: 'literal',
        lineStart: t.line,
        lineEnd: t.line,
        children: []
      };
    }

    // 2. Preprocessor directives (#include, #define)
    if (token.type === 'PREPROCESSOR') {
      const t = this.advance();
      const isInclude = t.value.startsWith('#include');
      const isDefine = t.value.startsWith('#define');

      return {
        id: this.nextId(),
        type: isInclude ? 'IncludeDirective' : isDefine ? 'DefineDirective' : 'IncludeDirective',
        label: t.value,
        detail: isInclude ? 'Header Inclusion' : isDefine ? 'Macro Definition' : 'Directive',
        category: 'directive',
        lineStart: t.line,
        lineEnd: t.line,
        children: [],
        metadata: {
          directiveText: t.value
        }
      };
    }

    // 3. Functions or Global Variable Declarations
    return this.parseDeclarationOrFunction();
  }

  private parseDeclarationOrFunction(): ASTNode | null {
    const startToken = this.peek();
    const typeTokens: Token[] = [];

    // Collect type qualifiers and specifiers
    while (
      !this.isAtEnd() &&
      (this.isTypeSpecifier(this.peek().value) ||
       ['unsigned', 'signed', 'long', 'short', 'const', 'static', 'volatile', 'struct'].includes(this.peek().value) ||
       this.peek().value === '*')
    ) {
      typeTokens.push(this.advance());
    }

    if (typeTokens.length === 0) {
      // Not a standard type declaration, might be a statement or unknown
      const t = this.advance();
      return {
        id: this.nextId(),
        type: 'Unknown',
        label: t.value,
        category: 'statement',
        lineStart: t.line,
        lineEnd: t.line,
        children: []
      };
    }

    const typeStr = typeTokens.map(t => t.value).join(' ');

    // Next token should be identifier
    if (this.checkType('IDENTIFIER') || this.checkType('KEYWORD')) {
      const nameToken = this.advance();
      const identifier = nameToken.value;

      // Check if this is a function definition or declaration: `identifier (`
      if (this.check('(')) {
        return this.parseFunction(typeStr, identifier, startToken.line);
      }

      // Check if global variable or array declaration
      return this.parseVariableDeclaration(typeStr, identifier, startToken.line);
    }

    // Semicolon alone or typedef
    if (this.check(';')) {
      this.advance();
    }

    return null;
  }

  private parseFunction(returnType: string, functionName: string, startLine: number): ASTNode {
    this.advance(); // consume '('
    const paramChildren: ASTNode[] = [];
    const paramsList: string[] = [];

    while (!this.isAtEnd() && !this.check(')')) {
      const pStart = this.peek();
      const pTypeTokens: Token[] = [];

      while (
        !this.isAtEnd() &&
        !this.check(',') &&
        !this.check(')') &&
        (this.isTypeSpecifier(this.peek().value) ||
         ['unsigned', 'signed', 'long', 'short', 'const', 'struct'].includes(this.peek().value) ||
         this.peek().value === '*')
      ) {
        pTypeTokens.push(this.advance());
      }

      let pName = '';
      if (!this.isAtEnd() && !this.check(',') && !this.check(')')) {
        pName = this.advance().value;
      }

      // Array brackets on parameter e.g. `char arr[]`
      let isArray = false;
      if (this.check('[')) {
        isArray = true;
        while (!this.isAtEnd() && !this.check(']')) this.advance();
        if (this.check(']')) this.advance();
      }

      const pTypeStr = pTypeTokens.map(t => t.value).join(' ') + (isArray ? '[]' : '');
      const fullParamStr = pName ? `${pTypeStr} ${pName}` : pTypeStr;
      if (fullParamStr) {
        paramsList.push(fullParamStr);
        paramChildren.push({
          id: this.nextId(),
          type: 'Parameter',
          label: pName ? `param: ${pName}` : `param: (${pTypeStr})`,
          detail: `Type: ${pTypeStr}`,
          category: 'declaration',
          lineStart: pStart.line,
          lineEnd: this.peek().line,
          children: [],
          metadata: {
            dataType: pTypeStr,
            identifier: pName,
            isPointer: pTypeStr.includes('*') || isArray
          }
        });
      }

      if (this.check(',')) {
        this.advance();
      }
    }

    if (this.check(')')) {
      this.advance();
    }

    const paramListNode: ASTNode = {
      id: this.nextId(),
      type: 'ParameterList',
      label: `Parameters (${paramChildren.length})`,
      detail: paramsList.join(', ') || 'void',
      category: 'declaration',
      lineStart: startLine,
      lineEnd: startLine,
      children: paramChildren,
      metadata: { paramCount: paramChildren.length }
    };

    // Check if this is a function declaration (prototype ending with ';') or definition with '{'
    if (this.check(';')) {
      const semiToken = this.advance();
      return {
        id: this.nextId(),
        type: 'FunctionDeclaration',
        label: `${functionName}(${paramsList.join(', ')})`,
        detail: `Return: ${returnType} (Prototype)`,
        category: 'function',
        lineStart: startLine,
        lineEnd: semiToken.line,
        children: [paramListNode],
        metadata: {
          functionName,
          dataType: returnType,
          paramCount: paramChildren.length
        }
      };
    }

    // Function body `{ ... }`
    let bodyNode: ASTNode | null = null;
    let endLine = startLine;

    if (this.check('{')) {
      bodyNode = this.parseCompoundStatement();
      endLine = bodyNode ? bodyNode.lineEnd : startLine;
    }

    const children: ASTNode[] = [paramListNode];
    if (bodyNode) {
      children.push(bodyNode);
    }

    return {
      id: this.nextId(),
      type: 'FunctionDefinition',
      label: `Function: ${functionName}()`,
      detail: `Returns ${returnType} | ${paramChildren.length} params`,
      category: 'function',
      lineStart: startLine,
      lineEnd: endLine,
      children,
      metadata: {
        functionName,
        dataType: returnType,
        paramCount: paramChildren.length
      }
    };
  }

  private parseCompoundStatement(): ASTNode {
    const openToken = this.advance(); // consume '{'
    const startLine = openToken.line;
    const statements: ASTNode[] = [];

    while (!this.isAtEnd() && !this.check('}')) {
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      } else {
        this.advance();
      }
    }

    let endLine = startLine;
    if (this.check('}')) {
      const closeToken = this.advance();
      endLine = closeToken.line;
    }

    return {
      id: this.nextId(),
      type: 'CompoundStatement',
      label: `{ Compound Block }`,
      detail: `${statements.length} statements`,
      category: 'statement',
      lineStart: startLine,
      lineEnd: endLine,
      children: statements
    };
  }

  private parseStatement(): ASTNode | null {
    if (this.isAtEnd() || this.check('}')) return null;

    const token = this.peek();

    // 1. Comments inside block
    if (token.type === 'COMMENT') {
      const t = this.advance();
      return {
        id: this.nextId(),
        type: 'Comment',
        label: t.value.length > 30 ? t.value.slice(0, 30) + '...' : t.value,
        category: 'literal',
        lineStart: t.line,
        lineEnd: t.line,
        children: []
      };
    }

    // 2. Nested block
    if (token.value === '{') {
      return this.parseCompoundStatement();
    }

    // 3. For loop
    if (token.value === 'for') {
      return this.parseForStatement();
    }

    // 4. While loop
    if (token.value === 'while') {
      return this.parseWhileStatement();
    }

    // 5. Do-while loop
    if (token.value === 'do') {
      return this.parseDoWhileStatement();
    }

    // 6. If / Else statement
    if (token.value === 'if') {
      return this.parseIfStatement();
    }

    // 7. Return statement
    if (token.value === 'return') {
      return this.parseReturnStatement();
    }

    // 8. Break / Continue
    if (token.value === 'break' || token.value === 'continue') {
      const t = this.advance();
      if (this.check(';')) this.advance();
      return {
        id: this.nextId(),
        type: t.value === 'break' ? 'BreakStatement' : 'ContinueStatement',
        label: t.value + ';',
        category: 'statement',
        lineStart: t.line,
        lineEnd: t.line,
        children: []
      };
    }

    // 9. Variable Declaration: starts with type specifier
    if (this.isTypeSpecifier(token.value) || ['unsigned', 'signed', 'const', 'static', 'struct'].includes(token.value)) {
      return this.parseLocalVariableDeclaration();
    }

    // 10. Expression Statement (Assignments, Function Calls like `printf`, `free`)
    return this.parseExpressionStatement();
  }

  private parseForStatement(): ASTNode {
    const forToken = this.advance(); // consume 'for'
    const startLine = forToken.line;

    let initStr = '';
    let condStr = '';
    let incStr = '';

    if (this.check('(')) {
      this.advance(); // consume '('

      // Parse init clause until ';'
      const initTokens: Token[] = [];
      while (!this.isAtEnd() && !this.check(';')) {
        initTokens.push(this.advance());
      }
      initStr = initTokens.map(t => t.value).join(' ');
      if (this.check(';')) this.advance();

      // Parse condition clause until ';'
      const condTokens: Token[] = [];
      while (!this.isAtEnd() && !this.check(';')) {
        condTokens.push(this.advance());
      }
      condStr = condTokens.map(t => t.value).join(' ');
      if (this.check(';')) this.advance();

      // Parse increment clause until ')'
      const incTokens: Token[] = [];
      while (!this.isAtEnd() && !this.check(')')) {
        incTokens.push(this.advance());
      }
      incStr = incTokens.map(t => t.value).join(' ');
      if (this.check(')')) this.advance();
    }

    // Parse Body
    let bodyNode: ASTNode | null = null;
    let endLine = startLine;

    if (this.check('{')) {
      bodyNode = this.parseCompoundStatement();
      endLine = bodyNode.lineEnd;
    } else {
      bodyNode = this.parseStatement();
      if (bodyNode) endLine = bodyNode.lineEnd;
    }

    const children: ASTNode[] = [];

    // Add Loop Clauses as sub-nodes for rich AST exploration
    if (initStr) {
      children.push({
        id: this.nextId(),
        type: 'ExpressionStatement',
        label: `Init: ${initStr}`,
        category: 'expression',
        lineStart: startLine,
        lineEnd: startLine,
        children: [],
        metadata: { initStr }
      });
    }

    if (condStr) {
      children.push({
        id: this.nextId(),
        type: 'BinaryExpression',
        label: `Condition: ${condStr}`,
        category: 'condition',
        lineStart: startLine,
        lineEnd: startLine,
        children: [],
        metadata: { conditionStr: condStr }
      });
    }

    if (incStr) {
      children.push({
        id: this.nextId(),
        type: 'UnaryExpression',
        label: `Step: ${incStr}`,
        category: 'expression',
        lineStart: startLine,
        lineEnd: startLine,
        children: [],
        metadata: { incStr }
      });
    }

    if (bodyNode) {
      children.push(bodyNode);
    }

    const shortLabel = `for (${initStr || ' '}; ${condStr || ' '}; ${incStr || ' '})`;

    return {
      id: this.nextId(),
      type: 'ForStatement',
      label: shortLabel.length > 45 ? shortLabel.slice(0, 42) + '...)' : shortLabel,
      detail: `Iteration Loop (bounds: ${condStr || 'unbounded'})`,
      category: 'loop',
      lineStart: startLine,
      lineEnd: endLine,
      children,
      metadata: {
        initStr,
        conditionStr: condStr,
        incStr
      }
    };
  }

  private parseWhileStatement(): ASTNode {
    const whileToken = this.advance(); // consume 'while'
    const startLine = whileToken.line;

    let condStr = '';
    if (this.check('(')) {
      this.advance();
      const condTokens: Token[] = [];
      let parenCount = 1;
      while (!this.isAtEnd() && parenCount > 0) {
        if (this.check('(')) parenCount++;
        if (this.check(')')) parenCount--;
        if (parenCount > 0) {
          condTokens.push(this.advance());
        }
      }
      condStr = condTokens.map(t => t.value).join(' ');
      if (this.check(')')) this.advance();
    }

    let bodyNode: ASTNode | null = null;
    let endLine = startLine;

    if (this.check('{')) {
      bodyNode = this.parseCompoundStatement();
      endLine = bodyNode.lineEnd;
    } else {
      bodyNode = this.parseStatement();
      if (bodyNode) endLine = bodyNode.lineEnd;
    }

    const children: ASTNode[] = [];
    if (condStr) {
      children.push({
        id: this.nextId(),
        type: 'BinaryExpression',
        label: `Condition: ${condStr}`,
        category: 'condition',
        lineStart: startLine,
        lineEnd: startLine,
        children: [],
        metadata: { conditionStr: condStr }
      });
    }
    if (bodyNode) children.push(bodyNode);

    return {
      id: this.nextId(),
      type: 'WhileStatement',
      label: `while (${condStr})`,
      detail: `While Loop`,
      category: 'loop',
      lineStart: startLine,
      lineEnd: endLine,
      children,
      metadata: { conditionStr: condStr }
    };
  }

  private parseDoWhileStatement(): ASTNode {
    const doToken = this.advance(); // consume 'do'
    const startLine = doToken.line;
    let bodyNode: ASTNode | null = null;

    if (this.check('{')) {
      bodyNode = this.parseCompoundStatement();
    } else {
      bodyNode = this.parseStatement();
    }

    let condStr = '';
    let endLine = bodyNode ? bodyNode.lineEnd : startLine;

    if (this.check('while')) {
      this.advance();
      if (this.check('(')) {
        this.advance();
        const condTokens: Token[] = [];
        while (!this.isAtEnd() && !this.check(')')) {
          condTokens.push(this.advance());
        }
        condStr = condTokens.map(t => t.value).join(' ');
        if (this.check(')')) this.advance();
      }
      if (this.check(';')) {
        const semi = this.advance();
        endLine = semi.line;
      }
    }

    const children: ASTNode[] = [];
    if (bodyNode) children.push(bodyNode);
    if (condStr) {
      children.push({
        id: this.nextId(),
        type: 'BinaryExpression',
        label: `Condition: ${condStr}`,
        category: 'condition',
        lineStart: endLine,
        lineEnd: endLine,
        children: []
      });
    }

    return {
      id: this.nextId(),
      type: 'DoWhileStatement',
      label: `do ... while (${condStr})`,
      detail: 'Do-While Loop',
      category: 'loop',
      lineStart: startLine,
      lineEnd: endLine,
      children,
      metadata: { conditionStr: condStr }
    };
  }

  private parseIfStatement(): ASTNode {
    const ifToken = this.advance(); // consume 'if'
    const startLine = ifToken.line;

    let condStr = '';
    if (this.check('(')) {
      this.advance();
      const condTokens: Token[] = [];
      let parenCount = 1;
      while (!this.isAtEnd() && parenCount > 0) {
        if (this.check('(')) parenCount++;
        if (this.check(')')) parenCount--;
        if (parenCount > 0) {
          condTokens.push(this.advance());
        }
      }
      condStr = condTokens.map(t => t.value).join(' ');
      if (this.check(')')) this.advance();
    }

    // Then Branch
    let thenNode: ASTNode | null = null;
    let endLine = startLine;

    if (this.check('{')) {
      thenNode = this.parseCompoundStatement();
      endLine = thenNode.lineEnd;
    } else {
      thenNode = this.parseStatement();
      if (thenNode) endLine = thenNode.lineEnd;
    }

    const children: ASTNode[] = [];

    // Condition sub-node
    children.push({
      id: this.nextId(),
      type: 'BinaryExpression',
      label: `Condition: ${condStr}`,
      detail: 'Evaluated branch guard',
      category: 'condition',
      lineStart: startLine,
      lineEnd: startLine,
      children: [],
      metadata: { conditionStr: condStr }
    });

    if (thenNode) {
      children.push({
        id: this.nextId(),
        type: 'CompoundStatement',
        label: 'Then Branch',
        category: 'statement',
        lineStart: thenNode.lineStart,
        lineEnd: thenNode.lineEnd,
        children: thenNode.children.length > 0 ? thenNode.children : [thenNode]
      });
    }

    // Else Branch (optional)
    if (this.check('else')) {
      const elseToken = this.advance();
      let elseNode: ASTNode | null = null;

      if (this.check('if')) {
        // Else If
        elseNode = this.parseIfStatement();
        endLine = elseNode.lineEnd;
      } else if (this.check('{')) {
        elseNode = this.parseCompoundStatement();
        endLine = elseNode.lineEnd;
      } else {
        elseNode = this.parseStatement();
        if (elseNode) endLine = elseNode.lineEnd;
      }

      if (elseNode) {
        children.push({
          id: this.nextId(),
          type: 'ElseClause',
          label: 'Else Branch',
          category: 'condition',
          lineStart: elseToken.line,
          lineEnd: endLine,
          children: elseNode.children.length > 0 ? elseNode.children : [elseNode]
        });
      }
    }

    return {
      id: this.nextId(),
      type: 'IfStatement',
      label: `if (${condStr})`,
      detail: 'Conditional Branching',
      category: 'condition',
      lineStart: startLine,
      lineEnd: endLine,
      children,
      metadata: { conditionStr: condStr }
    };
  }

  private parseReturnStatement(): ASTNode {
    const returnToken = this.advance(); // consume 'return'
    const startLine = returnToken.line;

    const exprTokens: Token[] = [];
    while (!this.isAtEnd() && !this.check(';')) {
      exprTokens.push(this.advance());
    }

    let endLine = startLine;
    if (this.check(';')) {
      endLine = this.advance().line;
    }

    const exprStr = exprTokens.map(t => t.value).join(' ');

    return {
      id: this.nextId(),
      type: 'ReturnStatement',
      label: exprStr ? `return ${exprStr};` : 'return;',
      detail: 'Function Exit',
      category: 'statement',
      lineStart: startLine,
      lineEnd: endLine,
      children: exprStr ? [{
        id: this.nextId(),
        type: 'Literal',
        label: exprStr,
        category: 'expression',
        lineStart: startLine,
        lineEnd: endLine,
        children: []
      }] : [],
      metadata: { returnExpr: exprStr }
    };
  }

  private parseLocalVariableDeclaration(): ASTNode {
    const startToken = this.peek();
    const typeTokens: Token[] = [];

    while (
      !this.isAtEnd() &&
      (this.isTypeSpecifier(this.peek().value) ||
       ['unsigned', 'signed', 'long', 'short', 'const', 'static', 'struct'].includes(this.peek().value) ||
       this.peek().value === '*')
    ) {
      typeTokens.push(this.advance());
    }

    let isPointer = typeTokens.some(t => t.value === '*');
    let identifier = '';

    // Collect asterisks directly attached to identifier
    while (this.check('*')) {
      this.advance();
      isPointer = true;
    }

    if (this.checkType('IDENTIFIER')) {
      identifier = this.advance().value;
    }

    return this.parseVariableDeclaration(typeTokens.map(t => t.value).join(' '), identifier, startToken.line, isPointer);
  }

  private parseVariableDeclaration(typeStr: string, identifier: string, startLine: number, isExplicitPointer = false): ASTNode {
    let isPointer = isExplicitPointer || typeStr.includes('*');
    let isArray = false;
    let arraySize = 0;

    // Check for array dimensions e.g. `arr[100]`
    if (this.check('[')) {
      isArray = true;
      this.advance(); // '['
      if (this.checkType('NUMBER')) {
        arraySize = parseInt(this.advance().value, 10);
      }
      if (this.check(']')) this.advance();
    }

    let initExpr = '';
    let isMemoryAllocation = false;
    let allocFunc = '';
    const childNodes: ASTNode[] = [];

    // Check initializer e.g. `= malloc(size)`
    if (this.check('=')) {
      this.advance(); // consume '='
      const initTokens: Token[] = [];
      while (!this.isAtEnd() && !this.check(';') && !this.check(',')) {
        const t = this.advance();
        initTokens.push(t);
        if (['malloc', 'calloc', 'realloc', 'aligned_alloc'].includes(t.value)) {
          isMemoryAllocation = true;
          allocFunc = t.value;
        }
      }
      initExpr = initTokens.map(t => t.value).join(' ');
    }

    let endLine = startLine;
    if (this.check(';')) {
      endLine = this.advance().line;
    }

    if (isMemoryAllocation) {
      childNodes.push({
        id: this.nextId(),
        type: 'FunctionCall',
        label: `${allocFunc}(...)`,
        detail: `Dynamic Heap Allocation -> ${identifier}`,
        category: 'memory',
        lineStart: startLine,
        lineEnd: endLine,
        children: [],
        metadata: {
          functionName: allocFunc,
          isMemoryAllocation: true,
          identifier
        }
      });
    }

    const label = `${typeStr} ${identifier}${isArray ? `[${arraySize || ''}]` : ''}${initExpr ? ` = ${initExpr}` : ''};`;

    return {
      id: this.nextId(),
      type: 'VariableDeclaration',
      label: label.length > 45 ? label.slice(0, 42) + '...;' : label,
      detail: `Type: ${typeStr}${isPointer ? ' (Pointer)' : ''}${isArray ? ` [Array of ${arraySize}]` : ''}`,
      category: isMemoryAllocation ? 'memory' : 'declaration',
      lineStart: startLine,
      lineEnd: endLine,
      children: childNodes,
      metadata: {
        identifier,
        dataType: typeStr,
        isPointer,
        isArray,
        arraySize,
        initStr: initExpr,
        isMemoryAllocation,
        allocFunc
      }
    };
  }

  private parseExpressionStatement(): ASTNode {
    const startToken = this.peek();
    const exprTokens: Token[] = [];
    let isCall = false;
    let callName = '';
    let isAssignment = false;
    let isFreeCall = false;
    let freedPointer = '';

    while (!this.isAtEnd() && !this.check(';')) {
      const t = this.advance();
      exprTokens.push(t);

      if (['=', '+=', '-=', '*=', '/=', '%='].includes(t.value)) {
        isAssignment = true;
      }

      if (t.type === 'IDENTIFIER' && this.check('(')) {
        isCall = true;
        callName = t.value;
        if (callName === 'free') {
          isFreeCall = true;
          // Lookahead inside free(ptr)
          const next = this.peek(1);
          if (next && next.type === 'IDENTIFIER') {
            freedPointer = next.value;
          }
        }
      }
    }

    let endLine = startToken.line;
    if (this.check(';')) {
      endLine = this.advance().line;
    }

    const exprStr = exprTokens.map(t => t.value).join(' ');

    if (isFreeCall) {
      return {
        id: this.nextId(),
        type: 'FunctionCall',
        label: `free(${freedPointer || '...'})`,
        detail: `Deallocate Heap Memory: ${freedPointer}`,
        category: 'memory',
        lineStart: startToken.line,
        lineEnd: endLine,
        children: [],
        metadata: {
          functionName: 'free',
          isMemoryFree: true,
          identifier: freedPointer
        }
      };
    }

    if (isCall) {
      return {
        id: this.nextId(),
        type: 'FunctionCall',
        label: exprStr.length > 40 ? exprStr.slice(0, 37) + '...' : exprStr + ';',
        detail: `Call: ${callName}()`,
        category: 'expression',
        lineStart: startToken.line,
        lineEnd: endLine,
        children: [],
        metadata: {
          functionName: callName,
          exprStr
        }
      };
    }

    return {
      id: this.nextId(),
      type: isAssignment ? 'AssignmentExpression' : 'ExpressionStatement',
      label: exprStr.length > 40 ? exprStr.slice(0, 37) + '...' : exprStr + ';',
      detail: isAssignment ? 'Assignment Operation' : 'Expression',
      category: 'expression',
      lineStart: startToken.line,
      lineEnd: endLine,
      children: [],
      metadata: { exprStr }
    };
  }

  private isTypeSpecifier(val: string): boolean {
    return [
      'int', 'char', 'float', 'double', 'void', 'short', 'long',
      'size_t', 'ssize_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t',
      'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'bool', 'FILE', 'DIR'
    ].includes(val);
  }
}

export function parseCCode(source: string): ASTNode {
  const parser = new CParser(source);
  return parser.parse();
}
