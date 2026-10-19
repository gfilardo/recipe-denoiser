export class ConnectionOutputError extends Error {
  constructor(message) { super(message); this.name = 'ConnectionOutputError'; }
}

// Every candidate has one fixed property and a finite set of string choices.
// Check completed keys and values immediately, without waiting for the object.
export function createActionConnectionGuard(choices) {
  const allowed = new Map(Object.entries(choices).map(([id, values]) => [id, new Set(values)]));
  const seen = new Set();
  // Six characters per UTF-16 code unit allow even fully escaped \uXXXX text.
  // The rest covers quotes, colons, commas, and braces. Formatting whitespace
  // is free here; the separate whitespace guard limits whitespace-only loops.
  const limit = 2 + Math.max(0, allowed.size - 1)
    + [...allowed].reduce((sum, [id, values]) =>
      sum + 5 + id.length * 6 + Math.max(0, ...[...values].map(value => value.length * 6)), 0);
  let count = 0, state = 'object', stringRole = null, raw = '', currentKey = null;
  let escaped = false, unicodeRemaining = 0;
  const fail = message => { throw new ConnectionOutputError(message); };
  const finishObject = () => {
    const missing = [...allowed.keys()].filter(id => !seen.has(id));
    if (missing.length) fail(`Missing connection choices: ${missing.join(', ')}. Every candidate must appear once.`);
    state = 'done';
  };
  const startString = role => {
    stringRole = role;
    raw = '"';
    escaped = false;
    unicodeRemaining = 0;
  };
  const finishString = () => {
    const value = JSON.parse(raw);
    if (stringRole === 'key') {
      if (!allowed.has(value)) fail(`Unknown connection choice: ${value}. Choose only the provided candidate IDs.`);
      if (seen.has(value)) fail(`Duplicate connection choice: ${value}. Every candidate must appear once.`);
      seen.add(value);
      currentKey = value;
      state = 'colon';
    } else {
      if (!allowed.get(currentKey).has(value)) fail(`Invalid selection for ${currentKey}. Choose one of its provided values.`);
      state = 'after-value';
    }
    stringRole = null;
    raw = '';
  };
  return chunk => {
    for (const char of chunk) {
      const whitespace = /^[ \t\r\n]$/u.test(char);
      if (stringRole || !whitespace) {
        count += char.length;
        if (count > limit) fail(`Connection output exceeded its ${limit}-character content budget. Stopped repetitive or oversized output.`);
      }
      if (stringRole) {
        raw += char;
        if (unicodeRemaining) {
          if (!/^[0-9a-f]$/iu.test(char)) fail('Invalid Unicode escape in connection output.');
          unicodeRemaining--;
        } else if (escaped) {
          escaped = false;
          if (char === 'u') unicodeRemaining = 4;
          else if (!/^["\\/bfnrt]$/u.test(char)) fail('Invalid JSON escape in connection output.');
        } else if (char === '\\') escaped = true;
        else if (char === '"') finishString();
        else if (char.charCodeAt(0) < 0x20) fail('Unescaped control character in connection output.');
        continue;
      }
      if (whitespace) continue;
      switch (state) {
        case 'object':
          if (char !== '{') fail('Connection output must be a JSON object with one string choice per candidate.');
          state = 'first-key';
          break;
        case 'first-key':
        case 'next-key':
          if (char === '}' && state === 'first-key') { finishObject(); break; }
          if (char !== '"') fail('Expected a candidate ID as a connection object key.');
          startString('key');
          break;
        case 'colon':
          if (char !== ':') fail('Expected a colon after the connection candidate ID.');
          state = 'value';
          break;
        case 'value':
          if (char !== '"') fail('Each connection choice must be one of the provided strings.');
          startString('value');
          break;
        case 'after-value':
          if (char === ',') state = 'next-key';
          else if (char === '}') finishObject();
          else fail('Expected a comma or closing brace after a connection choice.');
          break;
        case 'done':
          fail('Unexpected content after the connection object.');
      }
    }
  };
}
