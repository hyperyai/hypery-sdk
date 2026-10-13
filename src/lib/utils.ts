/**
 * Utility functions for @hyperyai/sdk
 */

import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// SDK classes are Tailwind-prefixed (`hy:`), see src/styles.css.
const twMerge = extendTailwindMerge({ prefix: "hy" })

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
