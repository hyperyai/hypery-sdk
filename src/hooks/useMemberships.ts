/**
 * Memberships + active-workspace hooks for consumer apps.
 *
 * These power the <WorkspaceSwitcher /> component. They fetch the user's
 * full team → workspace tree from the gateway and let the caller switch
 * the active workspace. The active workspace is stored on the OAuth
 * session server-side so it's persistent across page reloads + devices.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useHyperyAuth } from '../lib/context';

export interface MembershipWorkspace {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  icon: string | null;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  isActive: boolean;
}

export interface MembershipTeam {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
}

export interface MembershipEntry {
  team: MembershipTeam;
  workspaces: MembershipWorkspace[];
}

export interface MembershipsResponse {
  activeOrganizationId: string | null;
  activeWorkspaceId: string | null;
  memberships: MembershipEntry[];
}

interface MembershipsState {
  data: MembershipsResponse | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Hook: list every team + workspace the current user belongs to. Returns a
 * flat memberships array that's easy to render in a switcher dropdown.
 */
export function useMemberships(): MembershipsState {
  const { isAuthenticated, getAccessToken } = useHyperyAuth();
  const [data, setData] = useState<MembershipsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // We can't pull the gatewayUrl off the public context value (intentionally),
  // so we rely on the `Origin` header path: in practice every consumer is
  // configured to point its access-token Bearer at the same gateway, so a
  // simple relative fetch on the gateway's domain works. Consumer apps that
  // run on a different origin override this by setting NEXT_PUBLIC_GATEWAY_URL.
  const gatewayUrl =
    (typeof process !== 'undefined' &&
      process.env?.NEXT_PUBLIC_GATEWAY_URL) ||
    '';

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setData(null);
        return;
      }
      const url = `${gatewayUrl}/api/auth/list_memberships`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Memberships request failed: ${res.status}`);
      }
      const body = (await res.json()) as MembershipsResponse;
      // Decorate isActive on each workspace from the response's pointers.
      const decorated: MembershipsResponse = {
        ...body,
        memberships: body.memberships.map((m) => ({
          ...m,
          workspaces: m.workspaces.map((w) => ({
            ...w,
            isActive: w.id === body.activeWorkspaceId,
          })),
        })),
      };
      setData(decorated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getAccessToken, gatewayUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, isLoading, error, reload: load };
}

export interface ActiveWorkspace {
  teamId: string;
  teamName: string;
  workspaceId: string;
  workspaceName: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
}

/**
 * Hook: resolves the user's currently-active team + workspace from the
 * server-side OAuth session. Returns null until memberships have loaded.
 */
export function useActiveWorkspace(): {
  active: ActiveWorkspace | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useMemberships();
  if (!data) return { active: null, isLoading };

  // Prefer the explicit activeWorkspaceId pointer. Fall back to the personal
  // team's default workspace so first-time users see something sensible.
  const flat = data.memberships.flatMap((m) =>
    m.workspaces.map((w) => ({ membership: m, workspace: w })),
  );
  let entry =
    flat.find((e) => e.workspace.id === data.activeWorkspaceId) ?? null;
  if (!entry) {
    const personal = data.memberships.find((m) => m.team.isPersonal);
    const personalDefault = personal?.workspaces.find((w) => w.isDefault);
    if (personal && personalDefault) {
      entry = { membership: personal, workspace: personalDefault };
    }
  }
  if (!entry) return { active: null, isLoading: false };

  return {
    isLoading: false,
    active: {
      teamId: entry.membership.team.id,
      teamName: entry.membership.team.name,
      workspaceId: entry.workspace.id,
      workspaceName: entry.workspace.name,
      role: entry.workspace.role,
    },
  };
}

/**
 * Mutation: persist a new active team+workspace on the OAuth session. The
 * gateway updates the session record, future requests' Bearer tokens carry
 * the new claims, and consumer apps see the change on their next render.
 */
export async function setActiveWorkspace(
  opts: {
    teamId: string;
    workspaceId: string;
    getAccessToken: () => Promise<string | null>;
    gatewayUrl?: string;
  },
): Promise<void> {
  const token = await opts.getAccessToken();
  if (!token) throw new Error('No access token; user is not signed in');
  const base =
    opts.gatewayUrl ??
    (typeof process !== 'undefined'
      ? process.env?.NEXT_PUBLIC_GATEWAY_URL ?? ''
      : '');
  const res = await fetch(`${base}/api/oauth/session`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      activeOrganizationId: opts.teamId,
      activeWorkspaceId: opts.workspaceId,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to switch workspace: ${detail}`);
  }
}
