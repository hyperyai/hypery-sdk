/**
 * UserProfile Component
 * Display user profile information in a card format
 */

'use client';

import React from 'react';
import { useUser } from '../lib/context';

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

  if (isLoading && showLoading) {
    return (
      <div className={className || 'bg-white rounded-lg shadow p-6'}>
        <div className="animate-pulse">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const defaultStyles = 'bg-white rounded-lg shadow p-6';

  return (
    <div className={className || defaultStyles}>
      <div className="flex items-start space-x-4">
        {/* Avatar */}
        {user.image ? (
          <img
            src={user.image}
            alt={user.name}
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-gray-900 truncate">
            {user.name}
          </h3>
          <p className="text-sm text-gray-600 truncate">{user.email}</p>

          {showExtended && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">User ID</span>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                  {user.id}
                </code>
              </div>
            </div>
          )}
        </div>
      </div>

      {showExtended && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Profile Status</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Active
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

