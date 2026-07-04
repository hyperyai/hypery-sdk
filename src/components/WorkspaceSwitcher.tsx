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
import { useHyperyAuth } from '../lib/context';
import {
  useMemberships,
  setActiveWorkspace,
  type MembershipEntry,
  type MembershipWorkspace,
} from '../hooks/useMemberships';

export interface WorkspaceSwitcherProps {
  /** Called after a successful switch — typically `router.refresh()`. */
  onSwitched?: (teamId: string, workspaceId: string) => void;
  /** Override the Hypery base URL (defaults to NEXT_PUBLIC_GATEWAY_URL). */
  gatewayUrl?: string;
  /** Extra classes appended to the trigger button. */
  className?: string;
  /** Optional aria-label for the trigger. */
  ariaLabel?: string;
}

export function WorkspaceSwitcher({
  onSwitched,
  gatewayUrl,
  className = '',
  ariaLabel = 'Switch workspace',
}: WorkspaceSwitcherProps) {
  const { getAccessToken } = useHyperyAuth();
  const { data, isLoading, reload } = useMemberships();
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
          gatewayUrl,
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
    [getAccessToken, gatewayUrl, onSwitched, reload],
  );

  if (isLoading && !data) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-500 ${className}`}
      >
        <span className="size-4 animate-pulse rounded-sm bg-zinc-300 dark:bg-zinc-700" />
        Loading workspaces…
      </button>
    );
  }

  if (!data || data.memberships.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      >
        {activeEntry?.membership.team.isPersonal ? (
          <UserIcon className="h-4 w-4 text-zinc-500" aria-hidden />
        ) : (
          <Building2 className="h-4 w-4 text-zinc-500" aria-hidden />
        )}
        <span className="truncate max-w-[180px]">
          {activeEntry ? (
            <>
              <span className="text-zinc-500">
                {activeEntry.membership.team.isPersonal
                  ? 'Personal'
                  : activeEntry.membership.team.name}
              </span>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
              <span>{activeEntry.workspace.name}</span>
            </>
          ) : (
            'Select workspace'
          )}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
      </button>

      {open && (
        <>
          {/* Click-away */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="listbox"
            className="absolute z-50 mt-1 max-h-[28rem] w-72 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1"
          >
            {data.memberships.map((m) => (
              <div key={m.team.id} className="py-1">
                <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  {m.team.isPersonal ? (
                    <UserIcon className="h-3 w-3" />
                  ) : (
                    <Building2 className="h-3 w-3" />
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
                      className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                        isActive ? 'bg-zinc-50 dark:bg-zinc-800/60' : ''
                      } disabled:opacity-50`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {w.icon && <span aria-hidden>{w.icon}</span>}
                        <span className="truncate">{w.name}</span>
                        {w.isDefault && (
                          <span className="ml-1 text-[9px] uppercase tracking-wider text-zinc-400">
                            default
                          </span>
                        )}
                      </span>
                      {isActive && (
                        <Check className="h-3.5 w-3.5 text-blue-600" />
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
