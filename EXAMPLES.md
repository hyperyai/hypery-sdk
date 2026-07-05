# @hypery/sdk Examples

## Basic Setup

### Next.js App Router

```tsx
// app/layout.tsx
import { HyperyProvider } from '@hypery/sdk';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <HyperyProvider
          config={{
            clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!,
            redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
            gatewayUrl: process.env.NEXT_PUBLIC_AUTH_URL!,
            scopes: ['read', 'write', 'ai:chat', 'ai:completions'],
          }}
        >
          {children}
        </HyperyProvider>
      </body>
    </html>
  );
}
```

### Next.js Pages Router

```tsx
// pages/_app.tsx
import { HyperyProvider } from '@hypery/sdk';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <HyperyProvider
      config={{
        clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!,
        redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
        gatewayUrl: process.env.NEXT_PUBLIC_AUTH_URL!,
        scopes: ['read', 'write', 'ai:chat'],
      }}
    >
      <Component {...pageProps} />
    </HyperyProvider>
  );
}
```

## Authentication Patterns

### Protected Routes

```tsx
// app/dashboard/page.tsx
import { Protect, useUser } from '@hypery/sdk';

export default function DashboardPage() {
  return (
    <Protect fallback={<div>Redirecting to sign in...</div>}>
      <Dashboard />
    </Protect>
  );
}

function Dashboard() {
  const { user } = useUser();
  
  return (
    <div>
      <h1>Welcome, {user?.name}!</h1>
    </div>
  );
}
```

### Conditional Rendering

```tsx
import { SignedIn, SignedOut, SignIn, UserButton } from '@hypery/sdk';

function Header() {
  return (
    <header>
      <nav>
        <SignedIn>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/settings">Settings</Link>
          <UserButton showUserInfo />
        </SignedIn>

        <SignedOut>
          <SignIn buttonText="Sign in" className="btn-primary" />
        </SignedOut>
      </nav>
    </header>
  );
}
```

### Manual Auth Check

```tsx
import { useHyperyAuth } from '@hypery/sdk';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function ProtectedPage() {
  const { isAuthenticated, isLoading } = useHyperyAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return <div>Protected content</div>;
}
```

## API Requests

### Authenticated Fetch

```tsx
import { useHyperyAuth } from '@hypery/sdk';

function useAuthenticatedFetch() {
  const { getAccessToken } = useHyperyAuth();

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const token = await getAccessToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  };

  return authenticatedFetch;
}

// Usage
function MyComponent() {
  const authFetch = useAuthenticatedFetch();

  const fetchData = async () => {
    const response = await authFetch('/api/data');
    const data = await response.json();
    return data;
  };

  // ...
}
```

### With Hypery v1 API

```tsx
import { useHyperyAuth } from '@hypery/sdk';

function ChatComponent() {
  const { getAccessToken } = useHyperyAuth();

  const sendMessage = async (message: string) => {
    const token = await getAccessToken();

    const response = await fetch('https://api.hypery.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4',
        messages: [{ role: 'user', content: message }],
      }),
    });

    return response.json();
  };

  // ...
}
```

## Custom UI

### Custom Login Page

```tsx
import { useHyperyAuth } from '@hypery/sdk';
import { useState } from 'react';

function CustomLoginPage() {
  const { login, isLoading, error } = useHyperyAuth();
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full">
        <h1 className="text-3xl font-bold mb-2 text-center">Welcome to Hypery</h1>
        <p className="text-gray-600 text-center mb-8">
          Sign in to access powerful AI models
        </p>

        <button
          onClick={login}
          disabled={isLoading}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          className={`
            w-full py-3 px-6 rounded-lg font-semibold text-white
            bg-gradient-to-r from-blue-600 to-purple-600
            hover:from-blue-700 hover:to-purple-700
            disabled:opacity-50 disabled:cursor-not-allowed
            transform transition-all duration-200
            ${isHovering ? 'scale-105' : 'scale-100'}
          `}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Connecting...
            </span>
          ) : (
            'Sign in with Hypery'
          )}
        </button>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <p className="mt-6 text-xs text-gray-500 text-center">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
```

### Custom User Menu

```tsx
import { useUser, useHyperyAuth } from '@hypery/sdk';
import { useState, useRef, useEffect } from 'react';

function CustomUserMenu() {
  const { user } = useUser();
  const { logout } = useHyperyAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100"
      >
        <img
          src={user.image || `https://ui-avatars.com/api/?name=${user.name}`}
          alt={user.name}
          className="w-8 h-8 rounded-full"
        />
        <span className="font-medium">{user.name}</span>
        <svg
          className={`w-4 h-4 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold">{user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          
          <a href="/dashboard" className="block px-4 py-2 hover:bg-gray-50">
            Dashboard
          </a>
          <a href="/settings" className="block px-4 py-2 hover:bg-gray-50">
            Settings
          </a>
          <a href="/billing" className="block px-4 py-2 hover:bg-gray-50">
            Billing
          </a>
          
          <div className="border-t border-gray-100 my-1" />
          
          <button
            onClick={() => {
              logout();
              setIsOpen(false);
            }}
            className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

## Middleware (Next.js)

### Protect API Routes

```tsx
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('hypery_auth_tokens')?.value;

  if (!token && request.nextUrl.pathname.startsWith('/api/protected')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/protected/:path*',
};
```

## Server-Side Rendering

### SSR with Memory Storage

```tsx
// For server-side rendering, use memory storage to avoid hydration mismatches
<HyperyProvider
  config={{
    clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!,
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
    gatewayUrl: process.env.NEXT_PUBLIC_AUTH_URL!,
    storage: 'memory', // Use memory for SSR
  }}
>
  {children}
</HyperyProvider>
```

### Handle OAuth Callback

```tsx
// app/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useHyperyAuth } from '@hypery/sdk';
import { useRouter } from 'next/navigation';

export default function CallbackPage() {
  const { isAuthenticated, isLoading } = useHyperyAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Check for redirect path
      const redirectTo = sessionStorage.getItem('hypery_redirect_after_login');
      if (redirectTo) {
        sessionStorage.removeItem('hypery_redirect_after_login');
        router.push(redirectTo);
      } else {
        router.push('/dashboard');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
        <p>Completing sign in...</p>
      </div>
    </div>
  );
}
```

