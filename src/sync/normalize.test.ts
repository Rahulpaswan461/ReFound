import { describe, expect, it } from 'vitest';
import { displayDomain, isRecommendable, normalizeUrl } from './normalize';

describe('normalizeUrl', () => {
  it.each([
    ['HTTPS://Example.COM/Path/', 'https://example.com/Path'],
    ['https://example.com/', 'https://example.com'],
    ['https://example.com:443/a', 'https://example.com/a'],
    ['http://example.com:80', 'http://example.com'],
    ['https://example.com/a?b=1#c', 'https://example.com/a?b=1#c'],
    ['https://example.com/a/?b=1', 'https://example.com/a?b=1'],
    ['https://example.com:8080/', 'https://example.com:8080'],
  ])('%s', (input, output) => {
    expect(normalizeUrl(input)).toBe(output);
  });

  it('leaves other schemes and invalid URLs alone', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('isRecommendable', () => {
  it('accepts only http and https', () => {
    expect(isRecommendable('http://a.com')).toBe(true);
    expect(isRecommendable('https://a.com')).toBe(true);
    expect(isRecommendable('chrome://settings')).toBe(false);
    expect(isRecommendable('javascript:void(0)')).toBe(false);
    expect(isRecommendable('garbage')).toBe(false);
  });
});

describe('displayDomain', () => {
  it('strips www', () => {
    expect(displayDomain('https://www.example.com/a')).toBe('example.com');
  });
  it('falls back to the raw text', () => {
    expect(displayDomain('garbage')).toBe('garbage');
  });
});
