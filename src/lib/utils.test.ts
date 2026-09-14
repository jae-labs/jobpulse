import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('utils cn', () => {
  it('merges class names correctly', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });

  it('resolves tailwind conflicts using tailwind-merge', () => {
    expect(cn('px-2 text-red-500', 'px-4 text-blue-500')).toBe('px-4 text-blue-500');
  });
});
