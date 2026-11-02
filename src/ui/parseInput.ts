export type ParsedInput = { kind: 'url'; url: string } | { kind: 'search'; text: string };

const SCHEME = /^https?:\/\//i;
const LOCAL = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/\S*)?$/i;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i;

export function parseInput(input: string): ParsedInput {
  const text = input.trim();
  if (/\s/.test(text)) return { kind: 'search', text };
  if (SCHEME.test(text)) return { kind: 'url', url: text };
  if (LOCAL.test(text)) return { kind: 'url', url: `http://${text}` };
  if (DOMAIN.test(text)) return { kind: 'url', url: `https://${text}` };
  return { kind: 'search', text };
}
