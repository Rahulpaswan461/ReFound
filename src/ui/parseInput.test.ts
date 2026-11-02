import { describe, expect, it } from 'vitest';
import { parseInput } from './parseInput';

describe('parseInput', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['docs.python.org/3/library', 'https://docs.python.org/3/library'],
    ['https://a.io/x?y=1', 'https://a.io/x?y=1'],
    ['http://intranet/page', 'http://intranet/page'],
    ['localhost:3000/foo', 'http://localhost:3000/foo'],
    ['127.0.0.1:8080', 'http://127.0.0.1:8080'],
  ])('%s is a URL', (text, url) => {
    expect(parseInput(text)).toEqual({ kind: 'url', url });
  });

  it.each(['postgres indexing', 'what is 3.14', 'redis', 'me@example.com', 'a.b c.d'])(
    '%s is a search',
    (text) => {
      expect(parseInput(text)).toEqual({ kind: 'search', text });
    },
  );

  it('trims input', () => {
    expect(parseInput('  redis  ')).toEqual({ kind: 'search', text: 'redis' });
  });
});
