export type TokenType =
  | 'KEYWORD'
  | 'PREPROCESSOR'
  | 'DATATYPE'
  | 'IDENTIFIER'
  | 'NUMBER'
  | 'STRING'
  | 'CHAR'
  | 'OPERATOR'
  | 'PUNCTUATION'
  | 'COMMENT'
  | 'WHITESPACE'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
  length: number;
}

const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
  'size_t', 'ssize_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'bool', 'true', 'false', 'NULL'
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let col = 1;

  while (index < source.length) {
    const char = source[index];

    // Handle newlines
    if (char === '\n') {
      line++;
      col = 1;
      index++;
      continue;
    }

    // Handle whitespace
    if (/\s/.test(char)) {
      col++;
      index++;
      continue;
    }

    // Handle Comments
    if (char === '/' && index + 1 < source.length) {
      if (source[index + 1] === '/') {
        // Single line comment
        const startCol = col;
        let value = '';
        while (index < source.length && source[index] !== '\n') {
          value += source[index];
          index++;
          col++;
        }
        tokens.push({ type: 'COMMENT', value, line, col: startCol, length: value.length });
        continue;
      } else if (source[index + 1] === '*') {
        // Multi line comment
        const startLine = line;
        const startCol = col;
        let value = '/*';
        index += 2;
        col += 2;
        while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
          if (source[index] === '\n') {
            line++;
            col = 1;
          } else {
            col++;
          }
          value += source[index];
          index++;
        }
        if (index < source.length) {
          value += '*/';
          index += 2;
          col += 2;
        }
        tokens.push({ type: 'COMMENT', value, line: startLine, col: startCol, length: value.length });
        continue;
      }
    }

    // Preprocessor directives (#include, #define, etc.)
    if (char === '#') {
      const startCol = col;
      let value = '';
      while (index < source.length && source[index] !== '\n') {
        value += source[index];
        index++;
        col++;
      }
      tokens.push({ type: 'PREPROCESSOR', value: value.trim(), line, col: startCol, length: value.length });
      continue;
    }

    // Strings "..."
    if (char === '"') {
      const startCol = col;
      let value = '"';
      index++;
      col++;
      while (index < source.length && source[index] !== '"') {
        if (source[index] === '\\' && index + 1 < source.length) {
          value += source[index] + source[index + 1];
          index += 2;
          col += 2;
        } else if (source[index] === '\n') {
          line++;
          col = 1;
          value += '\n';
          index++;
        } else {
          value += source[index];
          index++;
          col++;
        }
      }
      if (index < source.length && source[index] === '"') {
        value += '"';
        index++;
        col++;
      }
      tokens.push({ type: 'STRING', value, line, col: startCol, length: value.length });
      continue;
    }

    // Character literals '...'
    if (char === "'") {
      const startCol = col;
      let value = "'";
      index++;
      col++;
      while (index < source.length && source[index] !== "'") {
        if (source[index] === '\\' && index + 1 < source.length) {
          value += source[index] + source[index + 1];
          index += 2;
          col += 2;
        } else {
          value += source[index];
          index++;
          col++;
        }
      }
      if (index < source.length && source[index] === "'") {
        value += "'";
        index++;
        col++;
      }
      tokens.push({ type: 'CHAR', value, line, col: startCol, length: value.length });
      continue;
    }

    // Numbers (decimal, hex, float)
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] || ''))) {
      const startCol = col;
      let value = '';
      if (char === '0' && (source[index + 1] === 'x' || source[index + 1] === 'X')) {
        value += source[index] + source[index + 1];
        index += 2;
        col += 2;
        while (index < source.length && /[0-9a-fA-F]/.test(source[index])) {
          value += source[index];
          index++;
          col++;
        }
      } else {
        while (index < source.length && /[0-9\.a-zA-Z_]/.test(source[index])) {
          value += source[index];
          index++;
          col++;
        }
      }
      tokens.push({ type: 'NUMBER', value, line, col: startCol, length: value.length });
      continue;
    }

    // Identifiers or Keywords
    if (/[a-zA-Z_]/.test(char)) {
      const startCol = col;
      let value = '';
      while (index < source.length && /[a-zA-Z0-9_]/.test(source[index])) {
        value += source[index];
        index++;
        col++;
      }
      const type = C_KEYWORDS.has(value) ? 'KEYWORD' : 'IDENTIFIER';
      tokens.push({ type, value, line, col: startCol, length: value.length });
      continue;
    }

    // Operators with multiple characters
    const twoChars = source.slice(index, index + 2);
    const threeChars = source.slice(index, index + 3);

    if (['<<=', '>>='].includes(threeChars)) {
      tokens.push({ type: 'OPERATOR', value: threeChars, line, col, length: 3 });
      index += 3;
      col += 3;
      continue;
    }

    if ([
      '++', '--', '==', '!=', '<=', '>=', '&&', '||', '->', '<<', '>>',
      '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^='
    ].includes(twoChars)) {
      tokens.push({ type: 'OPERATOR', value: twoChars, line, col, length: 2 });
      index += 2;
      col += 2;
      continue;
    }

    // Single character operators
    if (['+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':'].includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char, line, col, length: 1 });
      index++;
      col++;
      continue;
    }

    // Punctuation
    if (['(', ')', '{', '}', '[', ']', ';', ',', '.'].includes(char)) {
      tokens.push({ type: 'PUNCTUATION', value: char, line, col, length: 1 });
      index++;
      col++;
      continue;
    }

    // Fallback unknown character
    tokens.push({ type: 'OPERATOR', value: char, line, col, length: 1 });
    index++;
    col++;
  }

  tokens.push({ type: 'EOF', value: '', line, col, length: 0 });
  return tokens;
}
