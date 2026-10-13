/**
 * UserProfile Component
 * Display user profile information in a card format
 */

'use client';

import React from 'react';
import { useUser } from '../lib/context.js';
import { cn } from '../lib/utils.js';
import { ROOT } from './ui/primitives.js';

export interface UserProfileProps {
  /** Show extended profile information */
  showExtended?: boolean;
  /** Custom CSS class */
  className?: string;
  /** Show loading state */
  showLoading?: boolean;
}

/**
 * User profile card component
 * 
 * @example
 * ```tsx
 * <UserProfile showExtended />
 * ```
 */
export function UserProfile({
  showExtended = true,
  className,
  showLoading = true,
}: UserProfileProps) {
  const { user, isLoading } = useUser();

  const card = 'hy:rounded-2xl hy:bg-card hy:p-6 hy:text-card-foreground hy:shadow-card';

  if (isLoading && showLoading) {
    return (
      <div className={cn(ROOT, className || card)}>
        <div className="hy:flex hy:animate-pulse hy:items-center hy:gap-4">
          <div className="hy:size-14 hy:rounded-full hy:bg-muted" />
          <div className="hy:flex-1 hy:space-y-2">
            <div className="hy:h-4 hy:w-3/4 hy:rounded hy:bg-muted" />
            <div className="hy:h-3 hy:w-1/2 hy:rounded hy:bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={cn(ROOT, className || card)}>
      <div className="hy:flex hy:items-center hy:gap-4">
        {user.image ? (
          <img
            src={user.image}
            alt={user.name}
            className="hy:size-14 hy:shrink-0 hy:rounded-full hy:object-cover"
          />
        ) : (
          <div className="hy:flex hy:size-14 hy:shrink-0 hy:items-center hy:justify-center hy:rounded-full hy:bg-linear-to-br hy:from-brand-1 hy:to-brand-2 hy:text-xl hy:font-semibold hy:text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="hy:min-w-0 hy:flex-1">
          <h3 className="hy:truncate hy:text-lg hy:font-semibold hy:tracking-tight hy:text-foreground">
            {user.name}
          </h3>
          <p className="hy:truncate hy:text-sm hy:text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {showExtended && (
        <dl className="hy:mt-5 hy:divide-y hy:divide-border hy:rounded-xl hy:bg-surface-sunken hy:px-4 hy:text-sm">
          <div className="hy:flex hy:items-center hy:justify-between hy:gap-4 hy:py-3">
            <dt className="hy:text-muted-foreground">User ID</dt>
            <dd className="hy:min-w-0 hy:truncate hy:font-mono hy:text-xs hy:text-foreground">{user.id}</dd>
          </div>
          <div className="hy:flex hy:items-center hy:justify-between hy:gap-4 hy:py-3">
            <dt className="hy:text-muted-foreground">Profile status</dt>
            <dd className="hy:inline-flex hy:items-center hy:gap-1.5 hy:rounded-full hy:bg-success-subtle hy:px-2.5 hy:py-0.5 hy:text-xs hy:font-medium hy:text-success-foreground">
              <span className="hy:size-1.5 hy:rounded-full hy:bg-success" />
              Active
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
