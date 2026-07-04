'use client';

import { parseError } from '../lib/parse-error';
import { SpendingLimitAlert } from './SpendingLimitAlert';
import { InsufficientCreditsAlert } from './InsufficientCreditsAlert';

export interface ErrorBoundaryProps {
  error: any;
  onRetry?: () => void;
  onUpgradeLimits?: () => void;
  onAddCredits?: () => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Universal error boundary component
 * Automatically renders the appropriate error UI based on error type
 */
export function ErrorBoundary({
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

