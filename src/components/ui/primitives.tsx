/**
 * Shared building blocks for the SDK's components, styled to match hypery.ai
 * (see src/styles.css for the `hy:` utilities and `--hy-*` tokens).
 */

'use client';

import React from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/utils.js';

/** Root class every SDK component carries: scopes the tokens and the reset. */
export const ROOT = 'hypery';

/** Inline style that rebrands a component from `branding.primaryColor`. */
export function brandStyle(primaryColor?: string): React.CSSProperties | undefined {
  if (!primaryColor) return undefined;
  return {
    '--hy-primary': primaryColor,
    '--hy-primary-foreground': 'oklch(0.99 0 0)',
    '--hy-primary-hover': `color-mix(in oklch, ${primaryColor}, black 12%)`,
    '--hy-ring': primaryColor,
  } as React.CSSProperties;
}

const focus =
  'hy:outline-none hy:focus-visible:ring-[3px] hy:focus-visible:ring-ring/50';

const base =
  'hy:inline-flex hy:items-center hy:justify-center hy:gap-2 hy:whitespace-nowrap hy:rounded-md hy:text-sm hy:font-medium hy:transition-[color,background-color,box-shadow] hy:duration-150 hy:select-none hy:disabled:pointer-events-none hy:disabled:opacity-50 hy:[&_svg]:shrink-0 hy:[&_svg]:pointer-events-none ' +
  focus;

/** Button variants, mirroring hypery.ai's `components/ui/button.tsx`. */
export const buttonVariants = {
  primary: `${base} hy:bg-primary hy:text-primary-foreground hy:shadow-xs hy:hover:bg-primary-hover`,
  secondary: `${base} hy:bg-field hy:text-foreground hy:hover:bg-field-hover`,
  outline: `${base} hy:bg-transparent hy:text-foreground hy:ring-1 hy:ring-inset hy:ring-border-strong hy:hover:bg-accent`,
  ghost: `${base} hy:text-muted-foreground hy:hover:bg-accent hy:hover:text-accent-foreground`,
  destructive: `${base} hy:bg-destructive hy:text-destructive-foreground hy:shadow-xs hy:hover:opacity-90`,
  link: 'hy:inline hy:font-medium hy:text-primary hy:underline-offset-4 hy:hover:underline hy:rounded-sm ' + focus,
} as const;

export const buttonSizes = {
  sm: 'hy:h-8 hy:px-3 hy:text-[13px]',
  md: 'hy:h-9 hy:px-4',
  lg: 'hy:h-10 hy:px-5',
  xl: 'hy:h-11 hy:px-6 hy:text-[15px]',
} as const;

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('hy:size-4 hy:animate-spin', className)} />;
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={cn('hy:size-4', className)} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={cn('hy:size-4', className)} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

/** Full-width "Continue with X" button with an icon or a spinner while pending. */
export function ProviderButton({
  icon,
  label,
  pending,
  disabled,
  onClick,
  variant = 'secondary',
}: {
  icon: React.ReactNode;
  label: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  variant?: keyof typeof buttonVariants;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(buttonVariants[variant], buttonSizes.lg, 'hy:w-full')}
    >
      {pending ? <Spinner /> : icon}
      <span>{pending ? 'Connecting…' : label}</span>
    </button>
  );
}

/** The "Or continue with" rule between provider buttons and the email button. */
export function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="hy:flex hy:items-center hy:gap-3" role="separator">
      <span className="hy:h-px hy:flex-1 hy:bg-border-strong hy:opacity-60" />
      <span className="hy:text-[11px] hy:font-medium hy:uppercase hy:tracking-wider hy:text-subtle-foreground">
        {children}
      </span>
      <span className="hy:h-px hy:flex-1 hy:bg-border-strong hy:opacity-60" />
    </div>
  );
}

/** Inline error note used by the sign-in surfaces. */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="hy:flex hy:items-start hy:gap-2.5 hy:rounded-lg hy:bg-danger-subtle hy:px-3.5 hy:py-3 hy:text-sm hy:text-danger-foreground"
    >
      <CircleAlert aria-hidden className="hy:mt-0.5 hy:size-4 hy:shrink-0" />
      <span className="hy:min-w-0 hy:break-words">{children}</span>
    </div>
  );
}

/** Logo/title/subtitle block shared by the sign-in surfaces. */
export function AuthHeader({
  logo,
  title,
  subtitle,
  size = 'md',
}: {
  logo?: string;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <div className="hy:flex hy:flex-col hy:items-center hy:gap-1.5 hy:text-center">
      {logo && <img src={logo} alt="Logo" className="hy:mb-3 hy:h-11 hy:w-auto" />}
      <h2
        className={cn(
          'hy:font-semibold hy:tracking-tight hy:text-foreground',
          size === 'lg' ? 'hy:text-2xl' : 'hy:text-xl',
        )}
      >
        {title}
      </h2>
      <p className="hy:text-sm hy:text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/** Callout used by the error/limit alerts. */
export function Callout({
  tone,
  icon,
  title,
  children,
  actions,
  className,
}: {
  tone: 'danger' | 'warning' | 'neutral';
  icon: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    danger: 'hy:bg-danger-subtle hy:text-danger-foreground',
    warning: 'hy:bg-warning-subtle hy:text-warning-foreground',
    neutral: 'hy:bg-muted hy:text-foreground',
  } as const;
  const iconTones = {
    danger: 'hy:text-destructive',
    warning: 'hy:text-warning',
    neutral: 'hy:text-muted-foreground',
  } as const;
  return (
    <div role="alert" className={cn(ROOT, 'hy:rounded-xl hy:p-4', tones[tone], className)}>
      <div className="hy:flex hy:items-start hy:gap-3">
        <span className={cn('hy:mt-0.5 hy:shrink-0 hy:[&_svg]:size-5', iconTones[tone])}>{icon}</span>
        <div className="hy:min-w-0 hy:flex-1">
          <h3 className="hy:text-sm hy:font-semibold">{title}</h3>
          {children && <div className="hy:mt-1 hy:space-y-1 hy:text-sm hy:opacity-90">{children}</div>}
          {actions && <div className="hy:mt-3 hy:flex hy:flex-wrap hy:gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

/** Small action button that sits on a Callout. */
export function CalloutAction({
  onClick,
  children,
  emphasis = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'hy:inline-flex hy:h-8 hy:items-center hy:gap-1 hy:rounded-md hy:px-3 hy:text-[13px] hy:font-medium hy:transition-colors',
        focus,
        emphasis
          ? 'hy:bg-card hy:text-foreground hy:shadow-xs hy:hover:bg-field'
          : 'hy:bg-transparent hy:text-current hy:ring-1 hy:ring-inset hy:ring-current/25 hy:hover:bg-current/10',
      )}
    >
      {children}
    </button>
  );
}
