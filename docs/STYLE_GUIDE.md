# True Sciences Affiliate Platform — Style Guide

Light-mode dashboard design system derived from [true-sciences.com](https://true-sciences.com/) branding. The consumer site uses a dark navy “starry” marketing shell; this portal inverts that into a **clean, readable admin UI** while keeping TS navy + Inter typography.

---

## Brand essence

| Attribute | Direction |
|-----------|-----------|
| Tone | Clinical, trustworthy, premium research |
| UI mode | **Light** — white cards on cool gray canvas |
| Density | Comfortable dashboard spacing, not marketing-hero airy |
| Data focus | Tables, summaries, status badges — scannable at a glance |

**Tagline reference:** *Premium Research · Simple Pricing* — use sparingly in nav/footer, not in data tables.

---

## Color palette

### Navy (primary brand)

Sourced from TS `redesign.css` brand tokens. Use for nav accents, primary buttons, links, focus rings.

| Token | Hex | Usage |
|-------|-----|--------|
| Brand | `#002c50` | Primary button, active nav, links |
| Brand dark | `#001830` | Headings emphasis, logo lockup |
| Brand mid | `#003868` | Button hover, chart accents |
| Brand deep | `#084878` | Optional gradient stops |
| Brand light | `#4888b8` | Subtle highlights, chart secondary |

**HSL (Tailwind `primary`):** `215 50% 25%`  
**HSL deep:** `215 58% 14%`

### Neutrals (light dashboard)

Sourced from TS `global-base.css` light tokens.

| Token | HSL | Hex approx | Usage |
|-------|-----|------------|--------|
| Background | `220 18% 97%` | `#f5f6f8` | Page canvas |
| Surface 2 | `220 16% 94%` | `#ecedf1` | Table hover, tab rail |
| Card | `0 0% 100%` | `#ffffff` | Cards, header, inputs |
| Foreground | `222 32% 12%` | `#151c28` | Body text |
| Muted foreground | `220 10% 38%` | `#575f6e` | Labels, descriptions |
| Border | `220 14% 86%` | `#d5d9e0` | Dividers, input borders |

### Semantic

| Token | HSL | Usage |
|-------|-----|--------|
| Success | `158 42% 42%` | Paid totals, positive amounts, success toasts |
| Warning | `38 92% 50%` | Pending commission status |
| Destructive | `0 72% 50%` | Errors, rejected status |
| Info | `215 50% 25%` | Same as primary — unpaid/info states |

### Do / Don't

- **Do** use navy for actions and navigation.
- **Do** use success green only for money paid / positive confirmation.
- **Don't** use the marketing starry gradient as page background.
- **Don't** use pure black `#000` — use `foreground` instead.

---

## Typography

### Fonts

| Role | Family | Source |
|------|--------|--------|
| UI & body | **Inter** | Same as TS site (`global-base.css`) |
| Display (optional) | Barlow Condensed | Marketing only — skip in dashboard |

Load Inter via `next/font/google`, weights 400–700.

### Scale (dashboard)

| Name | Size | Weight | Use |
|------|------|--------|-----|
| Page title | `1.5rem` / 24px | 600 | `h1` — Dashboard, Admin |
| Section title | `1.125rem` / 18px | 600 | Card titles |
| Body | `1rem` / 16px | 400 | Default copy |
| Small | `0.875rem` / 14px | 400 | Descriptions, table cells |
| Caption | `0.75rem` / 12px | 500 | Badges, meta |

### Rules

- **Letter-spacing:** `-0.02em` on page titles only (TS heading feel, toned down).
- **Line-height:** 1.5 body, 1.25 headings.
- **Monospace:** Use system mono for order IDs / SliceWP IDs if needed.

---

## Spacing & layout

| Token | Value | Use |
|-------|-------|-----|
| Container max | `1280px` (`max-w-7xl`) | Main content |
| Page padding | `1rem` mobile / `2rem` desktop | `px-4 py-8` |
| Card padding | `1.5rem` | Card header/content |
| Section gap | `1.5rem` (`space-y-6`) | Between dashboard blocks |
| Radius sm | `0.375rem` (6px) | Buttons, inputs, badges |
| Radius md | `0.75rem` (12px) | Cards |
| Radius lg | `1.25rem` (20px) | Marketing parity — optional hero cards |

---

## Components

### Header / Nav

- White background, bottom border `border`
- Product name: semibold foreground; subtitle: muted, small
- Active link: `bg-primary/10 text-primary`
- Inactive: `text-muted-foreground hover:bg-muted hover:text-foreground`

### Cards

```
bg-card border border-border rounded-xl shadow-sm
Title: text-lg font-semibold
Description: text-sm text-muted-foreground
```

### Buttons

| Variant | Style |
|---------|--------|
| Primary | Navy fill, white text, hover slightly lighter |
| Outline | White bg, border, hover muted fill |
| Ghost | Transparent, hover muted |
| Destructive | Red — payout mistakes, delete rules (future) |

### Tables

- Header row: muted text, medium weight, border-bottom
- Body: 14px, row hover `bg-muted/60`
- Right-align currency columns
- Sticky header on long ledger views (future)

### Badges (commission status)

| Status | Style |
|--------|--------|
| Paid | Success tint bg + success text |
| Unpaid | Primary tint bg + primary text |
| Pending | Warning tint bg + amber text |
| Rejected | Destructive tint |

### Forms

- Inputs: white bg, border, focus ring primary
- Labels: medium weight, foreground
- Helper text: muted, 14px
- Native `<select>`: match Input height/border (use `.select-field` utility)

### Tabs

- Rail: `bg-muted` rounded-lg
- Active tab: white card shadow, foreground text
- Inactive: muted text

---

## Data visualization (future)

- Primary series: `#002c50`
- Secondary: `#4888b8`
- Positive: success green
- Grid lines: `border` color at 50% opacity
- Prefer simple bar/line — no starry backgrounds

---

## Logo & wordmark

Until a dedicated logo asset is added:

- **Wordmark:** “True Sciences” semibold + “Affiliate Platform” muted caption
- **Color:** Brand dark `#001830` on light backgrounds

---

## Accessibility

- Contrast: navy on white and foreground on background meet WCAG AA
- Focus: 2px ring `ring-primary ring-offset-2`
- Touch targets: min 44px height on mobile nav/buttons
- Don't rely on color alone for status — badges include text labels

---

## CSS implementation

Design tokens live in `app/globals.css` as HSL variables. Tailwind maps them in `tailwind.config.ts`:

```css
--background: 220 18% 97%;
--foreground: 222 32% 12%;
--primary: 215 50% 25%;
--success: 158 42% 42%;
/* … */
```

Use semantic classes: `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, `text-success`.

---

## Reference files (TS site)

| File | Contents |
|------|----------|
| `global-base.css` | Light mode HSL tokens, Inter stack |
| `redesign.css` | Navy brand hex values, marketing typography |
| `fonts.css` | Inter + Barlow Condensed |

---

## Changelog

| Date | Notes |
|------|-------|
| 2026-07-18 | Initial light dashboard guide; migrated app from dark zinc/emerald to TS navy tokens |
