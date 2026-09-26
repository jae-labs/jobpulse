import React from 'react';
import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import '../lib/i18n';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock HTMLCanvasElement.getContext for jsdom
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Mock recharts ResponsiveContainer to avoid 0-dimension warnings in jsdom
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) =>
      React.isValidElement(children)
        ? React.cloneElement(children, { width: 800, height: 400 } as React.Attributes)
        : children ?? null,
  };
});
