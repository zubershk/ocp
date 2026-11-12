import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Breaks a label into lines of at most `width` characters, always
 * breaking on a word boundary.
 *
 * A lone trailing word is never left on its own line when the previous
 * line can spare a word: "2 x Golden Corn - Value" / "Pizza" becomes
 * "2 x Golden Corn -" / "Value Pizza", which keeps the item name
 * readable on a receipt instead of stranding a fragment.
 */
export function wrapLabel(label: string, width: number): string[] {
  if (width < 1) width = 1
  const words = label.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w
    if (cur && candidate.length > width) {
      lines.push(cur)
      cur = w
    } else {
      cur = candidate
    }
  }
  lines.push(cur)

  // Balance the last line so it is not a single orphaned word.
  if (lines.length >= 2) {
    const last = lines[lines.length - 1]
    const prev = lines[lines.length - 2]
    if (!last.includes(' ')) {
      const prevWords = prev.split(' ')
      if (prevWords.length >= 2) {
        const moved = prevWords[prevWords.length - 1]
        lines[lines.length - 2] = prevWords.slice(0, -1).join(' ')
        lines[lines.length - 1] = `${moved} ${last}`
      }
    }
  }
  return lines
}
