# Design Tokens — PreBoard

## Light Theme (app shell, prep surfaces)
- `--bg`: #f9fafb (gray-50), `--surface`: #ffffff, `--border`: #e5e7eb (gray-200)
- `--ink`: #111827 (gray-900), `--ink-soft`: #6b7280 (gray-500), `--ink-mute`: #9ca3af (gray-400)
- `--accent`: #059669 (emerald-600), `--accent-hover`: #10b981 (emerald-500)
- `--danger`: #dc2626, `--warning`: #f59e0b

## Meeting Room Dark Theme
- `--room-bg`: #111827 (gray-900), `--room-surface`: #1f2937 (gray-800)
- `--room-border`: #374151 (gray-700), `--room-ink`: #f9fafb, `--room-muted`: #9ca3af
- `--phase-badge-bg`: rgba(16,185,129,0.2), `--phase-badge-text`: #6ee7b7
- `--speaker-ring`: #10b981, `--seat-selected`: rgba(16,185,129,0.1)

## Type Scale (system stack: -apple-system, Inter, sans-serif)
- Display: 24px/700, Page: 20px/600, Section: 14px/500, Body: 14px/400, Caption: 12px/400
- Monospace (persona prompts): 13px, ui-monospace

## Spacing, Radii, Shadows
- Radii: sm 6px, md 8px, lg 12px, xl 16px
- Shadow-card: 0 1px 3px rgba(0,0,0,0.06), Shadow-modal: 0 20px 60px rgba(0,0,0,0.3)
- Grid gap: 12-16px, Section gap: 24-32px, Page pad: 24px (sm) / 32px (lg)

## White-Label CSS Variables (operator-configurable)
- `--brand-accent`, `--brand-logo-url`, `--brand-name` (not yet implemented)
