# Final UI Reference Notes

`NEXUS_FINAL_UI_REFERENCE.png` is the product owner's final pick and is locked as the **visual direction**, not as a literal claim about browser capabilities.

## Preserve

- Obsidian-black background and slightly lighter panel surfaces.
- Purple primary accent with restrained indigo/secondary cluster colors.
- Clean white/gray typography.
- Compact desktop-first information density.
- Stable project navigation on the left.
- Main graph is spacious and central.
- Inspector/details live beside the graph rather than replacing it.
- Analytics use conventional readable cards/charts.
- Minimal glow only around important graph nodes and active controls.
- No cyan-dominant AI aesthetic, fake glass, or gaming/HUD styling.

## Do NOT copy literally from the concept image

The reference is a design concept. These visual details are not product requirements:

1. **Absolute local path text** such as `C:\\Users\\...`. A normal browser directory handle does not expose the user's absolute filesystem path. Show the project/folder name or a relative path only.
2. **Exact disk sizes for ignored directories** such as `node_modules 2.4 GB`. NEXUS must not recursively traverse excluded folders merely to reproduce vanity statistics. Show `excluded` instead.
3. **Fake desktop window controls** (`— □ ×`). Do not place fake minimize/maximize/close buttons inside the website. Browser/OS chrome owns those controls unless a future installed-PWA window-controls feature is deliberately implemented.
4. **Any control shown in the image that has no implementation yet.** A visible button must work, be explicitly disabled with a reason, or be omitted.

When the scaffold and the reference conflict, preserve the product/engineering boundaries but prefer the reference's information hierarchy and restraint.
