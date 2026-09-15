'use client';

import React from 'react';
import { parseError } from '../lib/parse-error';
import { SpendingLimitAlert } from './SpendingLimitAlert';
import { InsufficientCreditsAlert } from './InsufficientCreditsAlert';

/** Props of {@link ErrorBoundary}. */
export interface ErrorBoundaryProps {
  /**
   * An error to display (any value `parseError` accepts, e.g. an API error
   * body). Falsy renders `children`. Optional — omit to use this purely as a
   * React error boundary.
   */
  error?: any;
  /** Retry handler (spending-limit and generic alerts). */
  onRetry?: () => void;
  /** "Increase limits" handler (spending-limit alert). */
  onUpgradeLimits?: () => void;
  /** "Add credits" handler (insufficient-credits alert). */
  onAddCredits?: () => void;
  className?: string;
  /** Rendered when there is no error. */
  children?: React.ReactNode;
  /**
   * Rendered instead of the default alert when a child throws during render.
   * A function receives the thrown error and a `reset` that re-renders children.
   */
  fallback?: React.ReactNode | ((error: unknown, reset: () => void) => React.ReactNode);
  /** Called when a child throws during render (e.g. to report to Sentry). */
  onError?: (error: unknown, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  caught: { error: unknown } | null;
}

/**
 * React error boundary + universal error display.
 *
 * - Catches errors thrown while rendering `children` and shows `fallback`
 *   (or the default alert with a "Try again" that resets the boundary).
 * - When the `error` prop is set, renders the matching alert
 *   (spending limit / insufficient credits / generic) instead of `children`.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { caught: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { caught: { error } };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ caught: null });
  };

  render(): React.ReactNode {
    const { caught } = this.state;
    const { fallback, onRetry, onUpgradeLimits, onAddCredits, className, children, error } = this.props;

    if (caught) {
      if (typeof fallback === 'function') return fallback(caught.error, this.reset);
      if (fallback !== undefined) return fallback;
      return (
        <ErrorDisplay
          error={caught.error}
          onRetry={() => {
            this.reset();
            onRetry?.();
          }}
          className={className}
        />
      );
    }

    return (
      <ErrorDisplay
        error={error}
        onRetry={onRetry}
        onUpgradeLimits={onUpgradeLimits}
        onAddCredits={onAddCredits}
        className={className}
      >
        {children}
      </ErrorDisplay>
    );
  }
}

function ErrorDisplay({
  error,
  onRetry,
  onUpgradeLimits,
  onAddCredits,
  className = '',
  children,
}: ErrorBoundaryProps) {
  if (!error) return <>{children}</>;

  const parsed = parseError(error);

  // Render spending limit alert
  if (parsed.isSpendingLimit) {
    return (
      <SpendingLimitAlert
        error={parsed}
        onRetry={onRetry}
        onUpgradeLimits={onUpgradeLimits}
        className={className}
      />
    );
  }

  // Render insufficient credits alert
  if (parsed.isInsufficientCredits) {
    return (
      <InsufficientCreditsAlert
        error={parsed}
        onAddCredits={onAddCredits}
        className={className}
      />
    );
  }

  // Render generic error
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-gray-50 p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-800">Error</h3>
          <div className="mt-2 text-sm text-gray-700">
            <p>{parsed.message}</p>
          </div>
          {onRetry && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onRetry}
                className="text-sm font-medium text-gray-800 hover:text-gray-900"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

