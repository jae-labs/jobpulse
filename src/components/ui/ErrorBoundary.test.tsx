import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { reloadPage } from '../../lib/moduleLoadError';
import { lazy, Suspense } from 'react';

vi.mock('../../lib/moduleLoadError', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/moduleLoadError')>(),
  reloadPage: vi.fn(),
}));

function ProblematicComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Exploded unexpectedly');
  }
  return <div>Healthy component</div>;
}

describe('ErrorBoundary', () => {
  it('offers a page reload for a rejected lazy import instead of retrying the cached rejection', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    const load = vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module: https://example.com/assets/chart.js'));
    const Chart = lazy(load);
    try {
      render(
        <ErrorBoundary onReset={onReset}>
          <Suspense fallback="Loading"><Chart /></Suspense>
        </ErrorBoundary>
      );
      const reload = await screen.findByRole('button', { name: 'Reload page' });
      expect(screen.queryByText(/example.com/)).not.toBeInTheDocument();
      fireEvent.click(reload);
      expect(reloadPage).toHaveBeenCalledTimes(1);
      expect(onReset).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Content is fine</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Content is fine')).toBeInTheDocument();
  });

  it('catches render errors and displays fallback UI', () => {
    // Suppress console.error in test output for intentional error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallbackTitle="Custom Fail Title">
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Fail Title')).toBeInTheDocument();
    expect(screen.getByText('Exploded unexpectedly')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('calls onReset when retry button is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handleReset = vi.fn();

    render(
      <ErrorBoundary onReset={handleReset}>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(handleReset).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
