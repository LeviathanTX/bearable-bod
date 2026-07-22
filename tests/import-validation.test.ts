import { describe, it, expect } from 'vitest';

describe('board member import validation', () => {
  function validateImportItem(item: any): string[] {
    const errors: string[] = [];
    if (!item.name || typeof item.name !== 'string') errors.push('name required (string)');
    if (!item.title || typeof item.title !== 'string') errors.push('title required (string)');
    if (item.expertise && !Array.isArray(item.expertise)) errors.push('expertise must be array');
    if (item.model && typeof item.model !== 'string') errors.push('model must be string');
    return errors;
  }

  it('accepts valid import items', () => {
    const valid = { name: 'Test', title: 'Advisor', expertise: ['Finance'], personaPrompt: 'You are...' };
    expect(validateImportItem(valid)).toEqual([]);
  });

  it('rejects items without name', () => {
    const invalid = { title: 'Advisor' };
    expect(validateImportItem(invalid)).toContain('name required (string)');
  });

  it('rejects items without title', () => {
    const invalid = { name: 'Test' };
    expect(validateImportItem(invalid)).toContain('title required (string)');
  });

  it('rejects non-array expertise', () => {
    const invalid = { name: 'Test', title: 'Advisor', expertise: 'not-array' };
    expect(validateImportItem(invalid)).toContain('expertise must be array');
  });
});
