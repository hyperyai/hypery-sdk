'use client';

import { ParsedError } from '../types';

export interface InsufficientCreditsAlertProps {
  error: ParsedError;
  onAddCredits?: () => void;
  className?: string;
}

/**
 * Alert component for insufficient credits errors
 * Displays a user-friendly message with option to add credits
 */
export function InsufficientCreditsAlert({
  error,
  onAddCredits,
  className = '',
}: InsufficientCreditsAlertProps) {
  if (!error.isInsufficientCredits) return null;

  const data = error.data as any;

  return (
    <div
      className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">
            Insufficient Credits
          </h3>
          <div className="mt-2 text-sm text-red-700">
            <p>{error.message}</p>
            {data.available !== undefined && data.required !== undefined && (
              <p className="mt-1">
                You have <strong>{data.available}</strong> credits, but need{' '}
                <strong>{data.required}</strong> credits.
              </p>
            )}
          </div>
          {onAddCredits && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onAddCredits}
                className="text-sm font-medium text-red-800 hover:text-red-900 underline"
              >
                Add credits →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

