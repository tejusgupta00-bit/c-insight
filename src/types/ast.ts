export type ASTNodeType =
  | 'TranslationUnit'
  | 'IncludeDirective'
  | 'DefineDirective'
  | 'FunctionDefinition'
  | 'FunctionDeclaration'
  | 'ParameterList'
  | 'Parameter'
  | 'CompoundStatement'
  | 'VariableDeclaration'
  | 'TypeSpecifier'
  | 'ForStatement'
  | 'WhileStatement'
  | 'DoWhileStatement'
  | 'IfStatement'
  | 'ElseClause'
  | 'ReturnStatement'
  | 'BreakStatement'
  | 'ContinueStatement'
  | 'ExpressionStatement'
  | 'AssignmentExpression'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'FunctionCall'
  | 'ArgumentList'
  | 'Identifier'
  | 'Literal'
  | 'ArrayAccess'
  | 'PointerDereference'
  | 'AddressOf'
  | 'MemberAccess'
  | 'Comment'
  | 'Unknown';

export type ASTCategory =
  | 'root'
  | 'directive'
  | 'function'
  | 'declaration'
  | 'loop'
  | 'condition'
  | 'statement'
  | 'expression'
  | 'memory'
  | 'literal';

export interface ASTNode {
  id: string;
  type: ASTNodeType;
  label: string;
  detail?: string;
  category: ASTCategory;
  lineStart: number;
  lineEnd: number;
  colStart?: number;
  colEnd?: number;
  children: ASTNode[];
  metadata?: {
    identifier?: string;
    dataType?: string;
    operator?: string;
    value?: string | number;
    isPointer?: boolean;
    isArray?: boolean;
    arraySize?: number;
    conditionStr?: string;
    initStr?: string;
    incStr?: string;
    isMemoryAllocation?: boolean;
    isMemoryFree?: boolean;
    paramCount?: number;
    functionName?: string;
    [key: string]: any;
  };
}
