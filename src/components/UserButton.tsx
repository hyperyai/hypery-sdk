/**
 * User Button Component
 * Similar to Clerk's <UserButton />
 */

'use client';

import React, { useState } from 'react';
import { useUser, useHyperyAuth } from '../lib/context';

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
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  return (
    <div className={`relative ${className || ''}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${sizeMap[size]} rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold hover:opacity-90 transition-opacity`}
        type="button"
        aria-label="User menu"
      >
        {user.image ? (
          <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
        ) : (
          user.name.charAt(0).toUpperCase()
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg z-20 py-2">
            {renderDropdown ? (
              renderDropdown(user, handleLogout)
            ) : (
              <>
                {showUserInfo && (
                  <div className="px-4 py-3 border-b">
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                  type="button"
                >
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

