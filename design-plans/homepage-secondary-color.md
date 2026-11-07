# Secondary accent color system for homepage

Written against: commit 0643940 (master)

## Evidence chain

- Surface: `frontend/src/pages/Home.tsx` (route `/r/`), `frontend/src/index.css` (`@theme` tokens)
- Problem: All interactive surfaces on the homepage (hero CTA, category pills, filter chips, CTA banner button) use brand orange (`brand-600`) with no secondary accent. No visual hierarchy, no premium contrast, all CTAs compete for attention equally.
- Design evidence: `frontend/src/index.css` lines 13-22 define `brand-50` through `brand-900` (orange family only). `frontend/src/index.css` lines 237-242 define transitions (`--ease-out`, `--ease-spring`) but no secondary color token. Home.tsx lines 166, 228, 295 all apply `bg-brand-600` to interactive elements.
- Owner: `frontend/src/pages/Home.tsx` owns homepage surface; `frontend/src/index.css` owns design tokens.
- Scope and affected surfaces: `frontend/src/index.css` (`@theme`), `frontend/src/pages/Home.tsx` (hero overlay, category pills, filter chips, CTA banner, category cards, FloatingCartBar)
- Uncertainty: None — secondary color is a design decision, not a runtime dependency.

## Design decision

Introduce a deliberate secondary accent color (`#0f172a`, slate-900) that complements brand orange (`#ea580c`) with maximum contrast. Brand orange is reserved for the primary order CTA only; secondary actions use slate-900 to create visual hierarchy and premium contrast.

## Reuse

- Token system: `frontend/src/index.css` `@theme` block — add `--color-secondary-accent` alongside existing brand tokens.
- Component variants: `frontend/src/components/ui/Button.tsx` already has `variant` prop (`primary`, `secondary`, `ghost`, `danger`, `outline`) — reuse for secondary CTAs.
- Exemplar: `frontend/src/pages/Home.tsx` line 295 shows the primary order CTA pattern to preserve for brand orange.

## Changes

1. `frontend/src/index.css`
   - Change: Add `--color-secondary-accent-50: #f1f5f9;` and `--color-secondary-accent-900: #0f172a;` to `@theme` block after brand tokens.
   - Preserve: All existing brand orange tokens, transitions, and shadow definitions unchanged.
   - Verify: `npm run build` produces CSS containing `--color-secondary-accent-900`.

2. `frontend/src/pages/Home.tsx` — hero section
   - Change: Strengthen hero overlay from `bg-black/20` to `bg-gradient-to-b from-black/40 via-black/20 to-black/10` for depth and readability over bright hero images.
   - Preserve: `hp.heroImageUrl`, headline hierarchy, search bar placement.
   - Verify: White hero text maintains WCAG AA contrast over light hero backgrounds.

3. `frontend/src/pages/Home.tsx` — category pills
   - Change: Active pill uses `bg-secondary-accent-900 text-white`; inactive pill uses `bg-white/20 border-white/30 text-white`. Add `ring-2 ring-secondary-accent-500` ring to active pill for selection clarity.
   - Preserve: Pill count (max 6), `setSelectedCategory` behavior, category-scoped search integration.
   - Verify: Active pill visually distinct from inactive at a glance.

4. `frontend/src/pages/Home.tsx` — filter chips
   - Change: Active filter chip uses `bg-secondary-accent-900 text-white`; inactive uses `bg-white text-zinc-600 border border-stone-200`. Add `shadow-md` to active chip.
   - Preserve: Filter labels (All, Pure Veg, Bestsellers, Under ₹200, Spicy), `setActiveFilter` behavior.
   - Verify: Active filter immediately scannable among inactive chips.

5. `frontend/src/pages/Home.tsx` — CTA banner button
   - Change: Primary order CTA keeps `bg-brand-600 text-white hover:bg-brand-700`; secondary "Call Us" link keeps `bg-white/10` but adds `ring-1 ring-secondary-accent-900/30`.
   - Preserve: `hp.ctaButtonText`, ArrowRight icon, tel link behavior.
   - Verify: Primary CTA remains the strongest visual element on the banner.

6. `frontend/src/pages/Home.tsx` — category cards
   - Change: Add `ring-1 ring-secondary-accent-900/10` to category card base; `ring-secondary-accent-900/30` on hover.
   - Preserve: Category grid layout, `Link` to `/r/menu?cat=`, dietary dot indicator.
   - Verify: Cards gain subtle depth without visual noise.

## Scope

- Inherit: All homepage consumers of brand tokens (SearchBar, ProductCard, CategoryScroll, FloatingCartBar) continue using existing tokens unchanged.
- Verify: Admin panel (`/admin/homepage`) hero background configurability unaffected; mobile/tablet viewports at `sm:`/`md:`/`lg:` breakpoints.
- Exclude: POS interface (`/r/pos`), admin pages (`/admin/*`), checkout flow, evolution-go and campaign-runner repositories — not part of homepage surface.

## Validation

- Product: User can distinguish primary order CTA from secondary actions at a glance; orange draws attention to ordering path.
- Interface: Routes `/r/` at mobile (`375px`), tablet (`768px`), desktop (`1440px`); hero text readable over light and dark hero images; active pill/chip selection obvious.
- System: No parallel pattern created — secondary color uses existing `@theme` + `variant` prop infrastructure, not a new component or utility class.
- Repository: `cd frontend && npm run build` → build completes with zero errors; `cd frontend && npx tsc --noEmit` → no type errors.

## Stop conditions

- Stop if brand orange (`#ea580c`) is required on secondary actions by a documented design contract discovered during execution.
- Stop if homepage route or `useHomepage` context ownership changes.

## Design documentation

- After acceptance and validation: Record secondary color decision (`--color-secondary-accent-900: #0f172a`) in `frontend/src/index.css` comments or `DESIGN.md` if one exists; otherwise no documentation change required.
