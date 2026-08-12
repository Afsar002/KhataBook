/**
 * Zero-dependency math expression evaluator.
 *
 * Supports +, -, ×, ÷ with standard precedence (BODMAS/PEMDAS).
 * No eval(), no new Function(), no external packages.
 * Maps visual × and ÷ to * and / internally.
 */

interface NumberToken {
  type: 'number';
  value: number;
}

interface OperatorToken {
  type: 'operator';
  value: string;
}

type Token = NumberToken | OperatorToken;

/**
 * Tokenize the expression string into numbers and operators.
 * Handles multi-digit numbers, decimals, and the visual symbols × and ÷.
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const ch = expr[i];

    // Skip whitespace
    if (ch === ' ') {
      i++;
      continue;
    }

    // Number (including decimal)
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let numStr = '';
      let hasDot = false;
      while (i < len) {
        const c = expr[i];
        if (c >= '0' && c <= '9') {
          numStr += c;
        } else if (c === '.' && !hasDot) {
          hasDot = true;
          numStr += c;
        } else {
          break;
        }
        i++;
      }
      tokens.push({ type: 'number', value: parseFloat(numStr) });
      continue;
    }

    // Operators: + - × ÷
    if (ch === '+' || ch === '-' || ch === '×' || ch === '÷' || ch === '*' || ch === '/') {
      let op = ch;
      if (ch === '×') op = '*';
      if (ch === '÷') op = '/';
      tokens.push({ type: 'operator', value: op });
      i++;
      continue;
    }

    // Unknown character - skip
    i++;
  }

  return tokens;
}

/**
 * Evaluate tokens with operator precedence (BODMAS/PEMDAS).
 * First pass: handle * and /
 * Second pass: handle + and -
 */
function evaluateTokens(tokens: Token[]): number {
  if (tokens.length === 0) return 0;

  // First pass: multiplication and division
  const firstPass: Token[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === 'number') {
      firstPass.push(token);
    } else if (token.type === 'operator' && (token.value === '*' || token.value === '/')) {
      // Pop the last number
      const left = firstPass.pop();
      if (!left || left.type !== 'number') {
        firstPass.push(token);
        i++;
        continue;
      }

      // Get the next number
      i++;
      if (i >= tokens.length) break;
      const right = tokens[i];
      if (right.type !== 'number') {
        firstPass.push(token);
        continue;
      }

      // Compute
      let result: number;
      if (token.value === '*') {
        result = left.value * right.value;
      } else {
        result = right.value !== 0 ? left.value / right.value : 0;
      }

      firstPass.push({ type: 'number', value: result });
    } else {
      firstPass.push(token);
    }
    i++;
  }

  // Second pass: addition and subtraction
  let result = 0;
  let currentOp: string = '+';
  i = 0;

  while (i < firstPass.length) {
    const token = firstPass[i];

    if (token.type === 'number') {
      if (currentOp === '+') result += token.value;
      else if (currentOp === '-') result -= token.value;
    } else if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      currentOp = token.value;
    }
    i++;
  }

  return result;
}

/**
 * Safely evaluate a math expression string.
 * Returns NaN if the expression is invalid or empty.
 */
export function evaluateExpression(expr: string): number {
  const trimmed = expr.trim();
  if (!trimmed) return NaN;

  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return NaN;

    // Expression must start with a number
    if (tokens[0].type !== 'number') return NaN;

    // Expression must end with a number
    if (tokens[tokens.length - 1].type !== 'number') return NaN;

    // No two operators in a row
    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].type === 'operator' && tokens[i - 1].type === 'operator') {
        return NaN;
      }
    }

    return evaluateTokens(tokens);
  } catch {
    return NaN;
  }
}

/**
 * Check if an expression is complete (ends with a number, ready for =)
 */
export function isExpressionComplete(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;
  const lastChar = trimmed[trimmed.length - 1];
  return lastChar >= '0' && lastChar <= '9';
}

/**
 * Format a number for display (remove trailing .0, limit decimals)
 */
export function formatResult(value: number): string {
  if (!isFinite(value) || isNaN(value)) return 'Error';
  // Limit to 10 decimal places, remove trailing zeros
  const str = value.toFixed(10).replace(/\.?0+$/, '');
  return str;
}