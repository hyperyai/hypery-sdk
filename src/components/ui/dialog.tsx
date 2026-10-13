"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "../../lib/utils.js"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "hypery hy:fixed hy:inset-0 hy:z-50 hy:bg-overlay hy:backdrop-blur-[2px] hy:data-[state=open]:animate-hy-overlay-in",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // `hypery` here too: the content is portalled out of the component tree.
        "hypery hy:fixed hy:left-1/2 hy:top-1/2 hy:z-50 hy:grid hy:w-[calc(100%-2rem)] hy:max-w-lg hy:-translate-x-1/2 hy:-translate-y-1/2 hy:gap-4 hy:rounded-2xl hy:bg-popover hy:p-6 hy:text-popover-foreground hy:shadow-xl hy:outline-none hy:data-[state=open]:animate-hy-content-in",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="hy:absolute hy:right-3.5 hy:top-3.5 hy:inline-flex hy:size-8 hy:items-center hy:justify-center hy:rounded-md hy:text-subtle-foreground hy:transition-colors hy:hover:bg-accent hy:hover:text-foreground hy:outline-none hy:focus-visible:ring-[3px] hy:focus-visible:ring-ring/50">
        <X className="hy:size-4" />
        <span className="hy:sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "hy:flex hy:flex-col hy:gap-1.5 hy:text-center hy:sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "hy:flex hy:flex-col-reverse hy:gap-2 hy:sm:flex-row hy:sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "hy:text-lg hy:font-semibold hy:leading-tight hy:tracking-tight hy:text-foreground",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("hy:text-sm hy:text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

