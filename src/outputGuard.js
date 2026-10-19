// Count only formatting whitespace, not spaces inside ingredient/action strings.
export const MAX_FORMATTING_WHITESPACE = 512;
export class WhitespaceLoopError extends Error {
  constructor() {
    super(`The model generated ${MAX_FORMATTING_WHITESPACE} consecutive whitespace characters without adding recipe content. Stopped early to avoid another output-limit failure. Inspect the output snapshot; no incomplete recipe was applied.`);
    this.name = 'WhitespaceLoopError';
  }
}
export function createOutputGuard() {
  let inString = false, escaped = false, whitespace = 0;
  return chunk => {
    for (const char of chunk) {
      if (inString) {
        whitespace = 0;
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true; whitespace = 0;
      } else if (/^[ \t\r\n]$/.test(char)) {
        if (++whitespace >= MAX_FORMATTING_WHITESPACE) throw new WhitespaceLoopError();
      } else whitespace = 0;
    }
  };
}
