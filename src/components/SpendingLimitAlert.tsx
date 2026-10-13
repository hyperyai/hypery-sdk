'use client';

import { ArrowRight, TriangleAlert } from 'lucide-react';
import { ParsedError } from '../types/index.js';
import { Callout, CalloutAction } from './ui/primitives.js';
import { formatTimeUntilReset } from '../lib/parse-error.js';

/** Props of {@link SpendingLimitAlert}. */
export interface SpendingLimitAlertProps {
  /** Parsed error; the alert renders only when `isSpendingLimit`. */
  error: ParsedError;
  /** Shows a "Try again" button. */
  onRetry?: () => void;
  /** Shows an "Increase limits" button. */
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
    <Callout
      tone="warning"
      icon={<TriangleAlert aria-hidden />}
      title="Spending limit reached"
      className={className}
      actions={
        (onRetry || onUpgradeLimits) && (
          <>
            {onUpgradeLimits && (
              <CalloutAction onClick={onUpgradeLimits} emphasis>
                Increase limits <ArrowRight aria-hidden className="hy:size-3.5" />
              </CalloutAction>
            )}
            {onRetry && <CalloutAction onClick={onRetry}>Try again</CalloutAction>}
          </>
        )
      }
    >
      <p>{error.message}</p>
      {data.limitType && (
        <p>
          <strong className="hy:font-semibold hy:capitalize">{data.limitType}</strong> limit:{' '}
          {data.current || 0} / {data.limit} credits used
        </p>
      )}
      {resetTime && (
        <p>
          Your limit will reset <strong className="hy:font-semibold">{resetTime}</strong>
        </p>
      )}
    </Callout>
  );
}
