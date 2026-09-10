import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function ProblematicComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Exploded unexpectedly');
  }
  return <div>Healthy component</div>;
}

describe('ErrorBoundary', () => {
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
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

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

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(handleReset).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
