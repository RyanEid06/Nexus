# NEXUS V1 — Release Notes & Validation Boundaries

## Completed V1 Scope

- **Core Desktop Architecture**: Obsidian/purple theme, local File System Access, IndexedDB cache with typed errors, safe folder traversal with entry limits, and physical LOC metrics.
- **Incremental Refresh Engine**: Persisted per-project analysis configuration, fingerprint-based unchanged file reuse with raw specifier caching, handle reconnection lifecycle, and fatal root access protection.
- **Virtualized Structure Explorer**: High-density hierarchical view rendering deep folder trees with windowing, expand/collapse all, and full keyboard arrow navigation.
- **Production Dependency Engine**: Token-aware TypeScript/JavaScript dependency extraction (static, multiline, export-from, require, dynamic import), JSONC tsconfig alias resolution (`@/*`, `baseUrl`), external package grouping, Tarjan's Strongly Connected Components (SCC) circular dependency group detection, and BFS shortest-path routing.
- **Off-Thread Analysis**: Web Worker processing for CPU-intensive dependency parsing and graph resolution with bounded batches and AbortSignal cancellation.
- **Safe Relocation**: Structural validation preventing accidental folder overwrite or project identity corruption.
- **PWA & Production Packaging**: Offline service worker caching, PWA icons, security headers (`public/_headers`), zero backend/secrets requirements, and Cloudflare Pages deployment readiness.

---

## Known Boundaries & Browser Environment Constraints

1. **Chromium Desktop Requirement for Direct File Access**:
   - The File System Access API (`window.showDirectoryPicker`) is currently a Chromium standard implemented by Google Chrome, Microsoft Edge, Brave, and Opera on desktop.
   - On Firefox and Safari, direct local folder picking is unsupported by the browser engine. NEXUS detects this via `supportsLocalDirectoryPicker()` and renders an informational alert banner; users on these browsers can still explore the preloaded **Curated Demo** and inspect previously saved offline indexes.

2. **Dynamic / Non-Standard Module Specifiers**:
   - The dependency parser extracts static ESM imports, dynamic `import()`, CommonJS `require()`, and re-exports.
   - Runtime dynamic expressions (e.g., `import('./locales/' + lang)`) or custom bundler loader query strings (e.g., `import x from './file?raw'`) are safely captured as unresolved or dynamic imports without inventing fictitious dependency edges.

3. **Tsconfig Extends Inheritance**:
   - In V1, alias path mappings and baseUrl are read directly from the project's root `tsconfig.json` or `jsconfig.json`. Inherited aliases from external extended configuration files (`"extends": "..."`) are not parsed in V1 and are a known resolution limitation; root-level path mappings are fully supported.

4. **Client-Only Environmental Boundary**:
   - Real top-level user gesture prompts for folder selection (`showDirectoryPicker`) and browser permission dialogues (`handle.requestPermission`) require a live Chromium desktop session. In automated test environments, these flows are validated via deterministic mock handle test suites.

5. **V1 Intentional Non-Scope**:
   - As designed by the V1 product specification: no backend, no cloud database/sync, no AI/Gemini integration, no telemetry, no mobile responsive mode, and no git commit history browsing.
