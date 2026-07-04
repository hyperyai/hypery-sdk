"use client";

import React from "react";
import { useHyperyAuth } from "../lib/context";
import { AuthModal } from "./AuthModal";
import { type RestrictionError, RestrictionModal } from "./RestrictionModal";

export interface HyperyModalsProps {
  /**
   * Branding + auth-form options forwarded to the auto-opened `AuthModal`.
   */
  branding?: {
    logo?: string;
    appName?: string;
    primaryColor?: string;
  };
  showSocial?: boolean;
  showEmailPassword?: boolean;
  /**
   * Called when the funds modal's retry button is pressed (e.g. re-run the
   * request that was blocked). The restriction is cleared automatically.
   */
  onRetry?: () => void;
}

/**
 * Turnkey modal host. Mount this ONCE anywhere inside `<HyperyProvider>` and the
 * billing/auth modals open automatically off the context state that
 * `authenticatedFetch` sets — no manual `setError`/`isOpen` wiring:
 *
 *   - a 402/429 billing restriction → `<RestrictionModal>` (add funds / add card)
 *   - a 401 that survives a silent-refresh retry → `<AuthModal>` (re-auth)
 *
 * All wiring (clientId, gatewayUrl, getAccessToken, open/close) is read from
 * context, so this component takes no required props.
 */
export function HyperyModals({
  branding,
  showSocial,
  showEmailPassword,
  onRetry,
}: HyperyModalsProps = {}) {
  const {
    clientId,
    gatewayUrl,
    getAccessToken,
    restriction,
    clearRestriction,
    authRequired,
    clearAuthRequired,
  } = useHyperyAuth();

  // ParsedError → RestrictionModal's RestrictionError (data carries the billing
  // fields: limit/current/available/resetsAt/...).
  const restrictionError: RestrictionError | null = restriction
    ? {
        code: restriction.code,
        message: restriction.message,
        type: restriction.type,
        ...(restriction.data as Record<string, unknown>),
      }
    : null;

  return (
    <>
      <RestrictionModal
        error={restrictionError}
        clientId={clientId}
        gatewayUrl={gatewayUrl}
        getAccessToken={getAccessToken}
        onClose={clearRestriction}
        onRetry={onRetry}
      />
      <AuthModal
        isOpen={authRequired}
        onClose={clearAuthRequired}
        branding={branding}
        showSocial={showSocial}
        showEmailPassword={showEmailPassword}
      />
    </>
  );
}
