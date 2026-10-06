import { expect, it } from 'vitest';
import { cn } from './index';

it('combines conditional classes and resolves utility conflicts', () => {
  expect(cn('px-2 py-1', { hidden: false, 'font-medium': true }, 'px-4'))
    .toBe('py-1 font-medium px-4');
});
