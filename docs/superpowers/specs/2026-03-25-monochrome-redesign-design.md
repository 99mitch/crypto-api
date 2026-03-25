# Monochrome UI Redesign — Design Spec

## Goal

Replace the current blue-tinted gray + emerald-green palette with a neutral zinc-based monochrome theme. All decorative colour is removed; only functional rose colour (errors, destructive actions) is kept.

## Design Decisions

**Direction:** Refined Dark — deep charcoal background, slightly lighter cards, warm off-white text.

**CTA treatment:** White Outline — primary buttons use a white outline that inverts to white fill on hover; active nav item shown with a left white border and bright text.

---

## General Rule

**Replace every `gray-{n}` class with `zinc-{n}` (same shade number).** This applies across all files listed below. The zinc palette is a neutral warm-dark grey vs. the blue-tinted `gray-*`. Examples:

- `bg-gray-950` → `bg-zinc-950`
- `bg-gray-900` → `bg-zinc-900`
- `bg-gray-800` → `bg-zinc-800`
- `bg-gray-700` → `bg-zinc-700`
- `text-gray-100` → `text-zinc-100`
- `text-gray-200` → `text-zinc-200`
- `text-gray-300` → `text-zinc-300`
- `text-gray-400` → `text-zinc-400`
- `text-gray-500` → `text-zinc-500`
- `text-gray-600` → `text-zinc-600`
- `border-gray-800` → `border-zinc-800`
- `border-gray-700` → `border-zinc-700`
- `divide-gray-800` → `divide-zinc-800`
- `hover:bg-gray-800` → `hover:bg-zinc-800`
- `hover:bg-gray-700` → `hover:bg-zinc-700`
- `hover:bg-gray-800/50` → `hover:bg-zinc-800/50`
- `hover:bg-gray-800/40` → `hover:bg-zinc-800/40`
- Any `/opacity` modifier variants: same rule applies (`bg-gray-900/40` → `bg-zinc-900/40`)

Apply this mechanical substitution first, then apply the specific overrides below.

---

## Colour Palette Reference

| Role | Class | Hex |
|------|-------|-----|
| Page background | `bg-zinc-950` | #09090b |
| Card / panel background | `bg-zinc-900` | #18181b |
| Elevated (inputs, icon containers, skeleton) | `bg-zinc-800` | #27272a |
| Borders | `border-zinc-800` | #27272a |
| Subtle borders | `border-zinc-700` | #3f3f46 |
| Text — primary | `text-zinc-100` | #f4f4f5 |
| Text — secondary | `text-zinc-300` | #d4d4d8 |
| Text — muted | `text-zinc-400` | #a1a1aa |
| Text — very muted | `text-zinc-500` | #71717a |
| Text — placeholder | `text-zinc-600` | #52525b |

**Retained functional colour:** `rose-*` for error messages, error toasts, failed-state badges, destructive buttons.

---

## Specific Overrides (non-gray colour replacements)

### 1. `dashboard/src/constants/index.js` — STATUS_COLORS and LEVEL_COLORS

The current palette uses `emerald-*`, `yellow-*`, `blue-*`, `red-*` — all replaced with zinc/rose. Borders are embedded in the `bg` string so `StatusBadge.jsx` needs no structural change.

**STATUS_COLORS replacement:**

```js
export const STATUS_COLORS = {
  swept:      { bg: 'bg-zinc-100',                          text: 'text-zinc-900', dot: 'bg-zinc-900' },
  confirmed:  { bg: 'bg-zinc-800 border border-zinc-700',   text: 'text-zinc-200', dot: 'bg-zinc-200' },
  confirming: { bg: 'bg-zinc-800 border border-zinc-700',   text: 'text-zinc-300', dot: 'bg-zinc-400' },
  pending:    { bg: 'bg-zinc-900 border border-zinc-700',   text: 'text-zinc-400', dot: 'bg-zinc-500' },
  expired:    { bg: 'bg-zinc-900 border border-zinc-800',   text: 'text-zinc-500', dot: 'bg-zinc-600' },
  failed:     { bg: 'bg-rose-950 border border-rose-900',   text: 'text-rose-400', dot: 'bg-rose-500' },
}
```

**LEVEL_COLORS replacement:**

```js
export const LEVEL_COLORS = {
  error: { bg: 'bg-rose-950 border border-rose-900', text: 'text-rose-400' },
  warn:  { bg: 'bg-zinc-800 border border-zinc-700', text: 'text-zinc-300' },
  info:  { bg: 'bg-zinc-900 border border-zinc-800', text: 'text-zinc-400' },
  debug: { bg: 'bg-zinc-900 border border-zinc-800', text: 'text-zinc-600' },
}
```

### 2. Sidebar — active nav item and logo

Apply the general gray→zinc rule, then replace:
- Logo `<Zap>` icon: `text-emerald-400` → `text-zinc-100`
- **Active nav item** (was `bg-emerald-900/40 text-emerald-400 font-medium`):
  ```
  border-l-2 border-zinc-100 pl-[10px] text-zinc-100 font-medium bg-zinc-800/50
  ```
  The base class string (`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors`) applies to both active and inactive items. For the active state, `px-3` must be replaced by `pl-[10px]` (2px border + 10px = 12px, matching the inactive left padding). `rounded-lg` is kept on both states.
- Inactive nav item: `text-gray-400 hover:text-gray-100 hover:bg-gray-800` → apply general rule

### 3. StatCard — accent variant

Apply the general gray→zinc rule, then replace:
- Accent card border: `border-emerald-800` → `border-zinc-100`
- Accent card value: `text-emerald-400` → `text-zinc-100`

### 4. Primary Button — New Payment, Create Payment, Sign In

Replace every primary action button (currently `bg-emerald-600 hover:bg-emerald-500 text-white`) with:
```
border border-zinc-100 text-zinc-100 rounded-lg hover:bg-zinc-100 hover:text-zinc-950 transition-colors
```

Replace `text-white` with `text-zinc-100` — do not leave `text-white` in place.

For the **Sign In** button, which is full-width with `disabled:opacity-50 disabled:cursor-not-allowed`, keep those modifier classes and change only the bg/text/hover. The `disabled` attribute suppresses hover in browsers, so `hover:bg-zinc-100 hover:text-zinc-950` will not trigger on a disabled button.

### 5. Login page — logo container and input focus ring

- Logo icon container: `bg-emerald-900/40` → `bg-zinc-800/50`
- Logo `<Zap>` icon: `text-emerald-400` → `text-zinc-100`
- Input `focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600` → `focus:border-zinc-400` (remove the `focus:ring-*` classes entirely)

### 6. Input fields / filter selects / date inputs — focus colour

All inputs with `focus:border-emerald-600` → `focus:border-zinc-400`. Files affected: `Login.jsx`, `Payments.jsx`, `AuditLogs.jsx`, `CreatePaymentModal.jsx`.

In `AuditLogs.jsx` the class string is stored in the `FILTER_CLS` constant (line 10) — update that constant, not individual elements.

### 7. Charts — inline styles (Recharts props, not Tailwind classes)

These are JS values passed to Recharts components, not Tailwind class strings:

```js
// <Bar> fill
fill="#d4d4d8"   // zinc-300 (was "#10b981" emerald)

// <XAxis> and <YAxis> tick — update BOTH props
tick={{ fill: '#71717a', fontSize: 11 }}  // zinc-500 (was '#9ca3af' gray-400)

// <Tooltip> contentStyle
contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
// zinc-900 bg, zinc-800 border (was gray-900 / gray-800)

// <Tooltip> labelStyle
labelStyle={{ color: '#f4f4f5' }}  // zinc-100 (upgraded from gray-200 to zinc-100 for better contrast)
```

The "Live" pulse dot: `bg-emerald-400` → `bg-zinc-100`.

### 8. Status distribution progress bars (Dashboard.jsx)

The progress bar fill uses `colors.dot` from `STATUS_COLORS`. After the constants update, this will automatically use the zinc dots defined in item 1 above — no additional change needed in Dashboard.jsx.

The progress bar track: apply general rule (`bg-gray-800` → `bg-zinc-800`).

### 9. AuditTimeline — emerald toggle link

```jsx
// was:
className="text-xs text-emerald-400 hover:text-emerald-300 mt-2 transition-colors"
// becomes:
className="text-xs text-zinc-300 hover:text-zinc-100 mt-2 transition-colors"
```

### 10. AuditLogs — paymentId link in table

```jsx
// was:
className="text-emerald-400 hover:text-emerald-300 font-mono text-xs transition-colors"
// becomes:
className="text-zinc-300 hover:text-zinc-100 font-mono text-xs transition-colors"
```

### 11. PaymentDetail — success Toast

```jsx
// was:
'bg-emerald-900 text-emerald-100 border border-emerald-700'
// becomes:
'bg-zinc-800 text-zinc-100 border border-zinc-700'
```

Error Toast (rose): no change.

### 12. CreatePaymentModal — submit button

Apply Primary Button spec (item 4) for the submit button. The modal card background follows the General Rule: `bg-gray-900` → `bg-zinc-900` (card = zinc-900, not zinc-950). Inputs follow the Input Fields spec.

---

## Files to Modify

| File | Primary changes |
|------|----------------|
| `dashboard/src/constants/index.js` | Full `STATUS_COLORS` and `LEVEL_COLORS` replacement (see item 1) |
| `dashboard/src/App.jsx` | gray→zinc (wrapper, mobile top bar) |
| `dashboard/src/components/Sidebar.jsx` | gray→zinc + logo icon + active nav style (items 2) |
| `dashboard/src/components/StatCard.jsx` | gray→zinc + accent border/text (item 3) |
| `dashboard/src/components/Pagination.jsx` | gray→zinc |
| `dashboard/src/components/AuditTimeline.jsx` | gray→zinc + emerald toggle link (item 9) |
| `dashboard/src/components/CreatePaymentModal.jsx` | gray→zinc + primary button + input focus (items 4, 6, 12) |
| `dashboard/src/pages/Login.jsx` | gray→zinc + logo container + icon + input + button (items 4, 5, 6) |
| `dashboard/src/pages/Dashboard.jsx` | gray→zinc + chart inline styles + live dot (items 7, 8) |
| `dashboard/src/pages/Payments.jsx` | gray→zinc + primary button + filter focus (items 4, 6) |
| `dashboard/src/pages/PaymentDetail.jsx` | gray→zinc throughout (all shades including -200) + success Toast (item 11) |
| `dashboard/src/pages/AuditLogs.jsx` | gray→zinc + `FILTER_CLS` constant + paymentId link (items 6, 10) |

---

## Out of Scope

- No changes to backend / API
- No layout restructuring — spacing, grid, and component hierarchy are unchanged
- No typography changes
- No animation additions beyond existing transitions
- `StatusBadge.jsx` — no structural change; colours come entirely from constants
- Retry Sweep button in `PaymentDetail.jsx` — rose styling kept as-is, no change
