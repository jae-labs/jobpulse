import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Card } from '@jae-labs/ui';
import { reportError } from '../../lib/logger';
import i18n from '../../lib/i18n';

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
    reportError(error, { componentStack: errorInfo?.componentStack });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Card className="border border-ds-negative/30 bg-ds-negative/10 p-6 text-center text-ds-negative">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-ds-negative/20 text-ds-negative">
            <AlertTriangle className="size-5" />
          </div>
          <h3 className="text-sm font-semibold text-ds-negative">
            {this.props.fallbackTitle || i18n.t('errorBoundary.unableToDisplayComponent')}
          </h3>
          <p className="mt-1 text-xs text-ds-negative/80 max-w-md mx-auto">
            {this.props.fallbackMessage ||
              this.state.error?.message ||
              i18n.t('errorBoundary.unexpectedRenderingError')}
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              variant="danger"
              size="sm"
              onClick={this.handleReset}
            >
              <span>{i18n.t('common.retry')}</span>
            </Button>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
