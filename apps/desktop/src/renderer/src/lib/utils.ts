import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 合并条件类名，并让后写的 Tailwind 类覆盖冲突类 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
