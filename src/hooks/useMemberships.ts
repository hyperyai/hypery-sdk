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
import { errorMessageFromBody, resolveGatewayUrl } from '../lib/gateway';

/** A workspace the user belongs to. `isActive` is derived from `activeWorkspaceId`. */
export interface MembershipWorkspace {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  icon: string | null;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  isActive: boolean;
}

/** A team (organization) the user belongs to. */
export interface MembershipTeam {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
}

/** One team with its workspaces. */
export interface MembershipEntry {
  team: MembershipTeam;
  workspaces: MembershipWorkspace[];
}

/** Response of `GET /api/auth/list_memberships`. */
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

/** Concurrent identical membership requests share one fetch (cleared on settle). */
const inFlight = new Map<string, Promise<MembershipsResponse>>();

/**
 * Fetch + decorate `GET {gatewayUrl}/api/auth/list_memberships`, de-duplicating
 * concurrent calls for the same URL and token (e.g. `useActiveWorkspace` and a
 * `WorkspaceSwitcher` mounting together).
 * @internal
 */
export function fetchMembershipsShared(gatewayUrl: string, token: string): Promise<MembershipsResponse> {
  const url = `${gatewayUrl}/api/auth/list_memberships`;
  const key = `${url}\n${token}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(errorMessageFromBody(body, `Memberships request failed: ${res.status}`));
    }
    const body = (await res.json()) as MembershipsResponse;
    // Decorate isActive on each workspace from the response's pointers.
    return {
      ...body,
      memberships: body.memberships.map((m) => ({
        ...m,
        workspaces: m.workspaces.map((w) => ({
          ...w,
          isActive: w.id === body.activeWorkspaceId,
        })),
      })),
    };
  })().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/**
 * Hook: list every team + workspace the current user belongs to. Returns a
 * flat memberships array that's easy to render in a switcher dropdown.
 *
 * @param opts.gatewayUrl Base URL override. Defaults to the provider's
 * `config.gatewayUrl`, then `NEXT_PUBLIC_GATEWAY_URL`, then a relative URL.
 */
export function useMemberships(opts: { gatewayUrl?: string } = {}): MembershipsState {
  const { isAuthenticated, getAccessToken, gatewayUrl: providerGatewayUrl } = useHyperyAuth();
  const [data, setData] = useState<MembershipsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const gatewayUrl = resolveGatewayUrl(opts.gatewayUrl, providerGatewayUrl);

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
      setData(await fetchMembershipsShared(gatewayUrl, token));
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

/** The resolved active team + workspace. */
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
 * Uses the same gateway resolution as `useMemberships` and shares its request.
 */
export function useActiveWorkspace(opts: { gatewayUrl?: string } = {}): {
  active: ActiveWorkspace | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useMemberships(opts);
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
 *
 * `opts.gatewayUrl` defaults to `NEXT_PUBLIC_GATEWAY_URL`, then a relative URL
 * (a plain function can't read the provider — pass `useHyperyAuth().gatewayUrl`).
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
  const base = resolveGatewayUrl(opts.gatewayUrl);
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
    const text = await res.text().catch(() => res.statusText);
    let detail = text;
    try {
      detail = errorMessageFromBody(JSON.parse(text), text);
    } catch {
      // not JSON — use the raw text
    }
    throw new Error(`Failed to switch workspace: ${detail}`);
  }
}
