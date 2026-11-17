# NEXUS — Architectural Codebase Visualizer

NEXUS is a **desktop-first, local-first codebase visualizer and architectural workspace**. It opens local repositories directly from disk using the Chromium File System Access API, indexes files and AST/lexical dependencies inside the browser with zero backend uploads, and renders both interactive 2D blueprint topologies and a high-precision Three.js 3D workstation—including multi-project orbital constellations.

---

## Key Features

- **Direct Local File Access & Privacy**: Opens folders directly from your local machine. Raw source files stay strictly on disk and are never persisted or uploaded anywhere.
- **2D Spatial Blueprint & Pure Three.js 3D Engine**: Seamless switching between a hardware-crisp 2D coordinate topology and a physical metallic Three.js / WebGL 3D studio scene (`OrbitControls`, `RoomEnvironment` IBL lighting, directional dependency arcs, and automatic WebGL recovery).
- **Large-Folder Balance & Recursive Sub-Maps**: Handles 7,000+ file repositories and 900+ file directories without visual cramping:
  - **Single-Click Folder Preview**: Clicking a folder fans out up to **15 prioritized items** radially outside outer rings so sibling hubs never overlap.
  - **Double-Click Recursive Sub-Maps**: Double-clicking any folder (or clicking its `+ N more · Sub-Map` marker) opens a centered sub-map for that directory, recursively sub-map into sub-map, with HUD breadcrumbs, `Up` / `Esc`, and full Back/Forward navigation history.
  - **Page-by-Page Map Navigation**: Massive folders with 25–1,000+ direct children can be paged in clean 24-node concentric batches (`‹ Prev` / `Next ›` in the HUD or directly on canvas overflow triggers).
- **Multi-Project Constellation Workspace**: Load up to 6 repositories simultaneously (including curated TypeScript architectural sandboxes), switch instant active workspaces, and inspect shared external dependency bridges side-by-side in 2D and 3D Constellation mode.
- **Real Parsed Dependencies**: Lexical extraction of ES/CommonJS/dynamic imports, `tsconfig.json` JSONC path alias & `baseUrl` resolution, Tarjan's SCC circular dependency cycle detection, and BFS shortest-path analysis.
- **Virtualized Structure Explorer & Analytics**: Windowed hierarchical explorer for tens of thousands of nodes, instant ranked LOC/language analytics, and keyboard-driven search (`Ctrl+K`).
- **Offline-Ready PWA & Self-Hosted Fonts**: Full Progressive Web App compliance (synchronized SVG/PNG/maskable/Apple Touch icons, Workbox offline precaching, `OfflineIndicator`, and native `Install App` / iOS Safari install prompt) with bundled self-hosted `@fontsource` typefaces (`Outfit`, `Plus Jakarta Sans`, `JetBrains Mono`) built to satisfy strict `font-src 'self'` Content Security Policies.

---

## Privacy & Security Guarantee

1. **Client-Only Execution**: Zero backend servers, zero external API keys, and zero external font/CDN requests at runtime.
2. **Metadata-Only Safeguards**: Sensitive files (`.env*`, `*.pem`, `*.key`, credentials) are indexed strictly for metadata; contents are never read into memory.
3. **Strict CSP Compatibility**: Pre-configured in `public/_headers` (`font-src 'self'`, `style-src 'self' 'unsafe-inline'`, `connect-src 'self'`).
4. **Compact IndexedDB Persistence**: Folder handles and lightweight hierarchy/dependency indexes are stored locally in IndexedDB with safe relocation checks.

---

## Development & Verification

### Prerequisites
- Node.js >=22 (`22.14.0` pinned in `.node-version` and `package.json`)
- npm 10+

### Commands
```bash
# Install dependencies
npm install

# Run test suite (Vitest)
npm test

# Typecheck and production build
npm run build

# Lint codebase (oxlint)
npm run lint
```

---

## Cloudflare Pages Deployment

- **Framework preset**: `None` / `Vite`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/`
- **Node.js version**: `22.14.0`
- **Headers & Security**: Configured in `public/_headers` with strict self-hosted CSP, `X-Frame-Options`, `X-Content-Type-Options`, and immutable `/assets/*` caching.
