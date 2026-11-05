# NEXUS V1 — Release Notes & Validation Boundaries

## Completed V1 Scope

- **Milestone 1**: Core desktop architecture, obsidian/purple design, local File System Access, IndexedDB cache, safe folder traversal, and metrics.
- **Milestone 2**: Incremental refresh engine, fingerprint-based unchanged file reuse, handle reconnection lifecycle, and fatal root access handling.
- **Milestone 3**: Virtualized structure explorer with windowed row rendering, deep expand/collapse, and full keyboard arrow navigation.
- **Milestone 4**: Production TypeScript/JavaScript dependency extraction, alias/index resolution, external package grouping, circular dependency cycle detection, and shortest-path routing.
- **PWA & Production Packaging**: Offline service worker caching, PWA icons, security headers (`public/_headers`), zero backend/secrets requirements, and Cloudflare Pages deployment readiness.

---

## Known Boundaries & Browser Environment Constraints

1. **Chromium Desktop Requirement for Direct File Access**:
   - The File System Access API (`window.showDirectoryPicker`) is currently a Chromium standard implemented by Google Chrome, Microsoft Edge, Brave, and Opera on desktop.
   - On Firefox and Safari, direct local folder picking is unsupported by the browser engine. NEXUS detects this via `supportsLocalDirectoryPicker()` and renders an informational alert banner; users on these browsers can still explore the preloaded **Curated Demo** and inspect previously saved offline indexes.

2. **Dynamic / Non-Standard Module Specifiers**:
   - The dependency parser extracts static ESM imports, dynamic `import()`, CommonJS `require()`, and re-exports.
   - Runtime dynamic expressions (e.g., `import('./locales/' + lang)`) or custom bundler loader query strings (e.g., `import x from './file?raw'`) are safely captured as unresolved or dynamic imports without inventing fictitious dependency edges.

3. **Client-Only Environmental Boundary**:
   - Real top-level user gesture prompts for folder selection (`showDirectoryPicker`) and browser permission dialogues (`handle.requestPermission`) require a live Chromium desktop session. In automated build environments, these flows are validated via deterministic mock handle test suites (`tests/scanner.test.ts`).

4. **V1 Intentional Non-Scope**:
   - As designed by the V1 product specification: no backend, no cloud database/sync, no AI/Gemini integration, no telemetry, no mobile responsive mode, and no git commit history browsing.
