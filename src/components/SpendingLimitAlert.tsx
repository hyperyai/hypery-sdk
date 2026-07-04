'use client';

import { ParsedError } from '../types';
import { formatTimeUntilReset } from '../lib/parse-error';

export interface SpendingLimitAlertProps {
  error: ParsedError;
  onRetry?: () => void;
  onUpgradeLimits?: () => void;
  className?: string;
}

/**
 * Alert component for spending limit errors
 * Displays a user-friendly message with retry and upgrade options
 */
export function SpendingLimitAlert({
  error,
  onRetry,
  onUpgradeLimits,
  className = '',
}: SpendingLimitAlertProps) {
  if (!error.isSpendingLimit) return null;

  const data = error.data as any;
  const resetTime = data.resetsAt ? formatTimeUntilReset(data.resetsAt) : null;

  return (
    <div
      className={`rounded-lg border border-orange-200 bg-orange-50 p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-orange-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-orange-800">
            Spending Limit Reached
          </h3>
          <div className="mt-2 text-sm text-orange-700">
            <p>{error.message}</p>
            {data.limitType && (
              <p className="mt-1">
                <strong className="capitalize">{data.limitType}</strong> limit:{' '}
                {data.current || 0} / {data.limit} credits used
              </p>
            )}
            {resetTime && (
              <p className="mt-1">
                Your limit will reset <strong>{resetTime}</strong>
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-sm font-medium text-orange-800 hover:text-orange-900"
              >
                Try again
              </button>
            )}
            {onUpgradeLimits && (
              <button
                type="button"
                onClick={onUpgradeLimits}
                className="text-sm font-medium text-orange-800 hover:text-orange-900 underline"
              >
                Increase limits →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

