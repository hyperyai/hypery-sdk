# Quick Start - Modern Auth Components

## 🚀 3-Second Integration

```tsx
import { AuthButton } from '@hyperyai/sdk';

<AuthButton>Sign In</AuthButton>
```

That's it! Beautiful auth modal, Google + GitHub OAuth, fully styled.

---

## 📦 Three Components, Three Use Cases

### 1. `<AuthButton />` - Most Common

**Use when:** You want a button that opens auth modal

```tsx
<AuthButton variant="primary" size="lg">
  Get Started
</AuthButton>
```

**Perfect for:**
- Navbars
- Hero sections  
- Call-to-action buttons
- Feature gates

---

### 2. `<AuthModal />` - Advanced Control

**Use when:** You need programmatic modal control

```tsx
const [open, setOpen] = useState(false);

<button onClick={() => setOpen(true)}>Custom Trigger</button>
<AuthModal isOpen={open} onClose={() => setOpen(false)} />
```

**Perfect for:**
- Custom trigger logic
- Conditional auth flows
- Complex user journeys

---

### 3. `<ModernAuthForm />` - Dedicated Pages

**Use when:** You have a dedicated login/signup page

```tsx
// app/login/page.tsx
<ModernAuthForm mode="signin" showCard />
```

**Perfect for:**
- `/login` route
- `/signup` route
- Full-page auth experiences

---

## 🎨 Customization in 3 Lines

```tsx
const branding = {
  logo: '/logo.png',
  appName: 'My App',
  primaryColor: '#8b5cf6',
};

<AuthButton branding={branding}>Sign In</AuthButton>
```

---

## 💡 Common Patterns

### Pattern 1: Navbar

```tsx
<nav>
  <Logo />
  <SignedOut>
    <AuthButton variant="outline">Sign In</AuthButton>
  </SignedOut>
  <SignedIn>
    <UserButton />
  </SignedIn>
</nav>
```

### Pattern 2: Hero CTA

```tsx
<AuthButton 
  variant="primary" 
  size="lg" 
  mode="signup"
  onSuccess={() => router.push('/dashboard')}
>
  Start Free Trial
</AuthButton>
```

### Pattern 3: Feature Gate

```tsx
<Protect fallback={
  <AuthButton mode="signin">
    Sign in to continue
  </AuthButton>
}>
  <PremiumFeature />
</Protect>
```

---

## ✅ What You Get

- ✨ Beautiful, modern design
- 🌓 Dark mode support
- 📱 Mobile responsive
- ♿ Accessibility compliant
- ⚡ Smooth animations
- 🎨 Customizable branding
- 🔒 Secure OAuth flow
- 📦 Tiny bundle size (~8KB)

---

## 📚 Full Docs

See `MODERN_AUTH_GUIDE.md` for complete documentation with all props, examples, and advanced usage.

---

**Built with ❤️ for developers**


