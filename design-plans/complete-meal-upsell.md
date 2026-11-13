# Complete-meal upsell: one shared owner across product, cart and checkout

Written against: commit `4ee0064` (master)

## Evidence chain

- **Surface:** the storefront upsell region ("Complete Your Meal" / "Goes great with your order").
  - `frontend/src/pages/Product.tsx` (route `/r/menu/item/:id`) — renders it at lines 292–325.
  - `frontend/src/pages/Cart.tsx` (route `/r/cart`) — renders a second, different version at lines 166–200.
  - `frontend/src/pages/Checkout.tsx` (route `/r/checkout`) — renders no upsell region at all.
- **Problem 1 — the product names are unreadable on phones.** `Product.tsx:296` lays the region out as
  `grid grid-cols-2 md:grid-cols-4 gap-4 mt-5`. Every other grid that renders this same product content is
  single-column on mobile: `Menu.tsx:435` (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) and
  `Cart.tsx:170` (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). The product name is clamped to one line by the
  design system's own product card (`components/shadcn-space/blocks/product-listing-01/product-card.tsx:185`,
  `line-clamp-1`). At 390px a two-up grid leaves ~147px of text width, so the rendered region shows
  "Round Garlic Bread…", "Round Garlic Bread wi…", "Round Garlic Bread Ve…", "Round Garlic Bread wi…" — two of the
  four sides render the *same* string, and the words that distinguish them (Tossed / with Cheese / Spicy
  Supreme / with Keema) are cut off. The customer cannot tell the sides apart.
- **Problem 2 — the add control has two different presentations.** `Product.tsx:313-318` renders a small
  brand-orange pill with a `+` icon and the word "Add" beside the price. `Cart.tsx:190-196` renders a bare
  brand-orange circle with a `+` icon. The same action — add this side to the cart — looks different on two
  adjacent screens of the same order flow. The design system's product-card owner settles the question:
  `product-card.tsx:233-252` uses the shadcn `Button` (`components/shadcn/button.tsx`) at `w-full gap-2 h-11
  touch-target`, `type="button"`, with a text label and explicit `Adding…` / `Added!` states. Neither upsell
  copy uses that owner.
- **Problem 3 — the checkout has no upsell region.** `Checkout.tsx` renders only "Customer Information",
  "Delivery Method" and "Order Summary" (verified at 1360px and 390px). The two surfaces immediately before
  payment — the product page and the cart — both carry the region. The checkout is the last surface before the
  order is placed and it is the only one that does not offer it.
- **Design sources:** `frontend/src/design-system.md` (OCP Design System Documentation v1.0.0, last updated
  2026-11-09) — token table, component inventory, and Usage Guidelines ("✅ Use shadcn UI components for
  consistency", "✅ Use consistent spacing scale"). `frontend/src/index.css` `@theme` block (lines 12–58) owns
  the brand tokens. `frontend/src/design-tokens.css` owns the CSS custom properties.
- **Owner:** `frontend/src/context/SiteSettingsContext.tsx:510` owns the section title
  (`complete_meal_title` → `useHomepage().completeMealTitle`, editable in `frontend/src/pages/AdminHomepage.tsx:235`).
  `frontend/src/context/CartContext.tsx` owns cart mutations. `frontend/src/context/CrustContext.tsx:44` owns the
  default crust. `frontend/src/components/shadcn/button.tsx` owns interactive controls.
- **Scope and affected surfaces:** `frontend/src/components/CompleteMealSection.tsx` (new),
  `frontend/src/context/SiteSettingsContext.tsx`, `frontend/src/pages/AdminHomepage.tsx`,
  `frontend/src/pages/Product.tsx`, `frontend/src/pages/Cart.tsx`, `frontend/src/pages/Checkout.tsx`.
- **Uncertainty:** None. Every correction below reuses an owner that already governs the property.

## Design decision

Give the upsell region **one owner**. A single `CompleteMealSection` component renders the title, the
responsive grid, the item card and the add control, and it is used on the product page, the cart and the
checkout. The component takes its title from the admin-governed `useHomepage().completeMealTitle` and takes
its item list from the admin-configured categories, so each surface keeps control of *which* sides it offers
while the *presentation* is identical everywhere.

The grid follows the pattern every other grid in the storefront already uses for this content — one column on
phones — so the product name is never truncated. The add control follows the design system's product-card
owner: a full-width shadcn `Button` at 44px with a label and the owner's `Adding…` / `Added!` states.

### Admin configuration

The region is fully configurable from `/admin/homepage`. The settings live in the existing free-form
`homepage` site-settings document, so no backend change is required.

| Setting | Type | Default | Controls |
|---------|------|---------|----------|
| `complete_meal_title` | string | `Complete Your Meal` | The heading |
| `complete_meal_categories` | csv | `garlic-bread,desserts,french-fries,drinks,beverages` | Which menu categories are offered |
| `complete_meal_limit` | number | `4` | How many items are shown (clamped 1–12) |
| `complete_meal_show_on_product` | boolean | `true` | Show on the product page |
| `complete_meal_show_on_cart` | boolean | `true` | Show on the cart page |
| `complete_meal_show_on_checkout` | boolean | `true` | Show at checkout |

Items already in the customer's cart are never offered, on any surface.


## Reuse

- **Card owner:** `frontend/src/components/shadcn-space/blocks/product-listing-01/product-card.tsx` — the one-line
  name clamp (`line-clamp-1`) and the add-control treatment (`Button`, `type="button"`, `w-full gap-2 h-11
  touch-target`, `Adding…` / `Added!` states, `hover:bg-brand-600 hover:text-white`).
- **Button owner:** `frontend/src/components/shadcn/button.tsx` (`variant="default"`, `size` variants).
- **Thumbnail owner:** `frontend/src/components/ItemThumb.tsx` — already renders a neutral tile when
  `src` is empty, so an item without an image does not produce a broken `<img>`.
- **Title owner:** `useHomepage().completeMealTitle` via `frontend/src/context/SiteSettingsContext.tsx`.
- **Cart owner:** `useCart()` — `addItem`, and `items` for excluding what is already in the cart.
- **Crust owner:** `useCrusts().defaultCrust` — the sides are added at `'regular'` with the default crust, as
  `Product.tsx:314` and `Cart.tsx:191` already do.
- **Toast owner:** `useToast().push` — the existing "Added {name} to cart" success toast.
- **Grid pattern owner:** `frontend/src/pages/Menu.tsx:435` and `frontend/src/pages/Cart.tsx:170`
  (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
- **Content rule owner:** the category list `['garlic-bread','desserts','french-fries','drinks','beverages']`
  and the four-item limit are duplicated verbatim at `Product.tsx:72-73` and `Cart.tsx:38`; move them into the
  shared component as its default.

## Changes

1. **New — `frontend/src/components/CompleteMealSection.tsx`**
   - **Change:** create the shared owner.
     - Props: `items?: MenuItem[]` (optional override of the pool), `className?: string`. The title is read
       from `useHomepage().completeMealTitle` — do not accept a title prop, so the title has exactly one source.
     - Item pool: the configured categories (`useHomepage().completeMealCategories`), excluding any item
       already in the cart (`useCart().items` matched on `menuItemId`), then `.slice(0, completeMealLimit)`.
       When `items` IS supplied it replaces the category filter but the cart exclusion and the limit still apply.
     - Layout: `<section>` with an `<h2>` heading (`font-heading font-bold text-xl sm:text-2xl`) followed by
       `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5`.
     - Card: white, `rounded-3xl`, the shadow already used by the current upsell cards
       (`shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]`), `overflow-hidden`,
       `flex flex-col`. Image via `<ItemThumb>` at `w-full h-40 sm:h-32 lg:h-28`. Body `p-3 flex flex-col flex-1`.
     - Name: `text-sm font-semibold text-zinc-900 leading-tight line-clamp-1` (the product-card owner's clamp).
     - Price: `text-sm font-bold text-zinc-900`.
     - Add control: the shadcn `Button` owner, `type="button"`, `w-full gap-2 h-11 mt-3 touch-target`, brand
       resting colour `bg-brand-600 text-white hover:bg-brand-700`, label `Add`, with the product-card owner's
       `Adding…` (spinner) and `Added!` (`Check` icon) states. `aria-label={`Add ${item.name} to cart`}`.
     - The whole item name links to `/r/menu/item/{id}` as the current cards do.
   - **Preserve:** the current brand-orange add affordance, the 44px minimum tap target (`touch-target`), the
     item name as the only text line, and the toast wording "Added {name} to cart".
   - **Verify:** `cd frontend && npm run build` succeeds; on `/r/menu/item/cheese-corn` at 390px no product name
     is truncated; every add control has `type="button"`.

2. **`frontend/src/pages/Product.tsx`** — replace the inline region
   - **Change:** delete the inline section at lines 292–325 and render
     `{hp.completeMealShowOnProduct && <CompleteMealSection className="mt-12 pb-8" />}` in its place. Delete the
     local `sides` derivation (lines 71–73) — the shared component owns the category rule, so the admin
     configuration applies here too. Remove the now-unused `ItemThumb` and `MenuItem` imports.
   - **Preserve:** the section's position between the product detail block and the sticky mobile action bar, the
     `hp.completeMealTitle` heading text, and the sides' order.
   - **Verify:** `/r/menu/item/cheese-corn` renders the region with the same four sides; the sticky mobile action
     bar below it is unchanged.

3. **`frontend/src/pages/Cart.tsx`** — replace the divergent copy
   - **Change:** delete the inline section at lines 166–200 and render
     `{hp.completeMealShowOnCart && <CompleteMealSection className="mt-10" />}` in its place. The hardcoded
     heading "Goes great with your order" (line 169) goes away — the heading becomes the admin-governed
     `hp.completeMealTitle`, so an admin rename now applies consistently across the storefront. The
     `suggestions` derivation (lines 36–39) is replaced by the shared component's rule. Remove the now-unused
     `useCrusts`, `useMenuItems`, `defaultCrust`, `menuItems` and `addItem` bindings.
   - **Preserve:** the region's position above the "Add more items" CTA, the four-item limit, the exclusion of
     items already in the cart, and the "Add more items" link.
   - **Verify:** `/r/cart` shows the region with the admin title; the items offered are still sides and not
     already in the cart.

4. **`frontend/src/pages/Checkout.tsx`** — add the region
   - **Change:** render `{hp.completeMealShowOnCheckout && <CompleteMealSection className="mt-8" />}` inside the
     form column, after the closing `</fieldset>` at line 414 and before the closing `</form>` at line 415. The
     grid children are the `<form>` (`lg:col-span-2`) and the `<aside>` (`lg:col-span-1`); adding a third
     child to that grid would break the two-column layout, so the region must live inside the form column.
     **The add control inside the form must keep `type="button"`** or it will submit the order. The page already
     early-returns the empty-cart state at line 90, so the region only appears once the cart has items.
   - **Preserve:** the form's `space-y-6` rhythm, the "Place Order · ₹{subtotal}" button and its position, the
     sticky Order Summary, and the mobile sticky checkout bar (`pb-32 lg:pb-8` on the page container already
     clears it).
   - **Verify:** on `/r/checkout` with an item in the cart the region renders below the payment method block;
     adding a side from it updates the Order Summary and the "Place Order · ₹{subtotal}" total without
     submitting the order or reloading the page; at 390px the region does not sit under the fixed bottom bar.

5. **`frontend/src/context/SiteSettingsContext.tsx`** — resolve the new settings
   - **Change:** add `complete_meal_categories`, `complete_meal_limit`, `complete_meal_show_on_product`,
     `complete_meal_show_on_cart` and `complete_meal_show_on_checkout` to the `HomepageSettings` interface and
     to `HOMEPAGE_DEFAULTS`. Export `DEFAULT_COMPLETE_MEAL_CATEGORIES` and add two parsers: one that splits the
     admin's comma separated category list (falling back to the default when empty), and one that clamps the
     item count to 1–12 (falling back to 4). Expose `completeMealCategories: string[]`,
     `completeMealLimit: number` and the three booleans from `useHomepage()`. The visibility flags default to
     `true` when the key is absent, so a site that has never saved the settings still shows the region.
   - **Preserve:** `completeMealTitle` and every other resolved field.
   - **Verify:** a storefront with no stored homepage settings still shows the region with four sides.

6. **`frontend/src/pages/AdminHomepage.tsx`** — the configuration UI
   - **Change:** add a "Complete Meal Upsell" card to the left column below "Page Content", holding the section
     title (text input), the menu categories offered (comma separated text input with helper text), how many
     items to show (number input, clamped 1–12) and a "Show On" fieldset with a checkbox per surface (product
     page, cart page, checkout page). Remove `complete_meal_title` from the generic field list — it moves into
     this card. Widen `update()` so it accepts `string | number | boolean`; it still parses the `promos` JSON
     string as before.
   - **Preserve:** the existing fields, the save flow, and the "Actions" card.
   - **Verify:** saving the card changes the storefront without a redeploy; unchecking a surface hides the region
     there.

7. **Documentation**
   - **Change:** record the new owner in `frontend/src/design-system.md` — add `CompleteMealSection` to the
     component inventory with its file path, the title source, the responsive grid, the add control and the
     `type="button"` requirement, plus the six admin settings and their defaults.
   - **Preserve:** the existing document structure and tone.
   - **Verify:** the new entry names the same file path that exists after change 1.

## Scope

- **Inherit:** the storefront brand tokens (`--color-brand-*` in `frontend/src/index.css`), the shadcn `Button`
  and `ItemThumb` owners, `useCart()`, `useHomepage()`, `useCrusts()` and `useToast()`. Every surface that
  already renders a product card keeps using `product-card.tsx` unchanged.
- **Verify:** `/r/menu/item/:id`, `/r/cart` and `/r/checkout` at 390px, 768px and 1440px; the admin homepage
  settings `complete_meal_title`, `complete_meal_categories`, `complete_meal_limit` and the three
  `complete_meal_show_on_*` flags take effect on all three surfaces without a redeploy.
- **Exclude:** the admin panel pages other than `/admin/homepage`, the POS interface (`/pos`), the WhatsApp bot,
  the receipt renderers and the menu grid's own `ProductCard` — none of them participate in this surface. Also
  excluded: `design-plans/homepage-secondary-color.md`, which governs the homepage surface and explicitly
  excludes the checkout flow.

## Validation

- **Product:** on a phone the customer can read every side name and tell the four garlic breads apart; the add
  control looks and behaves the same wherever the region appears; the checkout offers sides before the order is
  placed, and adding one updates the running total; an administrator can change the heading, the categories
  offered, how many are shown and which pages show it.
- **Interface:** `/r/menu/item/:id`, `/r/cart` and `/r/checkout` at 390px, 768px and 1440px. No product name
  truncated in the upsell region at 390px. The checkout region clears the fixed mobile checkout bar. Adding a
  side never submits the checkout form.
- **System:** one owner for the region, reusing the existing product-card add-control treatment, the existing
  `ItemThumb`, the existing `Button` and the existing admin title setting. No new colour, spacing or radius
  values are introduced. No backend change: the settings live in the existing free-form `homepage` site-settings
  document.
- **Repository:** `cd frontend && npm run build` completes with zero errors; `cd frontend && npx tsc --noEmit`
  reports no type errors; `git diff --stat` shows changes limited to the files listed above plus the
  documentation file.

## Stop conditions

- Stop if `useHomepage().completeMealTitle` stops resolving to a string, or the admin homepage setting is
  removed — the region has no other title source.
- Stop if the shadcn `Button` owner's `h-11` / `touch-target` treatment is changed elsewhere in the same
  change set; re-read `product-card.tsx` before copying the class names.
- Stop if the checkout form is restructured so that the region would become a third child of the
  `grid lg:grid-cols-3` container — the region must stay inside the `lg:col-span-2` column.
- Stop if the shared component cannot be made to render `type="button"` on its add control; the region must
  never be able to submit the checkout form.
