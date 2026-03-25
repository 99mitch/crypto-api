# Monochrome UI Redesign — Design Spec

## Goal

Replace the current blue-tinted gray + emerald-green palette with a neutral zinc-based monochrome theme. All decorative colour is removed; only functional colour (rose for errors/destructive actions) remains.

## Design Decisions

**Direction:** Refined Dark — deep charcoal background, slightly lighter cards, warm off-white text.

**CTA treatment:** White Outline — primary buttons use a white outline that inverts to white fill on hover; active nav item shown with a left white border and bright text.

---

## Colour Palette

Switching from Tailwind `gray-*` (blue-tinted) to `zinc-*` (neutral warm-dark) throughout.

| Role | Tailwind class | Hex |
|------|---------------|-----|
| Page background | `bg-zinc-950` | #09090b |
| Card / panel background | `bg-zinc-900` | #18181b |
| Elevated (inputs, icon containers) | `bg-zinc-800` | #27272a |
| Borders | `border-zinc-800` | #27272a |
| Subtle borders | `border-zinc-700` | #3f3f46 |
| Text — primary | `text-zinc-100` | #f4f4f5 |
| Text — secondary | `text-zinc-300` | #d4d4d8 |
| Text — muted | `text-zinc-400` | #a1a1aa |
| Text — very muted | `text-zinc-500` | #71717a |
| Text — placeholder | `text-zinc-600` | #52525b |

**Retained functional colour:**
- `rose-*` — error messages, error toasts, failed-state destructive buttons (Retry Sweep)

---

## Component Specs

### Sidebar

- Background: `bg-zinc-950` with `border-r border-zinc-800`
- Logo icon (`Zap`): `text-zinc-100` (was `text-emerald-400`)
- **Active nav item:** `border-l-2 border-zinc-100 pl-[10px] text-zinc-100 font-medium` with `bg-zinc-800/50`
- **Inactive nav item:** `text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50`
- Logout button: `text-zinc-500 hover:text-rose-400 hover:bg-zinc-800`

### StatCard

- Background: `bg-zinc-900 border border-zinc-800`
- **Accent card** (Total Revenue): border `border-zinc-100`, value `text-zinc-100` (was emerald)
- Non-accent cards: value `text-zinc-100`
- Subtitle: `text-zinc-500`
- Icon container: `bg-zinc-800`, icon `text-zinc-400`

### Primary Button (New Payment, Create Payment, etc.)

```
border border-zinc-100 text-zinc-100 rounded-lg
hover:bg-zinc-100 hover:text-zinc-950
transition-colors
```

### Secondary / Cancel Button

```
bg-zinc-800 text-zinc-400 rounded-lg
hover:bg-zinc-700
```

### Destructive Button (Retry Sweep)

Keep existing rose styling — `bg-rose-900 hover:bg-rose-800 text-rose-100 border border-rose-800`.

### Input Fields

```
bg-zinc-800 border border-zinc-700 text-zinc-100
placeholder:text-zinc-600
focus:outline-none focus:border-zinc-400
```

### StatusBadge — Status colours (monochrome hierarchy)

| Status | Classes |
|--------|---------|
| `swept` | `bg-zinc-100 text-zinc-900` — inverted, brightest (signals completion) |
| `confirmed` | `bg-zinc-800 text-zinc-200 border border-zinc-700` |
| `confirming` | `bg-zinc-800 text-zinc-300 border border-zinc-700` |
| `pending` | `bg-zinc-900 text-zinc-400 border border-zinc-700` |
| `expired` | `bg-zinc-900 text-zinc-500 border border-zinc-800` |
| `failed` | `bg-rose-950 text-rose-400 border border-rose-900` — kept functional red |

Dot colours follow the same hierarchy (zinc-100 → zinc-300 → zinc-500 for swept/confirmed/pending etc.)

### StatusBadge — Level colours (audit log levels)

| Level | Classes |
|-------|---------|
| `error` | `bg-rose-950 text-rose-400 border border-rose-900` |
| `warn` | `bg-zinc-800 text-zinc-300 border border-zinc-700` |
| `info` | `bg-zinc-900 text-zinc-400 border border-zinc-800` |
| `debug` | `bg-zinc-900 text-zinc-600 border border-zinc-800` |

### Charts (Dashboard)

- Revenue bar chart: `fill="#d4d4d8"` (zinc-300)
- Bar chart tooltip: `background: #18181b`, `border: 1px solid #27272a`
- Axis tick colour: `#71717a` (zinc-500)
- Status distribution progress bars: fill matches status hierarchy above — zinc-100 for swept, grading down to zinc-700 for expired
- "Live" pulse dot: `bg-zinc-100` (was `bg-emerald-400`)

### Toast

- Success: `bg-zinc-800 text-zinc-100 border border-zinc-700` (remove emerald)
- Error: keep `bg-rose-900 text-rose-100 border border-rose-700`

---

## Files to Modify

| File | Change |
|------|--------|
| `dashboard/src/constants.js` | Replace `STATUS_COLORS` and `LEVEL_COLORS` with zinc-based palette |
| `dashboard/src/components/Sidebar.jsx` | Logo icon colour, nav active/inactive styles |
| `dashboard/src/components/StatCard.jsx` | Accent border/text, icon container bg |
| `dashboard/src/components/StatusBadge.jsx` | No structural change — colours come from constants |
| `dashboard/src/pages/Dashboard.jsx` | Chart bar fill, tooltip style, live dot |
| `dashboard/src/pages/Payments.jsx` | New Payment button style |
| `dashboard/src/pages/PaymentDetail.jsx` | Retry Sweep button (already rose — keep), Toast (success variant) |
| `dashboard/src/pages/Login.jsx` | Button, input, focus styles |
| `dashboard/src/pages/AuditLogs.jsx` | Filter input styles, pagination button styles |
| `dashboard/src/components/CreatePaymentModal.jsx` | Backdrop, card, button, input, error styles |
| `dashboard/src/App.jsx` | Layout wrapper background |

---

## Out of Scope

- No changes to backend / API
- No layout restructuring — spacing, grid, and component hierarchy are unchanged
- No typography changes — system-ui stack is kept
- No animation additions beyond existing transitions
