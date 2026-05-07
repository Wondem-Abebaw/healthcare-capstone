import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function probColor(prob: string) {
  if (prob === 'High')     return 'var(--color-alert)'
  if (prob === 'Moderate') return 'var(--color-warn)'
  return 'var(--color-vital)'
}
