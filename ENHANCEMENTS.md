# @hyperyai/sdk Enhancements

Based on [Clerk's React Authentication](https://clerk.com/react-authentication) best practices.

## Summary of Changes

### New Components

1. **`<SignUp />`** - Dedicated sign-up button component
   - Matches Clerk's API pattern
   - Supports variants: `primary`, `secondary`, `outline`
   - Customizable button text and callbacks
   - File: `src/components/SignUp.tsx`

2. **`<UserProfile />`** - User profile card component
   - Displays user avatar, name, email, and ID
   - Loading state support
   - Extended view option
   - File: `src/components/UserProfile.tsx`

### New Hooks

1. **`useAuth()`** - Alias for `useHyperyAuth()`
   - Matches Clerk's naming convention
   - Provides full authentication context
   - Makes migration from Clerk easier
   - File: `src/hooks/index.ts`

### Enhanced Demo App

1. **Comprehensive Examples Page** (`/examples`)
   - Complete showcase of all components and hooks
   - Live, interactive examples
   - Code snippets for each example
   - Organized by category:
     - Authentication Components
     - Control Components
     - React Hooks
     - Customization (variants)
   - File: `auth-demo/app/examples/page.tsx` in hypery-examples

2. **Improved Home Page**
   - Added prominent link to examples page
   - Better visual hierarchy
   - Clearer feature demonstrations

### Updated Documentation

1. **README.md**
   - Added documentation for `<SignUp />` and `<UserProfile />`
   - Added `useAuth()` hook documentation
   - Improved component API documentation
   - Added variant options for buttons

2. **EXAMPLES.md** (in package)
   - Already existed with comprehensive examples
   - Still valid and useful

## Component API Reference

### `<SignUp />`

```tsx
<SignUp 
  buttonText="Get Started"
  variant="primary"  // 'primary' | 'secondary' | 'outline'
  className="custom-class"
  onSignUpStart={() => void}
  redirectUrl="/dashboard"
/>
```

### `<UserProfile />`

```tsx
<UserProfile 
  showExtended={true}
  showLoading={true}
  className="custom-class"
/>
```

### `useAuth()`

```tsx
const {
  user,              // User object or null
  isAuthenticated,   // boolean
  isLoading,         // boolean
  error,             // string | null
  login,             // (redirectUrl?: string) => void
  logout,            // () => Promise<void>
  refreshAuth,       // () => Promise<void>
  getAccessToken,    // () => Promise<string>
} = useAuth();
```

## Comparison with Clerk

### What We Have (Similar to Clerk)

✅ `<SignIn />` and `<SignUp />` components  
✅ `<UserButton />` for user menu  
✅ `<UserProfile />` for profile display  
✅ `<SignedIn />` and `<SignedOut />` control components  
✅ `<Protect />` for route protection  
✅ `<RedirectToSignIn />` for redirects  
✅ `useAuth()` hook matching Clerk's API  
✅ `useUser()` hook for user data  
✅ OAuth 2.0 + PKCE flow  
✅ Auto token refresh  
✅ Customizable UI (variants, className)  

### What We Don't Have (Yet)

⏳ Organization management components (`<OrganizationSwitcher />`, `<OrganizationProfile />`)  
⏳ `useOrganization()` hook  
⏳ Multi-session handling  
⏳ Role-based access control (RBAC) UI  
⏳ Full-page auth components (like Clerk's hosted pages)  
⏳ Custom field support in user profile  

### What We Do Differently

🔄 **OAuth-based** - Uses Hypery's OAuth system, not custom auth  
🔄 **Lightweight** - Minimal dependencies, focused on essentials  
🔄 **Open Source** - Can be customized and extended freely  
🔄 **Self-hosted** - No third-party service dependency  

## Future Enhancements

### Phase 1: Core Features (Completed ✅)
- [x] Add `useAuth()` hook
- [x] Create `<SignUp />` component
- [x] Create `<UserProfile />` component
- [x] Build comprehensive examples page
- [x] Update documentation

### Phase 2: Team Support (Future)
- [ ] Add `useOrganization()` hook
- [ ] Create `<OrganizationSwitcher />` component
- [ ] Create `<OrganizationProfile />` component
- [ ] Create `<CreateOrganization />` component
- [ ] Add team/organization context to auth state

### Phase 3: Advanced Features (Future)
- [ ] Role-based access control (RBAC)
- [ ] Permission checking in `<Protect />` component
- [ ] Multi-session support
- [ ] Custom field support
- [ ] Webhooks integration
- [ ] Admin dashboard integration

### Phase 4: Developer Experience (Future)
- [ ] TypeScript strict mode
- [ ] Comprehensive test suite
- [ ] Storybook for component demos
- [ ] CLI for project setup
- [ ] Migration guide from Clerk

## Migration from Clerk

If you're migrating from Clerk, here's a quick guide:

### Component Mapping

| Clerk | @hyperyai/sdk | Status |
|-------|----------------|--------|
| `<ClerkProvider>` | `<HyperyProvider>` | ✅ Available |
| `<SignIn>` | `<SignIn>` | ✅ Available |
| `<SignUp>` | `<SignUp>` | ✅ Available |
| `<UserButton>` | `<UserButton>` | ✅ Available |
| `<UserProfile>` | `<UserProfile>` | ✅ Available |
| `<SignedIn>` | `<SignedIn>` | ✅ Available |
| `<SignedOut>` | `<SignedOut>` | ✅ Available |
| `<Protect>` | `<Protect>` | ✅ Available (no RBAC yet) |
| `<RedirectToSignIn>` | `<RedirectToSignIn>` | ✅ Available |
| `useAuth()` | `useAuth()` | ✅ Available |
| `useUser()` | `useUser()` | ✅ Available |
| `<OrganizationSwitcher>` | ❌ Not yet | ⏳ Planned |
| `<OrganizationProfile>` | ❌ Not yet | ⏳ Planned |
| `useOrganization()` | ❌ Not yet | ⏳ Planned |

### Key Differences

1. **Provider Configuration**
   ```tsx
   // Clerk
   <ClerkProvider publishableKey="pk_...">
   
   // @hyperyai/sdk
   <HyperyProvider config={{
     clientId: "your-client-id",
     redirectUri: "http://localhost:3000/callback",
     gatewayUrl: "https://hypery.ai"
   }}>
   ```

2. **Authentication Flow**
   - Clerk: Managed auth with hosted pages
   - @hyperyai/sdk: OAuth 2.0 + PKCE flow

3. **User Object**
   ```tsx
   // Clerk
   user.firstName, user.lastName, user.imageUrl
   
   // @hyperyai/sdk
   user.name, user.email, user.image
   ```

## Live Demo

Visit the auth-demo app to see all components in action:

- Home: `http://localhost:3003/`
- Examples: `http://localhost:3003/examples`
- Protected Route: `http://localhost:3003/protected`
- API Demo: `http://localhost:3003/api-demo`

## Contributing

If you'd like to contribute new components or features, please follow these patterns:

1. **Components**: Place in `src/components/`
2. **Hooks**: Place in `src/hooks/`
3. **Types**: Add to `src/types/index.ts`
4. **Export**: Update `src/index.ts`
5. **Document**: Add to README.md and create examples
6. **Demo**: Add to auth-demo app examples page

## License

MIT

