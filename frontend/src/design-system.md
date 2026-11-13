# OCP Design System Documentation

## Overview

This document covers the complete design system for the OCP SaaS Pizza Ordering Platform, including design tokens, components, patterns, and accessibility guidelines.

**Last Updated:** 2026-11-09  
**Design System Version:** 1.0.0  
**Total Components:** 45+  
**Design Score:** 62/100 → Target: 90/100+

---

## Design Tokens

All visual values are defined in `src/design-tokens.ts` and exported as CSS custom properties in `src/design-tokens.css`.

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--brand-500` | `#ea580c` | Primary brand color |
| `--brand-600` | `#c2410c` | Primary hover/active |
| `--emerald-500` | `#10b981` | Success, positive actions |
| `--emerald-600` | `#059669` | Success hover |
| `--red-500` | `#ef4444` | Errors, destructive actions |
| `--red-600` | `#dc2626` | Errors hover |
| `--zinc-50` | `#fafafa` | Light backgrounds |
| `--zinc-200` | `#e4e4e7` | Input borders, dividers |
| `--zinc-600` | `#52525b` | Secondary text |
| `--zinc-900` | `#18181b` | Primary text |
| `--stone-100` | `#f5f5f4` | Card backgrounds |
| `--stone-200` | `#e7e5e4` | Secondary borders |

### Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--font-family-sans` | system-ui, ... | Body text, headings |
| `--font-family-mono` | ui-monospace, ... | Code, receipts, numbers |
| `--font-size-xs` | 0.75rem (12px) | Small labels, captions |
| `--font-size-sm` | 0.875rem (14px) | Secondary text |
| `--font-size-base` | 1rem (16px) | Body text |
| `--font-size-lg` | 1.125rem (18px) | Section headings |
| `--font-size-xl` | 1.25rem (20px) | Page titles |
| `--font-weight-medium` | 500 | Emphasized text |
| `--font-weight-bold` | 700 | Strong emphasis |

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-1` | 4px | Tight grouping |
| `--spacing-2` | 8px | Component padding |
| `--spacing-3` | 12px | Section padding |
| `--spacing-4` | 16px | Card padding |
| `--spacing-6` | 24px | Section gaps |
| `--spacing-8` | 32px | Major sections |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small buttons, badges |
| `--radius-md` | 8px | Inputs, cards |
| `--radius-lg` | 12px | Large cards, modals |
| `--radius-full` | 9999px | Pills, switches |

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | 0 1px 2px 0 | Subtle elevation |
| `--shadow-md` | 0 4px 6px -1px | Cards, dropdowns |
| `--shadow-lg` | 0 10px 15px -3px | Modals, overlays |

---

## Component Inventory

### shadcn Button

**File:** `src/components/shadcn/button.tsx`

| Property | Value |
|----------|-------|
| Variants | default, destructive, outline, secondary, ghost, link |
| Sizes | default, sm, lg, icon |
| States | default, hover, active, disabled, loading |
| Accessibility | Focus ring, disabled state, keyboard accessible |

**Usage:**
```tsx
<Button variant="default" size="sm">Click me</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">More</Button>
```

### shadcn Input

**File:** `src/components/shadcn/input.tsx`

| Property | Value |
|----------|-------|
| Variants | default |
| States | default, focus, disabled, error |
| Accessibility | Label association, error messages, focus ring |

**Usage:**
```tsx
<Input placeholder="Enter text" />
<Input error placeholder="Invalid input" />
```

### shadcn Card

**File:** `src/components/shadcn/card.tsx`

| Property | Value |
|----------|-------|
| Variants | default |
| States | default, hover |
| Accessibility | None (presentational) |

**Usage:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

### shadcn Switch

**File:** `src/components/shadcn/switch.tsx`

| Property | Value |
|----------|-------|
| Variants | default |
| Sizes | sm, default |
| States | checked, unchecked, disabled |
| Accessibility | ARIA checked state, keyboard accessible |

### CompleteMealSection

**File:** `src/components/CompleteMealSection.tsx`

The storefront's "Complete Your Meal" upsell region. One owner, used on the
product page (`/r/menu/item/:id`), the cart (`/r/cart`) and the checkout
(`/r/checkout`).

| Property | Value |
|----------|-------|
| Title source | `useHomepage().completeMealTitle` (admin editable) |
| Item source | Menu items in the configured categories, excluding what is already in the cart |
| Grid | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` — one column on phones so the name is never truncated |
| Card | White, `rounded-3xl`, `h-28` image, one-line name (`line-clamp-1`), price |
| Add control | shadcn `Button`, `type="button"`, `w-full h-11 touch-target`, label `Add` with `Adding…` / `Added!` states |

**Admin configuration** (homepage settings, `/admin/homepage`):

| Setting | Default |
|---------|---------|
| `complete_meal_title` | `Complete Your Meal` |
| `complete_meal_categories` | `garlic-bread,desserts,french-fries,drinks,beverages` |
| `complete_meal_limit` | `4` |
| `complete_meal_show_on_product` | `true` |
| `complete_meal_show_on_cart` | `true` |
| `complete_meal_show_on_checkout` | `true` |

**Note:** the add control must stay `type="button"` — the region renders
inside the checkout form, where a submit button would place the order.

### AdminPrinterTemplate

**File:** `src/pages/AdminPrinterTemplate.tsx`

| Property | Value |
|----------|-------|
| Variants | None (single layout) |
| States | saving, saved, error, idle |
| Accessibility | ARIA labels on elements, keyboard navigation |
| Features | Drag-and-drop reordering, auto-save, undo, import/export |

### AdminPrinter

**File:** `src/pages/AdminPrinter.tsx`

| Property | Value |
|----------|-------|
| Variants | none, usb, network, web, browser |
| States | saving, testing, error |
| Accessibility | ARIA labels, keyboard navigation |

### PrinterTemplateElement (Internal)

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique element identifier |
| type | text\|divider\|qr\|spacer | Element type |
| text | string | Text content |
| align | left\|center\|right | Text alignment |
| bold | boolean | Bold styling |
| double_height | boolean | Double height |
| size | 1\|2\|3\|4 | Font size |
| padding_top | number | Top padding (lines) |
| padding_bottom | number | Bottom padding (lines) |
| qr_value | string | QR code content |
| qr_size | 1-8 | QR code size |
| condition | string | Conditional display rule |
| italic | boolean | Italic styling |

---

## Patterns

### Receipt Template Designer

**Location:** `src/pages/AdminPrinterTemplate.tsx`

**Purpose:** Configure receipt layout for POS thermal printers.

**Key Features:**
- Drag-and-drop element reordering
- Click-to-edit element properties
- Real-time preview
- Auto-save with debounce (1.5s)
- Undo stack (10 entries)
- Import/Export JSON configuration
- Conditional display rules (show_if_customer, show_if_delivery, etc.)
- 14 placeholder variables for dynamic content

**Accessibility:**
- ARIA labels on all element list items
- Keyboard navigation support
- Focus management
- Screen reader compatible

### POS Printer Configuration

**Location:** `src/pages/AdminPrinter.tsx`

**Purpose:** Configure POS thermal printer connection.

**Printer Types:**
- none: Printing disabled
- usb: Local USB/COM port printer
- network: Network thermal printer (TCP)
- web: Browser print dialog (no hardware)
- browser: Standard browser print

**Features:**
- Auto-print online orders
- Test page functionality
- Status monitoring
- Paper width selection (58mm/80mm)

### Customer Authentication

**Location:** `src/pages/Login.tsx`, `src/pages/Register.tsx`

**Purpose:** Customer authentication with email+password and WhatsApp OTP.

**Features:**
- Email+password registration/login
- WhatsApp OTP authentication
- Password reset flow
- Email verification
- Password strength validation
- Login attempt lockout (5 attempts, 15min lockout)
- Password history (last 5)
- Session fixation protection
- CSRF protection

---

## Accessibility Guidelines

### Color Contrast

All text meets WCAG 2.1 AA contrast requirements (4.5:1 for normal text, 3:1 for large text).

### Keyboard Navigation

All interactive elements are keyboard accessible:
- Tab order follows logical flow
- Focus indicators visible
- Escape closes modals/dialogs
- Enter/Space activates buttons

### ARIA Attributes

| Component | ARIA Attribute | Value |
|-----------|---------------|-------|
| Switch | `role="switch"` | checked/unchecked |
| Element list items | `role="listitem"` | Element description |
| Element list items | `aria-selected` | true/false |
| Button groups | `aria-label` | Descriptive label |

### Focus Management

- Focus returns to trigger element after modal close
- Focus traps in modal dialogs
- Visible focus indicators on all interactive elements

---

## Usage Guidelines

### Do's

✅ Use design tokens from `src/design-tokens.ts`  
✅ Use shadcn UI components for consistency  
✅ Add ARIA labels to interactive elements  
✅ Test keyboard navigation  
✅ Use semantic HTML  
✅ Follow the established color palette  
✅ Use consistent spacing scale

### Don'ts

❌ Hardcode hex colors  
❌ Use arbitrary pixel values  
❌ Skip ARIA labels  
❌ Skip focus indicators  
❌ Use non-semantic HTML for interactive elements  
❌ Create custom components without documentation  

---

## Migration Path

When updating design tokens:

1. Update `src/design-tokens.ts`
2. Update `src/design-tokens.css`  
3. Update all component usages
4. Test in dark mode
5. Verify contrast ratios
6. Update this documentation

---

## Open Questions

- Should we add dark mode toggle?
- Should we add component storybook?
- Should we add automated contrast testing?
- Should we add component versioning?

---

*Audit generated by design-system skill.*  
*Base directory: `C:\Users\HOME\.claude\skills\design-system`*
