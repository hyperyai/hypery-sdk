'use client';

import { ArrowRight, CircleX } from 'lucide-react';
import { ParsedError } from '../types/index.js';
import { Callout, CalloutAction } from './ui/primitives.js';

/** Props of {@link InsufficientCreditsAlert}. */
export interface InsufficientCreditsAlertProps {
  /** Parsed error; the alert renders only when `isInsufficientCredits`. */
  error: ParsedError;
  /** Shows an "Add credits" button. */
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
    <Callout
      tone="danger"
      icon={<CircleX aria-hidden />}
      title="Insufficient credits"
      className={className}
      actions={
        onAddCredits && (
          <CalloutAction onClick={onAddCredits} emphasis>
            Add credits <ArrowRight aria-hidden className="hy:size-3.5" />
          </CalloutAction>
        )
      }
    >
      <p>{error.message}</p>
      {data.available !== undefined && data.required !== undefined && (
        <p>
          You have <strong className="hy:font-semibold">{data.available}</strong> credits, but need{' '}
          <strong className="hy:font-semibold">{data.required}</strong> credits.
        </p>
      )}
    </Callout>
  );
}
