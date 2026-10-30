// Define standard token types relevant for C static analysis
export type TokenType =
  | 'KEYWORD'      // if, else, while, for, return, break, continue
  | 'DATATYPE'     // int, float, char, double, void, struct
  | 'IDENTIFIER'   // variable and function names
  | 'NUMBER'       // integer and floating-point literals
  | 'STRING'       // string literals "..."

  | 'OPERATOR'     // +, -, *, /, =, ==, !=, <, >, &&, ||
  | 'PUNCTUATION'  // ;, ,, (, ), {, }, [, ]
  | 'COMMENT'      // single-line // or multi-line /* ... */
  | 'WHITESPACE';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export interface TokenRule {
  type: TokenType;
  regex: RegExp;
}

// Token rules evaluated in sequential order
export const TOKEN_RULES: TokenRule[] = [
  // Multi-line and Single-line Comments
  { type: 'COMMENT', regex: /^\/\*[\s\S]*?\*\/|^\/\/.*/ },

  // Whitespace (tracked for indexing, usually filtered before parsing)
  { type: 'WHITESPACE', regex: /^\s+/ },

  // C Control Keywords
  { type: 'KEYWORD', regex: /^(?:if|else|for|while|do|return|break|continue|switch|case|default|struct)\b/ },

  // Primitive Data Types
  { type: 'DATATYPE', regex: /^(?:int|float|double|char|void|long|short|unsigned|signed)\b/ },

  // Identifiers (Variable and function names)
  { type: 'IDENTIFIER', regex: /^[a-zA-Z_][a-zA-Z0-9_]*/ },

  // String Literals
  { type: 'STRING', regex: /^"[^"\\]*(?:\\.[^"\\]*)*"/ },

  // Numeric Constants (Floating point and Integers)
  { type: 'NUMBER', regex: /^\d+(?:\.\d+)?\b/ },

  // Multi-character and Single-character Operators
  { type: 'OPERATOR', regex: /^(?:==|!=|<=|>=|&&|\|\||\+\+|--|->|\+|-|\*|\/|=|<|>|&|\||!)/ },

  // Structural Punctuation
  { type: 'PUNCTUATION', regex: /^[;.,()\[\]{}]/ }
];