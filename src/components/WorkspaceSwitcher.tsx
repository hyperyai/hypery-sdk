/**
 * <WorkspaceSwitcher /> — drop-in dropdown that lists every workspace the
 * user belongs to (across all orgs/teams) and switches the active one.
 *
 * Designed for the top-bar of consumer apps. Headless-ish: ships with
 * sensible default styles via tailwind utility classes but they can be
 * fully overridden via `className`.
 *
 * Example:
 *   <WorkspaceSwitcher
 *     onSwitched={(teamId, workspaceId) => router.refresh()}
 *   />
 *
 * The component groups workspaces by team. Personal team is labelled
 * "Personal" rather than the literal "{Name}'s Workspace" team name to
 * keep the switcher compact.
 */

'use client';

import React, { useCallback, useState } from 'react';
import { ChevronsUpDown, Check, Building2, User as UserIcon } from 'lucide-react';
import { useHyperyAuth } from '../lib/context.js';
import { cn } from '../lib/utils.js';
import { ROOT } from './ui/primitives.js';
import { resolveGatewayUrl } from '../lib/gateway.js';
import {
  useMemberships,
  setActiveWorkspace,
  type MembershipEntry,
  type MembershipWorkspace,
} from '../hooks/useMemberships.js';

/** Props of {@link WorkspaceSwitcher}. */
export interface WorkspaceSwitcherProps {
  /** Called after a successful switch — typically `router.refresh()`. */
  onSwitched?: (teamId: string, workspaceId: string) => void;
  /** Override the Hypery base URL (defaults to the provider's gatewayUrl, then NEXT_PUBLIC_GATEWAY_URL). */
  gatewayUrl?: string;
  /** Extra classes appended to the trigger button. */
  className?: string;
  /** Optional aria-label for the trigger. */
  ariaLabel?: string;
}

/**
 * Dropdown of the user's teams and workspaces that switches the active one.
 *
 * @example
 * ```tsx
 * <WorkspaceSwitcher onSwitched={() => router.refresh()} />
 * ```
 */
export function WorkspaceSwitcher({
  onSwitched,
  gatewayUrl,
  className = '',
  ariaLabel = 'Switch workspace',
}: WorkspaceSwitcherProps) {
  const { getAccessToken, gatewayUrl: providerGatewayUrl } = useHyperyAuth();
  const resolvedGatewayUrl = resolveGatewayUrl(gatewayUrl, providerGatewayUrl);
  const { data, isLoading, reload } = useMemberships({ gatewayUrl: resolvedGatewayUrl });
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const activeWorkspaceId = data?.activeWorkspaceId ?? null;

  // Resolve the currently-active entry for the trigger label.
  const flat: Array<{
    membership: MembershipEntry;
    workspace: MembershipWorkspace;
  }> =
    data?.memberships.flatMap((m) =>
      m.workspaces.map((w) => ({ membership: m, workspace: w })),
    ) ?? [];
  const activeEntry =
    flat.find((e) => e.workspace.id === activeWorkspaceId) ?? flat[0];

  const handleSwitch = useCallback(
    async (teamId: string, workspaceId: string) => {
      setSwitching(workspaceId);
      try {
        await setActiveWorkspace({
          teamId,
          workspaceId,
          getAccessToken,
          gatewayUrl: resolvedGatewayUrl,
        });
        await reload();
        setOpen(false);
        onSwitched?.(teamId, workspaceId);
      } catch (err) {
        console.error('[WorkspaceSwitcher] switch failed:', err);
      } finally {
        setSwitching(null);
      }
    },
    [getAccessToken, resolvedGatewayUrl, onSwitched, reload],
  );

  const trigger =
    'hy:inline-flex hy:h-9 hy:items-center hy:gap-2 hy:rounded-md hy:bg-field hy:px-3 hy:text-sm hy:transition-colors hy:outline-none hy:focus-visible:ring-[3px] hy:focus-visible:ring-ring/50';

  if (isLoading && !data) {
    return (
      <button
        type="button"
        disabled
        className={cn(ROOT, trigger, 'hy:text-muted-foreground', className)}
      >
        <span className="hy:size-4 hy:animate-pulse hy:rounded-sm hy:bg-field-hover" />
        Loading workspaces…
      </button>
    );
  }

  if (!data || data.memberships.length === 0) {
    return null;
  }

  return (
    <div className={cn(ROOT, 'hy:relative hy:inline-block hy:text-left')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(trigger, 'hy:font-medium hy:text-foreground hy:hover:bg-field-hover', className)}
      >
        {activeEntry?.membership.team.isPersonal ? (
          <UserIcon className="hy:size-4 hy:text-muted-foreground" aria-hidden />
        ) : (
          <Building2 className="hy:size-4 hy:text-muted-foreground" aria-hidden />
        )}
        <span className="hy:max-w-[180px] hy:truncate">
          {activeEntry ? (
            <>
              <span className="hy:text-muted-foreground">
                {activeEntry.membership.team.isPersonal
                  ? 'Personal'
                  : activeEntry.membership.team.name}
              </span>
              <span className="hy:mx-1.5 hy:text-subtle-foreground">·</span>
              <span>{activeEntry.workspace.name}</span>
            </>
          ) : (
            'Select workspace'
          )}
        </span>
        <ChevronsUpDown className="hy:size-3.5 hy:text-subtle-foreground" aria-hidden />
      </button>

      {open && (
        <>
          {/* Click-away */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="hy:fixed hy:inset-0 hy:z-40 hy:cursor-default"
          />
          <div
            role="listbox"
            className="hy:absolute hy:z-50 hy:mt-1.5 hy:max-h-[28rem] hy:w-72 hy:animate-hy-pop-in hy:overflow-y-auto hy:rounded-xl hy:bg-popover hy:p-1 hy:text-popover-foreground hy:shadow-lg hy:ring-1 hy:ring-border"
          >
            {data.memberships.map((m) => (
              <div key={m.team.id} className="hy:py-1">
                <div className="hy:flex hy:items-center hy:gap-1.5 hy:px-2 hy:py-1 hy:text-[10px] hy:font-semibold hy:uppercase hy:tracking-wider hy:text-subtle-foreground">
                  {m.team.isPersonal ? (
                    <UserIcon className="hy:size-3" />
                  ) : (
                    <Building2 className="hy:size-3" />
                  )}
                  {m.team.isPersonal ? 'Personal' : m.team.name}
                </div>
                {m.workspaces.map((w) => {
                  const isActive = w.id === activeWorkspaceId;
                  const isSwitching = switching === w.id;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      disabled={isSwitching}
                      onClick={() => handleSwitch(m.team.id, w.id)}
                      className={cn(
                        'hy:flex hy:w-full hy:items-center hy:justify-between hy:gap-2 hy:rounded-md hy:px-2 hy:py-1.5 hy:text-left hy:text-sm hy:text-foreground hy:outline-none hy:hover:bg-accent hy:focus-visible:bg-accent hy:disabled:opacity-50',
                        isActive && 'hy:bg-primary-subtle hy:text-primary-subtle-foreground hy:hover:bg-primary-subtle',
                      )}
                    >
                      <span className="hy:flex hy:items-center hy:gap-1.5 hy:truncate">
                        {w.icon && <span aria-hidden>{w.icon}</span>}
                        <span className="hy:truncate">{w.name}</span>
                        {w.isDefault && (
                          <span className="hy:ml-1 hy:text-[9px] hy:uppercase hy:tracking-wider hy:text-subtle-foreground">
                            default
                          </span>
                        )}
                      </span>
                      {isActive && (
                        <Check className="hy:size-3.5 hy:text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
