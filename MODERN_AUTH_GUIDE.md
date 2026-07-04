# Modern Auth Components Guide
## Beautiful, Drop-in Authentication for Your App

**Version:** 2.0  
**Last Updated:** November 16, 2025  
**Inspired by:** [blocks.so/login](https://blocks.so/login)

---

## Overview

The `@hypery/auth` package now includes **modern, beautiful authentication components** that you can drop into any React app. Choose between modal-based or embedded forms based on your needs.

### New Components

1. **`<AuthButton />`** - Trigger auth modal from anywhere
2. **`<AuthModal />`** - Standalone modal dialog
3. **`<ModernAuthForm />`** - Embeddable form for login pages

---

## Quick Start

### Installation

```bash
npm install @hypery/auth
```

### Basic Setup

```tsx
import { HyperyProvider } from '@hypery/auth';

function App() {
  return (
    <HyperyProvider
      config={{
        clientId: 'your-app-id',
        redirectUri: 'https://yourapp.com/auth/callback',
        gatewayUrl: 'https://hypery.com',
      }}
    >
      <YourApp />
    </HyperyProvider>
  );
}
```

---

## Component 1: AuthButton

### The Easiest Way to Add Auth

Drop a button **anywhere** in your app that triggers a beautiful auth modal:

```tsx
import { AuthButton } from '@hypery/auth';

export function Navbar() {
  return (
    <nav>
      <AuthButton>Sign In</AuthButton>
    </nav>
  );
}
```

### Full Example with Customization

```tsx
import { AuthButton } from '@hypery/auth';
import { useRouter } from 'next/navigation';

export function Hero() {
  const router = useRouter();

  return (
    <div className="hero">
      <h1>Welcome to My App</h1>
      
      <AuthButton 
        variant="primary"
        size="lg"
        mode="signup"
        onSuccess={() => {
          console.log('User signed up!');
          router.push('/dashboard');
        }}
        branding={{
          logo: '/logo.png',
          appName: 'My Amazing App',
          primaryColor: '#8b5cf6',
        }}
      >
        Get Started Free
      </AuthButton>
    </div>
  );
}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | ReactNode | 'Sign In' | Button text |
| `variant` | 'primary' \| 'secondary' \| 'outline' \| 'ghost' | 'primary' | Button style |
| `size` | 'sm' \| 'md' \| 'lg' | 'md' | Button size |
| `mode` | 'signin' \| 'signup' | 'signin' | Initial auth mode |
| `onSuccess` | () => void | - | Called after auth success |
| `showSocial` | boolean | true | Show Google/GitHub |
| `showEmailPassword` | boolean | true | Show email form |
| `branding` | BrandingConfig | - | Custom branding |

### Variants Preview

```tsx
// Primary (Purple, elevated)
<AuthButton variant="primary">Sign In</AuthButton>

// Secondary (Gray, elevated)
<AuthButton variant="secondary">Sign In</AuthButton>

// Outline (Border only)
<AuthButton variant="outline">Sign In</AuthButton>

// Ghost (Minimal)
<AuthButton variant="ghost">Sign In</AuthButton>
```

---

## Component 2: AuthModal

### Programmatic Modal Control

For more control, use the modal directly:

```tsx
import { AuthModal } from '@hypery/auth';
import { useState } from 'react';

export function MyComponent() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <button onClick={() => setShowAuth(true)}>
        Login
      </button>

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => {
          setShowAuth(false);
          // Handle successful auth
        }}
      />
    </>
  );
}
```

### Advanced Example with Branding

```tsx
import { AuthModal } from '@hypery/auth';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProtectedFeature() {
  const [showAuth, setShowAuth] = useState(false);
  const router = useRouter();

  const handleUpgrade = () => {
    setShowAuth(true);
  };

  return (
    <div>
      <button onClick={handleUpgrade}>
        Upgrade to Pro
      </button>

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        initialMode="signup"
        onSuccess={() => {
          setShowAuth(false);
          router.push('/billing/upgrade');
        }}
        onError={(error) => {
          console.error('Auth failed:', error);
        }}
        branding={{
          logo: '/logo.png',
          appName: 'My App',
          primaryColor: '#ec4899',
        }}
        showSocial={true}
        showEmailPassword={false} // Social only
      />
    </div>
  );
}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | boolean | required | Modal visibility |
| `onClose` | () => void | required | Close handler |
| `initialMode` | 'signin' \| 'signup' | 'signin' | Starting mode |
| `onSuccess` | () => void | - | Auth success callback |
| `onError` | (error) => void | - | Error callback |
| `showSocial` | boolean | true | Show social buttons |
| `showEmailPassword` | boolean | true | Show email form |
| `branding` | BrandingConfig | - | Custom branding |

---

## Component 3: ModernAuthForm

### For Dedicated Login/Signup Pages

Use this for full-page auth experiences:

```tsx
// app/login/page.tsx
import { ModernAuthForm } from '@hypery/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <ModernAuthForm
        mode="signin"
        showCard={true}
        allowModeSwitch={true}
        onSuccess={() => router.push('/dashboard')}
        branding={{
          logo: '/logo.png',
          appName: 'My App',
          primaryColor: '#8b5cf6',
        }}
      />
    </div>
  );
}
```

### Embedded (No Card)

```tsx
export function LoginSection() {
  return (
    <div className="max-w-md mx-auto">
      <ModernAuthForm
        mode="signin"
        showCard={false}
        showSocial={true}
        showEmailPassword={true}
      />
    </div>
  );
}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | 'signin' \| 'signup' | 'signin' | Auth mode |
| `allowModeSwitch` | boolean | true | Show switch link |
| `showCard` | boolean | true | Wrap in card |
| `showSocial` | boolean | true | Social buttons |
| `showEmailPassword` | boolean | true | Email form |
| `onSuccess` | () => void | - | Success callback |
| `onError` | (error) => void | - | Error callback |
| `branding` | BrandingConfig | - | Custom branding |

---

## Branding Configuration

### BrandingConfig Interface

```typescript
interface BrandingConfig {
  logo?: string;         // URL to logo image
  appName?: string;      // Your app name
  primaryColor?: string; // Hex color (e.g., '#8b5cf6')
}
```

### Example Branding Presets

```tsx
// Purple (default)
const purpleBranding = {
  primaryColor: '#8b5cf6',
  appName: 'My SaaS',
};

// Pink
const pinkBranding = {
  primaryColor: '#ec4899',
  appName: 'Creative App',
};

// Blue
const blueBranding = {
  primaryColor: '#3b82f6',
  appName: 'Enterprise Tool',
};

// Teal
const tealBranding = {
  primaryColor: '#06b6d4',
  appName: 'Developer Platform',
};
```

---

## Common Use Cases

### 1. Add Auth Button to Navbar

```tsx
import { AuthButton, SignedIn, SignedOut, UserButton } from '@hypery/auth';

export function Navbar() {
  return (
    <nav className="flex items-center justify-between p-4">
      <Logo />
      
      <div>
        <SignedOut>
          <AuthButton variant="outline" size="sm">
            Sign In
          </AuthButton>
        </SignedOut>
        
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </nav>
  );
}
```

### 2. Landing Page Hero with Auth

```tsx
import { AuthButton } from '@hypery/auth';

export function Hero() {
  return (
    <section className="text-center py-20">
      <h1 className="text-5xl font-bold mb-6">
        Build Amazing AI Apps
      </h1>
      <p className="text-xl text-gray-600 mb-8">
        Connect to 100+ AI models with one API
      </p>
      
      <div className="flex gap-4 justify-center">
        <AuthButton 
          variant="primary" 
          size="lg"
          mode="signup"
        >
          Get Started Free
        </AuthButton>
        
        <AuthButton 
          variant="outline" 
          size="lg"
          mode="signin"
        >
          Sign In
        </AuthButton>
      </div>
    </section>
  );
}
```

### 3. Protected Content with Auth Gate

```tsx
import { Protect, AuthButton } from '@hypery/auth';

export function PremiumFeature() {
  return (
    <Protect
      fallback={
        <div className="text-center p-12 bg-gray-50 rounded-xl">
          <h3 className="text-2xl font-bold mb-4">
            Sign in to access this feature
          </h3>
          <AuthButton mode="signin">
            Sign In to Continue
          </AuthButton>
        </div>
      }
    >
      <PremiumContent />
    </Protect>
  );
}
```

### 4. Modal Triggered by Custom Action

```tsx
import { AuthModal } from '@hypery/auth';
import { useState } from 'react';

export function PricingCard() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <div className="pricing-card">
        <h3>Pro Plan</h3>
        <p>$29/month</p>
        
        <button onClick={() => setShowAuth(true)}>
          Start Free Trial
        </button>
      </div>

      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        initialMode="signup"
        onSuccess={() => {
          setShowAuth(false);
          // Redirect to checkout
        }}
      />
    </>
  );
}
```

### 5. Dedicated Login Page

```tsx
// app/login/page.tsx
import { ModernAuthForm } from '@hypery/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <ModernAuthForm
        mode="signin"
        allowModeSwitch={true}
        onSuccess={() => router.push('/dashboard')}
        branding={{
          logo: '/logo.svg',
          appName: 'Hypery',
          primaryColor: '#8b5cf6',
        }}
      />
    </div>
  );
}
```

---

## Design Features

### Visual Highlights

✨ **Modern Design**
- Rounded corners (2xl)
- Subtle shadows
- Smooth transitions
- Hover effects

🎨 **Dark Mode Support**
- Automatic theme detection
- Proper contrast ratios
- Beautiful in both modes

🎯 **Accessibility**
- Keyboard navigation
- ARIA labels
- Focus management
- Screen reader support

⚡ **Animations**
- Fade in backdrop
- Zoom in modal
- Smooth button states
- Loading spinners

---

## Customization Examples

### Custom Colors

```tsx
<AuthButton
  branding={{
    primaryColor: '#ec4899', // Pink
  }}
>
  Sign In
</AuthButton>
```

### Social Only (No Email Form)

```tsx
<AuthButton
  showSocial={true}
  showEmailPassword={false}
>
  Quick Sign In
</AuthButton>
```

### Email Only (No Social)

```tsx
<AuthButton
  showSocial={false}
  showEmailPassword={true}
>
  Email Sign In
</AuthButton>
```

### Signup Mode by Default

```tsx
<AuthButton
  mode="signup"
  branding={{ appName: 'My App' }}
>
  Create Account
</AuthButton>
```

---

## Migration from Legacy Components

### Before (Old Way)

```tsx
import { SignInForm } from '@hypery/auth';

<SignInForm 
  showCard
  showTitle
  onSuccess={handleSuccess}
/>
```

### After (New Way)

**Option A: Embedded Form**
```tsx
import { ModernAuthForm } from '@hypery/auth';

<ModernAuthForm
  showCard
  onSuccess={handleSuccess}
  branding={{ primaryColor: '#8b5cf6' }}
/>
```

**Option B: Modal Button (Recommended)**
```tsx
import { AuthButton } from '@hypery/auth';

<AuthButton 
  onSuccess={handleSuccess}
  branding={{ primaryColor: '#8b5cf6' }}
>
  Sign In
</AuthButton>
```

---

## Best Practices

### 1. Use AuthButton for Most Cases

**Why:** 
- Cleaner UX (modal doesn't take up page space)
- Works anywhere (navbar, hero, cards, etc.)
- Better mobile experience

```tsx
// ✅ Recommended
<AuthButton>Sign In</AuthButton>

// ❌ Not recommended (unless you need dedicated page)
<SignInForm showCard />
```

### 2. Use ModernAuthForm for Dedicated Pages

**Good use cases:**
- `/login` page
- `/signup` page
- `/auth` page

```tsx
// app/login/page.tsx
export default function LoginPage() {
  return (
    <div className="auth-page-layout">
      <ModernAuthForm mode="signin" />
    </div>
  );
}
```

### 3. Consistent Branding

**Create a config file:**

```typescript
// config/auth-branding.ts
export const AUTH_BRANDING = {
  logo: '/logo.svg',
  appName: 'My App',
  primaryColor: '#8b5cf6',
};
```

**Use everywhere:**

```tsx
import { AUTH_BRANDING } from '@/config/auth-branding';

<AuthButton branding={AUTH_BRANDING}>Sign In</AuthButton>
<ModernAuthForm branding={AUTH_BRANDING} />
```

### 4. Handle Success Properly

```tsx
import { useRouter } from 'next/navigation';
import { AuthButton } from '@hypery/auth';

export function MyComponent() {
  const router = useRouter();

  return (
    <AuthButton
      onSuccess={() => {
        // Option 1: Redirect
        router.push('/dashboard');
        
        // Option 2: Reload data
        router.refresh();
        
        // Option 3: Show notification
        toast.success('Welcome back!');
        
        // Option 4: Track analytics
        analytics.track('user_signed_in');
      }}
    >
      Sign In
    </AuthButton>
  );
}
```

---

## Styling Guide

### Matching Your Brand

All components accept a `primaryColor` for consistent branding:

```tsx
const myBranding = {
  primaryColor: '#your-brand-color',
};

<AuthButton branding={myBranding} />
<ModernAuthForm branding={myBranding} />
<AuthModal branding={myBranding} />
```

### Tailwind CSS Integration

The components use Tailwind classes internally. Make sure Tailwind is configured:

```javascript
// tailwind.config.js
module.exports = {
  content: [
    './node_modules/@hypery/auth/**/*.{js,ts,jsx,tsx}',
    // ... your app paths
  ],
};
```

### Dark Mode

Components automatically adapt to dark mode:

```tsx
// Works automatically with Tailwind dark mode
<html className="dark">
  <AuthButton>Sign In</AuthButton>
</html>
```

---

## TypeScript Support

Full TypeScript support with intellisense:

```typescript
import { 
  AuthButton, 
  AuthModal, 
  ModernAuthForm,
  type AuthButtonProps,
  type AuthModalProps,
  type ModernAuthFormProps,
} from '@hypery/auth';

// Type-safe props
const buttonProps: AuthButtonProps = {
  variant: 'primary',
  size: 'lg',
  onSuccess: () => console.log('Success!'),
};

<AuthButton {...buttonProps}>Sign In</AuthButton>
```

---

## Comparison: When to Use Each Component

| Component | Use Case | Best For |
|-----------|----------|----------|
| **AuthButton** | Anywhere auth is needed | Navbars, CTAs, features |
| **AuthModal** | Programmatic modal control | Complex flows, conditions |
| **ModernAuthForm** | Dedicated auth pages | `/login`, `/signup` routes |

---

## Examples Gallery

### Example 1: SaaS Homepage

```tsx
export function Homepage() {
  return (
    <div>
      {/* Navbar */}
      <nav className="flex justify-between p-4">
        <Logo />
        <AuthButton variant="outline">Sign In</AuthButton>
      </nav>

      {/* Hero */}
      <section className="text-center py-20">
        <h1>Build Better with AI</h1>
        <AuthButton 
          variant="primary" 
          size="lg"
          mode="signup"
        >
          Start Building Free
        </AuthButton>
      </section>
    </div>
  );
}
```

### Example 2: Pricing Page

```tsx
export function PricingPage() {
  return (
    <div className="grid grid-cols-3 gap-6">
      {plans.map(plan => (
        <PricingCard key={plan.id} plan={plan}>
          <AuthButton 
            mode="signup"
            variant={plan.popular ? 'primary' : 'outline'}
            onSuccess={() => {
              // Pre-select plan after signup
              router.push(`/billing?plan=${plan.id}`);
            }}
          >
            {plan.cta}
          </AuthButton>
        </PricingCard>
      ))}
    </div>
  );
}
```

### Example 3: Paywalled Content

```tsx
import { SignedIn, SignedOut, AuthButton } from '@hypery/auth';

export function Article() {
  return (
    <article>
      <h1>Premium Article</h1>
      
      {/* First paragraph free */}
      <p>This is the introduction...</p>

      <SignedIn>
        {/* Full content for logged-in users */}
        <div>
          <p>Premium content here...</p>
        </div>
      </SignedIn>

      <SignedOut>
        {/* Paywall for anonymous users */}
        <div className="bg-gradient-to-t from-white to-transparent p-8 text-center">
          <p className="mb-4 font-medium">
            Sign in to read the full article
          </p>
          <AuthButton mode="signin">
            Continue Reading
          </AuthButton>
        </div>
      </SignedOut>
    </article>
  );
}
```

---

## Advanced Features

### Custom Success Handling

```tsx
<AuthButton
  onSuccess={async () => {
    // 1. Track conversion
    await analytics.track('signup_completed');
    
    // 2. Identify user
    const user = await getUser();
    analytics.identify(user.id, {
      email: user.email,
      name: user.name,
    });
    
    // 3. Show welcome message
    toast.success(`Welcome, ${user.name}!`);
    
    // 4. Navigate to onboarding
    router.push('/onboarding');
  }}
>
  Get Started
</AuthButton>
```

### Error Handling

```tsx
<AuthModal
  isOpen={showAuth}
  onClose={() => setShowAuth(false)}
  onError={(error) => {
    // Log to error tracking
    Sentry.captureException(new Error(error));
    
    // Show user-friendly message
    if (error.includes('network')) {
      toast.error('Connection issue. Please try again.');
    } else {
      toast.error(error);
    }
  }}
/>
```

### A/B Testing Different Variants

```tsx
const variant = useABTest('auth_button_variant', {
  control: 'primary',
  variant: 'outline',
});

<AuthButton variant={variant}>
  Sign In
</AuthButton>
```

---

## Performance

### Bundle Size

| Component | Size (gzipped) |
|-----------|----------------|
| AuthButton | ~2KB |
| AuthModal | ~3KB |
| ModernAuthForm | ~3KB |
| **Total (all)** | ~8KB |

### Lazy Loading

```tsx
import { lazy, Suspense } from 'react';

const AuthButton = lazy(() => 
  import('@hypery/auth').then(mod => ({ default: mod.AuthButton }))
);

<Suspense fallback={<button>Loading...</button>}>
  <AuthButton>Sign In</AuthButton>
</Suspense>
```

---

## Accessibility

### Keyboard Navigation

- **Tab:** Navigate between buttons/inputs
- **Enter:** Submit form or click button
- **Escape:** Close modal
- **Space:** Activate buttons

### Screen Readers

- Proper ARIA labels
- Role attributes
- Focus management
- Error announcements

### Focus Trapping

Modal automatically:
- Traps focus within dialog
- Returns focus on close
- Highlights active element

---

## FAQ

**Q: Do I need to install shadcn/ui?**  
A: No, these components are self-contained.

**Q: Can I use without Tailwind?**  
A: Tailwind is recommended but not required. Components include inline styles as fallback.

**Q: How do I customize button styles?**  
A: Use the `className` prop or `branding.primaryColor`.

**Q: Does this work with Next.js App Router?**  
A: Yes! All components are marked with `'use client'`.

**Q: Can I use multiple auth buttons on the same page?**  
A: Yes, they share the same modal instance.

**Q: How do I add more OAuth providers?**  
A: Currently supports Google and GitHub. More providers coming soon.

---

## Troubleshooting

### Modal not appearing

```tsx
// ❌ Wrong - modal wrapped in container with overflow hidden
<div className="overflow-hidden">
  <AuthButton>Sign In</AuthButton>
</div>

// ✅ Correct - modal renders at document level
<AuthButton>Sign In</AuthButton>
```

### Styling conflicts

```tsx
// If global styles interfere, use the provided class names
<AuthButton className="your-custom-class">
  Sign In
</AuthButton>
```

### Dark mode not working

```tsx
// Ensure Tailwind dark mode is configured
// tailwind.config.js
module.exports = {
  darkMode: 'class', // or 'media'
};
```

---

## Roadmap

### Coming Soon

- [ ] Magic link authentication
- [ ] SMS/Phone authentication
- [ ] Passkey/WebAuthn support
- [ ] Multi-factor authentication (MFA)
- [ ] Social: LinkedIn, Twitter, Facebook
- [ ] SAML/SSO for enterprise
- [ ] Biometric authentication
- [ ] Session management UI

---

## Support

**Documentation:** [https://docs.hypery.com/auth](https://docs.hypery.com/auth)  
**Examples:** [https://github.com/hypery/examples](https://github.com/hypery/examples)  
**Discord:** [https://discord.gg/hypery](https://discord.gg/hypery)  
**Email:** support@hypery.com

---

**Happy Building! 🚀**


