import React, { useMemo } from 'react';

/**
 * Lightweight token-based syntax highlighter for common programming languages
 */
export function highlightCodeLine(line: string, language?: string): React.ReactNode {
  if (!line) return ' ';

  const lang = (language ?? '').toLowerCase();

  // Handle comments
  if (line.trim().startsWith('//') || line.trim().startsWith('#') || line.trim().startsWith('--')) {
    return <span className="hl-comment">{line}</span>;
  }

  // Tokens regex for JS/TS/JSON/SQL
  const tokenRegex =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\/\/.*$|\b(?:import|export|from|default|const|let|var|function|class|interface|type|extends|implements|return|if|else|for|while|switch|case|break|continue|new|this|async|await|try|catch|finally|throw|typeof|instanceof|null|undefined|true|false|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|PRIMARY|KEY|REFERENCES|CASCADE|JOIN|ON|GROUP|BY|ORDER|DESC|ASC)\b|\b\d+(?:\.\d+)?\b|[{}()[\].,;:+\-*/%=<>!&|^~?])/g;

  if (lang.includes('json')) {
    const jsonTokens = /("(?:[^"\\]|\\.)*")|(:)|(-?\b\d+(?:\.\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\]])/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = jsonTokens.exec(line)) !== null) {
      if (match.index > lastIdx) {
        parts.push(line.slice(lastIdx, match.index));
      }
      const [token, str, colon, num, bool, punct] = match;
      if (str) {
        // Check if key or value
        const isKey = line.slice(match.index + token.length).trim().startsWith(':');
        parts.push(
          <span key={match.index} className={isKey ? 'hl-prop' : 'hl-string'}>
            {token}
          </span>
        );
      } else if (colon || punct) {
        parts.push(
          <span key={match.index} className="hl-punct">
            {token}
          </span>
        );
      } else if (num) {
        parts.push(
          <span key={match.index} className="hl-number">
            {token}
          </span>
        );
      } else if (bool) {
        parts.push(
          <span key={match.index} className="hl-keyword">
            {token}
          </span>
        );
      }
      lastIdx = match.index + token.length;
    }
    if (lastIdx < line.length) {
      parts.push(line.slice(lastIdx));
    }
    return parts.length ? parts : line;
  }

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      parts.push(line.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      parts.push(
        <span key={match.index} className="hl-string">
          {token}
        </span>
      );
    } else if (token.startsWith('//')) {
      parts.push(
        <span key={match.index} className="hl-comment">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={match.index} className="hl-number">
          {token}
        </span>
      );
    } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(token) && !['SELECT', 'FROM', 'WHERE'].includes(token)) {
      parts.push(
        <span key={match.index} className="hl-type">
          {token}
        </span>
      );
    } else if (
      [
        'import',
        'export',
        'from',
        'default',
        'const',
        'let',
        'var',
        'function',
        'class',
        'interface',
        'type',
        'extends',
        'implements',
        'return',
        'if',
        'else',
        'for',
        'while',
        'switch',
        'case',
        'break',
        'continue',
        'new',
        'this',
        'async',
        'await',
        'try',
        'catch',
        'finally',
        'throw',
        'typeof',
        'instanceof',
        'null',
        'undefined',
        'true',
        'false',
        'SELECT',
        'FROM',
        'WHERE',
        'INSERT',
        'UPDATE',
        'DELETE',
        'CREATE',
        'TABLE',
        'PRIMARY',
        'KEY',
        'REFERENCES',
      ].includes(token)
    ) {
      parts.push(
        <span key={match.index} className="hl-keyword">
          {token}
        </span>
      );
    } else {
      parts.push(
        <span key={match.index} className="hl-punct">
          {token}
        </span>
      );
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < line.length) {
    parts.push(line.slice(lastIdx));
  }

  return parts.length ? parts : line;
}

/**
 * Safe markdown parser without external dependencies or HTML injection
 */
export function MarkdownRenderer({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines: string[] = [];
    let listItems: string[] = [];
    let listOrdered = false;

    const flushList = () => {
      if (listItems.length > 0) {
        if (listOrdered) {
          elements.push(
            <ol key={`ol-${elements.length}`} className="md-ol">
              {listItems.map((item, idx) => (
                <li key={idx}>{renderInlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        } else {
          elements.push(
            <ul key={`ul-${elements.length}`} className="md-ul">
              {listItems.map((item, idx) => (
                <li key={idx}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        listItems = [];
      }
    };

    lines.forEach((line, index) => {
      // Fenced code blocks
      if (line.trim().startsWith('```')) {
        flushList();
        if (inCodeBlock) {
          inCodeBlock = false;
          elements.push(
            <pre key={`code-${elements.length}`} className="md-code-block" data-lang={codeLanguage}>
              <code>
                {codeLines.map((cline, cidx) => (
                  <div key={cidx}>{highlightCodeLine(cline, codeLanguage)}</div>
                ))}
              </code>
            </pre>
          );
          codeLines = [];
        } else {
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
        }

        return;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return;
      }

      const trimmed = line.trim();

      // Empty line
      if (!trimmed) {
        flushList();
        return;
      }

      // Headings
      if (trimmed.startsWith('# ')) {
        flushList();
        elements.push(<h1 key={`h1-${index}`} className="md-h1">{renderInlineMarkdown(trimmed.slice(2))}</h1>);
        return;
      }
      if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(<h2 key={`h2-${index}`} className="md-h2">{renderInlineMarkdown(trimmed.slice(3))}</h2>);
        return;
      }
      if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(<h3 key={`h3-${index}`} className="md-h3">{renderInlineMarkdown(trimmed.slice(4))}</h3>);
        return;
      }
      if (trimmed.startsWith('#### ')) {
        flushList();
        elements.push(<h4 key={`h4-${index}`} className="md-h4">{renderInlineMarkdown(trimmed.slice(5))}</h4>);
        return;
      }

      // Blockquote
      if (trimmed.startsWith('> ')) {
        flushList();
        elements.push(
          <blockquote key={`bq-${index}`} className="md-blockquote">
            {renderInlineMarkdown(trimmed.slice(2))}
          </blockquote>
        );
        return;
      }

      // Lists
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        listOrdered = false;
        listItems.push(trimmed.slice(2));
        return;
      }
      if (/^\d+\.\s/.test(trimmed)) {
        listOrdered = true;
        listItems.push(trimmed.replace(/^\d+\.\s/, ''));
        return;
      }

      flushList();

      // Regular paragraph
      elements.push(
        <p key={`p-${index}`} className="md-p">
          {renderInlineMarkdown(line)}
        </p>
      );
    });

    flushList();
    if (inCodeBlock && codeLines.length > 0) {
      elements.push(
        <pre key={`code-${elements.length}`} className="md-code-block" data-lang={codeLanguage}>
          <code>
            {codeLines.map((cline, cidx) => (
              <div key={cidx}>{highlightCodeLine(cline, codeLanguage)}</div>
            ))}
          </code>
        </pre>
      );
    }


    return elements;
  }, [content]);

  return <div className="markdown-preview">{blocks}</div>;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Support bold **text**, code `text`, and links [text](url)
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={match.index} className="md-inline-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        // Check for safe protocol
        const isSafe = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#');
        parts.push(
          <a
            key={match.index}
            href={isSafe ? href : '#'}
            target={isSafe ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="md-link"
          >
            {label}
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length ? parts : text;
}
