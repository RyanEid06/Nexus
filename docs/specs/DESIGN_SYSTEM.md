# Locked Visual System

**Source of truth:** `docs/design/NEXUS_FINAL_UI_REFERENCE.png`, corrected by `docs/design/REFERENCE_NOTES.md` where browser/product reality conflicts with the concept image.

## Direction

Professional modern developer tool. Dark, high-contrast, minimal. Purple is the primary brand/root accent; restrained secondary cluster colors support information hierarchy. Glow is used only to establish selection/focus, not on every card/button.

## Core palette

- Background: `#0B0B12`
- Surface: `#11121B`
- Elevated surface: `#1A1B26`
- Primary purple: `#8B5CF6`
- Accent indigo: `#6366F1`
- Text primary: `#E5E7EB`
- Text secondary: `#9CA3AF`
- Border: `#262738`
- Success: `#10B981`
- Warning: `#F59E0B`
- Error: `#EF4444`

## Typography

Use Inter or a similarly neutral modern sans. Technical values may use a restrained monospace. Do not use novelty sci-fi fonts.

## UI rules

- Compact desktop density; not oversized mobile cards.
- 6–12 px corner radii; avoid pill-shaped everything.
- Thin borders and subtle elevation.
- One clear primary action per state.
- Side navigation becomes meaningful project context/explorer while a project is active.
- Graph takes visual priority when exploring.
- Use color to encode meaning, not decoration.
- Keep labels readable; no haze over text.
- Avoid giant gradients, cyan-neon default styling, fake glass panels, and excessive blur.
- Do not render fake OS window controls inside normal browser UI.
- Dead controls are not visual placeholders: remove or explicitly disable them.

## Graph rules

- Root project node is visually dominant and brand-purple.
- Top-level project areas receive deterministic colors from a restrained palette; the same unchanged path should keep its color between sessions.
- Folders form clear clusters/hubs.
- Files are smaller and reveal progressively.
- Selected/focused node may glow; ordinary nodes remain quieter.
- Hierarchy connections remain legible against the background.
- Labels are sparse: root, top-level clusters, selected/hovered/contextual nodes—not hundreds at once.
- The graph should feel like an engineered visualization, not a galaxy or solar system.
