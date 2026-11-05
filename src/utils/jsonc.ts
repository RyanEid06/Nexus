/**
 * Robust JSONC parser for tsconfig.json and jsconfig.json.
 * Handles single-line comments, multi-line comments, and trailing commas
 * while protecting strings containing comment characters (e.g. "https://...", "/*").
 */

export interface TsConfigAliases {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

/**
 * Strips comments and trailing commas from a JSONC string safely.
 */
export function stripJsonc(text: string): string {
  let inString = false;
  let quoteChar = '';
  let isEscaped = false;
  let out = '';
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : '';

    if (inString) {
      out += ch;
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === quoteChar) {
        inString = false;
      }
      continue;
    }

    // Entering string literal
    if (ch === '"' || ch === "'") {
      inString = true;
      quoteChar = ch;
      out += ch;
      continue;
    }

    // Single line comment: // ...
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && text[i] !== '\n' && text[i] !== '\r') {
        i++;
      }
      if (i < len) {
        out += text[i]; // preserve newline for line continuity
      }
      continue;
    }

    // Multi-line comment: /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(text[i] === '*' && i + 1 < len && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n'; // preserve line numbers
        i++;
      }
      i++; // skip '/'
      continue;
    }

    // Trailing comma check outside strings:
    // If comma is followed by optional whitespace/comments and closing bracket/brace
    if (ch === ',') {
      let lookahead = i + 1;
      let isTrailing = false;
      while (lookahead < len) {
        const la = text[lookahead];
        if (la === ' ' || la === '\t' || la === '\n' || la === '\r') {
          lookahead++;
          continue;
        }
        // If there's a comment in lookahead, handle it
        if (la === '/' && lookahead + 1 < len && text[lookahead + 1] === '/') {
          lookahead += 2;
          while (lookahead < len && text[lookahead] !== '\n' && text[lookahead] !== '\r') {
            lookahead++;
          }
          continue;
        }
        if (la === '/' && lookahead + 1 < len && text[lookahead + 1] === '*') {
          lookahead += 2;
          while (lookahead < len && !(text[lookahead] === '*' && lookahead + 1 < len && text[lookahead + 1] === '/')) {
            lookahead++;
          }
          lookahead += 2;
          continue;
        }
        if (la === '}' || la === ']') {
          isTrailing = true;
        }
        break;
      }

      if (isTrailing) {
        // Skip this comma!
        continue;
      }
    }

    out += ch;
  }

  return out;
}

/**
 * Parses JSONC text safely.
 */
export function parseJsonc<T = unknown>(text: string): T {
  const cleaned = stripJsonc(text);
  return JSON.parse(cleaned) as T;
}

/**
 * Extracts compilerOptions.baseUrl and compilerOptions.paths from tsconfig.json or jsconfig.json.
 */
export function parseTsConfigAliases(jsoncText: string): TsConfigAliases {
  try {
    const parsed = parseJsonc<Record<string, unknown>>(jsoncText);
    if (!parsed || typeof parsed !== 'object') return {};
    const compiler = (parsed.compilerOptions as Record<string, unknown>) || {};
    const baseUrl = typeof compiler.baseUrl === 'string' ? compiler.baseUrl.trim() : undefined;
    const rawPaths = compiler.paths && typeof compiler.paths === 'object' ? (compiler.paths as Record<string, string[]>) : undefined;

    // Normalize baseUrl: "./" or "." -> normalized to project relative
    let normalizedBaseUrl = baseUrl;
    if (normalizedBaseUrl === '.' || normalizedBaseUrl === './') {
      normalizedBaseUrl = '';
    } else if (normalizedBaseUrl?.startsWith('./')) {
      normalizedBaseUrl = normalizedBaseUrl.slice(2);
    }
    if (normalizedBaseUrl?.endsWith('/')) {
      normalizedBaseUrl = normalizedBaseUrl.slice(0, -1);
    }

    return {
      baseUrl: normalizedBaseUrl,
      paths: rawPaths,
    };
  } catch {
    return {};
  }
}
