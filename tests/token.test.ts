/**
 * Token tests - ported from Go token/token_test.go
 */
import { describe, test, expect } from 'bun:test';
import { toCamel } from '../src/token';

describe('Token', () => {
  test('TestToCamel - simple case', () => {
    const res = toCamel('SIMPLE');
    expect(res).toBe('Simple');
  });

  test('TestToCamel - multiple words', () => {
    const res = toCamel('MULTIPLE_WORDS');
    expect(res).toBe('MultipleWords');
  });

  test('TestToCamel - lowercase input', () => {
    const res = toCamel('lowercase');
    expect(res).toBe('Lowercase');
  });

  test('TestToCamel - mixed case', () => {
    const res = toCamel('MiXeD_CaSe');
    expect(res).toBe('MixedCase');
  });

  test('TestToCamel - single character', () => {
    const res = toCamel('A');
    expect(res).toBe('A');
  });

  test('TestToCamel - empty string', () => {
    const res = toCamel('');
    expect(res).toBe('');
  });
});
