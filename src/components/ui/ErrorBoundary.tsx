import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled error captured by ErrorBoundary:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-6 text-center text-rose-200">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400">
            <AlertTriangle className="size-5" />
          </div>
          <h3 className="text-sm font-semibold text-rose-100">
            {this.props.fallbackTitle || 'Unable to display component'}
          </h3>
          <p className="mt-1 text-xs text-rose-200/80 max-w-md mx-auto">
            {this.props.fallbackMessage ||
              this.state.error?.message ||
              'An unexpected error occurred while rendering this section.'}
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={this.handleReset}
              className="border-rose-500/40 text-rose-200 hover:bg-rose-500/20 text-xs py-1 px-3"
            >
              <RefreshCw className="size-3.5 mr-1.5" />
              <span>Retry</span>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
