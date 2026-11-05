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
- **Incremental Refresh**: When refreshing existing projects, unchanged files (`sizeBytes` + `modifiedAt` matching) reuse cached metrics and dependency edges without reading file contents from disk. Modified files are parsed freshly, and deleted files are pruned.
- **Yielding Traversal**: Traversal yields to the browser event loop to prevent main thread starvation during large repository scans.

### 2. Dependency Analysis Engine
- **Lexical Import Extraction**: Scans TypeScript and JavaScript source files for ESM `import`, dynamic `import()`, `export ... from`, side-effect imports, and CommonJS `require()`.
- **Path Resolution**: Resolves relative paths (`./`, `../`), default file extensions (`.ts`, `.tsx`, `.js`, `.jsx`), directory index files (`/index.ts`, `/index.js`), `baseUrl`, and `tsconfig.json` path mappings.
- **External Package Classification**: Groups non-relative imports into external packages and counts importing files.
- **Circular Dependency Detection**: Implements Tarjan's / DFS cycle detection to identify circular import loops with full file chains.
- **Shortest Path Finder**: Computes shortest import paths between any two modules using breadth-first search (BFS).

### 3. Local Storage & Reconnection Lifecycle
- **IndexedDB**: Version 3 schema storing compact project metadata, hierarchy nodes, serializable directory handles, and user preferences.
- **Handle States**: Cards display real handle states (`connected`, `permission-required`, `unavailable`).
- **User Actions**:
  - `connected`: One-click incremental Refresh.
  - `permission-required`: Direct user-gesture Reconnect requesting read permission.
  - `unavailable`: Relocate Folder action allowing the user to re-link relocated folders.
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
