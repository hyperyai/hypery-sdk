/**
 * User Button Component
 * Similar to Clerk's <UserButton />
 */

'use client';

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useUser, useHyperyAuth } from '../lib/context.js';
import { cn } from '../lib/utils.js';
import { ROOT } from './ui/primitives.js';

export interface UserButtonProps {
  /** Show user info */
  showUserInfo?: boolean;
  /** Custom className for styling */
  className?: string;
  /** Avatar size */
  size?: 'sm' | 'md' | 'lg';
  /** Render custom dropdown */
  renderDropdown?: (user: NonNullable<ReturnType<typeof useUser>['user']>, logout: () => void) => React.ReactNode;
}

/**
 * User button with avatar and dropdown menu
 * Usually placed in the top-right corner of your layout
 * 
 * @example
 * ```tsx
 * <UserButton showUserInfo />
 * ```
 */
export function UserButton({
  showUserInfo = false,
  className,
  size = 'md',
  renderDropdown,
}: UserButtonProps) {
  const { user, isLoading } = useUser();
  const { logout } = useHyperyAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading || !user) {
    return null;
  }

  const sizeMap = {
    sm: 'hy:size-8 hy:text-sm',
    md: 'hy:size-9 hy:text-sm',
    lg: 'hy:size-11 hy:text-base',
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  return (
    <div className={cn(ROOT, 'hy:relative hy:inline-block', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          sizeMap[size],
          'hy:flex hy:items-center hy:justify-center hy:overflow-hidden hy:rounded-full hy:bg-linear-to-br hy:from-brand-1 hy:to-brand-2 hy:font-semibold hy:text-white hy:shadow-xs hy:transition-shadow hy:outline-none hy:hover:ring-4 hy:hover:ring-ring/20 hy:focus-visible:ring-[3px] hy:focus-visible:ring-ring/50',
        )}
        type="button"
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        {user.image ? (
          <img src={user.image} alt={user.name} className="hy:size-full hy:object-cover" />
        ) : (
          user.name.charAt(0).toUpperCase()
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="hy:fixed hy:inset-0 hy:z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="hy:absolute hy:right-0 hy:z-20 hy:mt-2 hy:w-64 hy:origin-top-right hy:animate-hy-pop-in hy:overflow-hidden hy:rounded-xl hy:bg-popover hy:p-1 hy:text-popover-foreground hy:shadow-lg hy:ring-1 hy:ring-border">
            {renderDropdown ? (
              renderDropdown(user, handleLogout)
            ) : (
              <>
                {showUserInfo && (
                  <div className="hy:mb-1 hy:border-b hy:border-border hy:px-3 hy:pb-2.5 hy:pt-2">
                    <p className="hy:truncate hy:text-sm hy:font-semibold">{user.name}</p>
                    <p className="hy:truncate hy:text-xs hy:text-muted-foreground">{user.email}</p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="hy:flex hy:w-full hy:items-center hy:gap-2 hy:rounded-md hy:px-3 hy:py-2 hy:text-left hy:text-sm hy:text-foreground hy:transition-colors hy:outline-none hy:hover:bg-accent hy:focus-visible:bg-accent"
                  type="button"
                >
                  <LogOut aria-hidden className="hy:size-4 hy:text-muted-foreground" />
                  Sign out
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
