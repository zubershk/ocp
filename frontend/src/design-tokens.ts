// ============================================================
// Design System Tokens — Single source of truth for all visual values
// Use these instead of hardcoded values throughout the app
// ============================================================

export const tokens = {
  // ------------------------------------------------------------------
  // Colors
  // ------------------------------------------------------------------
  colors: {
    brand: {
      50: '#fef7ee',
      100: '#fdeedc',
      500: '#ea580c',   // Primary brand orange
      600: '#c2410c',   // Darker orange for hover
      950: '#451a03',
    },
    emerald: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      500: '#10b981',
      600: '#059669',
      950: '#022c22',
    },
    zinc: {
      50: '#fafafa',
      100: '#f4f4f5',
      200: '#e4e4e7',
      300: '#d4d4d8',
      400: '#a1a1aa',
      500: '#71717a',
      600: '#52525b',
      700: '#3f3f46',
      800: '#27272a',
      900: '#18181b',
      950: '#09090b',
    },
    stone: {
      50: '#fafaf9',
      100: '#f5f5f4',
      200: '#e7e5e4',
      300: '#d6d3d1',
      400: '#a8a29e',
      500: '#78716c',
      600: '#57534e',
      700: '#44403c',
      800: '#292524',
      900: '#1c1917',
      950: '#0c0a09',
    },
    red: {
      50: '#faf2f2',
      100: '#fee2e2',
      500: '#ef4444',
      600: '#dc2626',
      950: '#450a0a',
    },
    // Semantic
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    // Background
    bg: '#ffffff',
    bgAlt: '#f8fafc',
    bgMuted: '#f1f5f9',
    // Text
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    textInverse: '#ffffff',
    // Borders
    border: '#e2e8f0',
    borderFocus: '#ea580c',
  },

  // ------------------------------------------------------------------
  // Spacing (px values for non-Tailwind contexts)
  // ------------------------------------------------------------------
  spacing: {
    0: '0px',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
  },

  // ------------------------------------------------------------------
  // Typography
  // ------------------------------------------------------------------
  typography: {
    fontFamily: {
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem',// 30px
      '4xl': '2.25rem', // 36px
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
  },

  // ------------------------------------------------------------------
  // Border Radius
  // ------------------------------------------------------------------
  radius: {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  // ------------------------------------------------------------------
  // Shadows
  // ------------------------------------------------------------------
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  },

  // ------------------------------------------------------------------
  // Motion
  // ------------------------------------------------------------------
  motion: {
    duration: {
      fast: '150ms',
      normal: '250ms',
      slow: '350ms',
    },
    easing: {
      easeOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  // ------------------------------------------------------------------
  // Z-index scale
  // ------------------------------------------------------------------
  zIndex: {
    hide: -1,
    base: 0,
    docked: 10,
    dropdown: 100,
    modal: 200,
    popover: 300,
    tooltip: 400,
    toast: 500,
  },
} as const;

// ------------------------------------------------------------------
// Helper: Get color value
// ------------------------------------------------------------------
export function getColor(path: string): string {
  const parts = path.split('.');
  let val: any = tokens.colors;
  for (const p of parts) {
    val = val?.[p];
    if (!val) return path;
  }
  return typeof val === 'string' ? val : path;
}

// ------------------------------------------------------------------
// Helper: Get spacing value
// ------------------------------------------------------------------
export function getSpacing(path: string): string {
  const key = path as unknown as keyof typeof tokens.spacing;
  return key in tokens.spacing ? tokens.spacing[key] : path;
}

// ------------------------------------------------------------------
// CSS Custom Properties export (for use in CSS files)
// ------------------------------------------------------------------
export const cssVariables = {
  '--brand-50': tokens.colors.brand[50],
  '--brand-100': tokens.colors.brand[100],
  '--brand-500': tokens.colors.brand[500],
  '--brand-600': tokens.colors.brand[600],
  '--emerald-500': tokens.colors.emerald[500],
  '--emerald-600': tokens.colors.emerald[600],
  '--zinc-100': tokens.colors.zinc[100],
  '--zinc-200': tokens.colors.zinc[200],
  '--zinc-300': tokens.colors.zinc[300],
  '--zinc-400': tokens.colors.zinc[400],
  '--zinc-500': tokens.colors.zinc[500],
  '--zinc-600': tokens.colors.zinc[600],
  '--zinc-700': tokens.colors.zinc[700],
  '--zinc-800': tokens.colors.zinc[800],
  '--stone-100': tokens.colors.stone[100],
  '--stone-200': tokens.colors.stone[200],
  '--stone-300': tokens.colors.stone[300],
  '--stone-400': tokens.colors.stone[400],
  '--stone-500': tokens.colors.stone[500],
  '--stone-600': tokens.colors.stone[600],
  '--stone-700': tokens.colors.stone[700],
  '--red-500': tokens.colors.red[500],
  '--red-600': tokens.colors.red[600],
  '--radius-sm': tokens.radius.sm,
  '--radius-md': tokens.radius.md,
  '--radius-lg': tokens.radius.lg,
  '--radius-xl': tokens.radius.xl,
  '--radius-full': tokens.radius.full,
  '--shadow-sm': tokens.shadow.sm,
  '--shadow-md': tokens.shadow.md,
  '--shadow-lg': tokens.shadow.lg,
  '--shadow-inner': tokens.shadow.inner,
  '--spacing-1': tokens.spacing[1],
  '--spacing-2': tokens.spacing[2],
  '--spacing-4': tokens.spacing[4],
  '--spacing-6': tokens.spacing[6],
  '--spacing-8': tokens.spacing[8],
  '--font-size-xs': tokens.typography.fontSize.xs,
  '--font-size-sm': tokens.typography.fontSize.sm,
  '--font-size-base': tokens.typography.fontSize.base,
  '--font-size-lg': tokens.typography.fontSize.lg,
  '--font-size-xl': tokens.typography.fontSize.xl,
  '--font-size-2xl': tokens.typography.fontSize['2xl'],
  '--font-weight-normal': tokens.typography.fontWeight.normal,
  '--font-weight-medium': tokens.typography.fontWeight.medium,
  '--font-weight-bold': tokens.typography.fontWeight.bold,
  '--font-family-sans': tokens.typography.fontFamily.sans,
  '--font-family-mono': tokens.typography.fontFamily.mono,
  '--z-index-base': tokens.zIndex.base,
  '--z-index-dropdown': tokens.zIndex.dropdown,
  '--z-index-modal': tokens.zIndex.modal,
  '--z-index-popover': tokens.zIndex.popover,
  '--z-index-toast': tokens.zIndex.toast,
} as const;

export default tokens;
