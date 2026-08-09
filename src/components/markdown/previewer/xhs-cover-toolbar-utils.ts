import { cn } from '@/lib/utils'

export function clampNumberInput(value: string, min: number, max: number, fallback: number) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue)
    ? Math.min(max, Math.max(min, nextValue))
    : fallback
}

export function getToggleButtonClass(active: boolean, icon = false) {
  return cn(
    icon ? 'size-8' : 'h-8 px-2',
    `
      bg-white text-black transition-none
      hover:bg-neutral-100 hover:text-black
    `,
    active && `
      border-blue-500 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200
      hover:bg-blue-100 hover:text-blue-800
    `,
  )
}
