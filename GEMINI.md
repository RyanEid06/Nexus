# GEMINI — NEXUS PRODUCTION V1 RELEASE SPECIFICATION

NEXUS V1 is a **desktop-first, local-first 3D codebase visualizer and architectural explorer**. This document is the authoritative specification of the completed V1 release state.

## Core Architectural Invariants

- **Product Identity**: NEXUS (v1.0.0).
- **Runtime Model**: Pure static client-side single-page application (SPA) with Progressive Web App (PWA) offline capabilities.
- **Hosting**: Cloudflare Pages ready (`main` branch, build command `npm run build`, output directory `dist`, zero environment variables, zero server-side functions/workers).
- **Data Privacy**: Local-first. Opening a project uses the direct Chromium File System Access API. Zero server storage, zero cloud databases, zero telemetry, zero AI calls, and zero external network transmission of user code.
- **Visual Direction**: The locked obsidian/purple theme (`#0B0B12`, `#11121B`, `#1A1B26`, `#8B5CF6`) is preserved across all views with developer-tool ergonomics, high density, and keyboard accessibility.
- **Truthful UI**: Zero mock or decorative controls. Every button, toggle, and view is functional or omitted.

## Implemented V1 Systems

### 1. File Access, Safety & Incremental Scanner
- **Direct Directory Picking**: Native `showDirectoryPicker()` with `supportsLocalDirectoryPicker()` feature detection. Informational banner displayed when run on non-Chromium browsers.
- **Safety Limits**: Automatic skips on binary and sensitive files (`.env*`, `*.pem`, `*.key`, `id_rsa`) ensuring their raw contents are never read into memory. Read-size thresholds (`maxTextFileBytes`) for huge files.
- **Fatal Error Handling**: `RootAccessError` prevents empty ghost projects when root handle cannot be iterated. `ScanLimitError` prevents incomplete scans from being saved as complete projects.
- **Persisted Analysis Configuration**: Project-specific analysis configuration persists selected categories (`source`, `configuration`, `documentation`, `test`), `maxTextFileBytes`, and cache versions (`scannerAnalysisVersion`, `dependencyParserVersion`, `dependencyResolverVersion`).
- **Incremental Refresh & Raw Specifier Caching**: Unchanged files reuse cached raw import specifiers without reading file contents from disk. Dependency resolution against the current project file set and aliases is always recomputed.
- **Off-Thread Web Worker**: CPU-heavy token-aware parsing and graph resolution run in a Vite module Web Worker with bounded batching and AbortSignal cancellation.

### 2. Dependency Analysis Engine
- **Token-Aware Lexical Parsing**: Robust multi-line scanning for TypeScript and JavaScript source files extracting static ESM `import`, multiline `import`, default + named, `import type`, dynamic `import()`, `export ... from`, side-effect imports, and CommonJS `require()`. Comments and strings containing fake imports are safely skipped.
- **JSONC Tsconfig & Path Resolution**: Full comment and trailing-comma support for `tsconfig.json`/`jsconfig.json`. Resolves canonical project-relative paths, default extensions (`.ts`, `.tsx`, `.js`, `.jsx`), index files, `baseUrl`, and `paths` mappings.
- **External Package Classification**: Groups non-relative imports into external packages and tracks importing files.
- **Circular Dependency Detection (Tarjan SCC)**: Real Tarjan's Strongly Connected Components algorithm identifying circular dependency groups of size > 1 and module self-loops.
- **Shortest Path Finder**: Computes shortest import paths between any two modules using breadth-first search (BFS).

### 3. Local Storage & Safe Relocation
- **IndexedDB**: Version 3 schema storing compact project metadata, hierarchy nodes, serializable directory handles, and user preferences with typed `StorageError` handling.
- **Handle States**: Cards display real handle states (`connected`, `permission-required`, `unavailable`).
- **Safe Relocation**: Structural validation (`validateRelocationCandidate`) inspects candidate directories to prevent accidental overwrite of existing project identities. Stored handles are only attached after successful scan.
- **Truthful Error Handling**: Database failures surface typed error messages in the UI rather than producing empty lists or fake save confirmations.
- **User Actions**:
  - `connected`: One-click incremental Refresh preserving project configuration.
  - `permission-required`: Direct user-gesture Reconnect requesting read permission.
  - `unavailable`: Relocate Folder action with structural validation.
  - Deletion: In-place confirmation safeguard ("Delete cached index?") ensuring safe removal from IndexedDB while never touching files on disk.

### 4. 3D Spatial Graph & Tree Views
- **3D Graph Canvas**: Three.js / React Three Fiber rendering with camera auto-framing on selected node coordinates and layout recalculations.
- **WebGL Context Safeguard**: Dedicated `WebGLErrorBoundary` that catches WebGL context loss or initialization failures and presents a clean fallback card to switch to Structure view.
- **Virtualized Structure Explorer**: Non-spatial tree view rendering deep hierarchies without DOM bloat, expand/collapse all controls, and keyboard navigation.
- **Search & Analytics**: Instant search across filenames and relative paths revealing full ancestor chains. Analytics page displaying physical LOC, language distribution, safety skips, and top depended-upon modules.

### 5. Progressive Web App (PWA) & Security Headers
- **Offline Service Worker**: Configured via `vite-plugin-pwa` with precache handling and runtime caching.
- **PWA Icons**: Pixel-crisp 192x192, 512x512, and maskable 512x512 icons matching the obsidian theme.
- **Production Headers**: `public/_headers` configured with strict Content Security Policy (CSP), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and immutable asset caching.
