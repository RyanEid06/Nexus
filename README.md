# NEXUS — Local-First Codebase Visualizer (v1.0.0)

NEXUS is a **desktop-first, local-first 3D codebase visualizer and architectural explorer**. It opens local software repositories directly from the user's machine using the Chromium File System Access API, performs zero-cloud client-side indexing, and transforms project hierarchies into an interactive spatial map, virtualized directory explorer, and lexical dependency graph.

---

## Key Features

- **Direct Local File Access**: Opens folders directly from your local file system. Source code never leaves the browser—no uploads, no cloud proxies, and no repository cloning.
- **Interactive 3D Graph**: Spatial representation of directories, subdirectories, and files built with Three.js / React Three Fiber, featuring physics-informed layouts, camera auto-framing, and WebGL error recovery.
- **Real Parsed Dependencies**: Lexical extraction of JavaScript and TypeScript imports (`import`, `export from`, `require()`, dynamic `import()`), path resolution (`baseUrl`, `tsconfig.json` path mappings, index files), external package grouping, Tarjan's cycle detection, and BFS shortest-path routing.
- **Virtualized Structure Explorer**: High-density hierarchical view rendering thousands of nodes with windowing and zero DOM bloat, expand/collapse toggles, and keyboard navigation.
- **Deterministic Analytics & Insights**: Physical lines of code (LOC), language breakdown, file size distribution, and analysis safety metrics (metadata-only vs text-analyzed).
- **Persistent Local Caching & Reconnect**: Compact indexes stored in IndexedDB. Stored folder handles preserve project identities, support incremental refresh (re-analyzing only modified files), and graceful reconnection.
- **Installable Offline PWA**: Compliant Progressive Web App with service worker offline caching, manifest icons, and instant loading.

---

## Privacy & Security Guarantee

1. **Client-Only Architecture**: Zero server backends, zero external API keys, zero AI integrations, and zero telemetry.
2. **Metadata-Only Safeguards**: Known sensitive files (`.env*`, `*.pem`, `*.key`, `id_rsa`, credentials) are strictly indexed for file metadata only; their file contents are never read into memory.
3. **Safety Limits**: Automatic read-size limits for large text files and entry limits to safeguard browser memory.
4. **No Raw Source Persistence**: Raw source file text is never stored in IndexedDB—only compact metadata, hierarchy trees, and resolved dependency edges are cached.

---

## Browser Requirements

- **Direct Folder Access**: Requires a desktop Chromium-based browser supporting the File System Access API:
  - Google Chrome (Desktop)
  - Microsoft Edge (Desktop)
  - Brave Browser (Desktop)
  - Opera / Arc (Desktop)
- **Fallback Support**: Other modern browsers (Firefox, Safari) can view the preloaded **Curated Demo** and inspect previously saved offline indexes.

---

## Development & Verification

### Prerequisites
- Node.js 20+ (or Node 22.14.0 as specified in `.node-version`)
- npm 10+

### Setup & Testing
```bash
# Install dependencies
npm install

# Run unit test suite
npm test

# Typecheck and production build
npm run build
```

---

## Cloudflare Pages Deployment

NEXUS V1 is architected as a pure static client-side application ready for instant deployment to Cloudflare Pages:

- **Framework preset**: `None` / `Vite`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/`
- **Environment variables**: None required (zero secrets)
- **Node.js version**: `22.14.0` (set in `.node-version`)
- **Headers & Security**: Pre-configured in `public/_headers` with Content Security Policy, strict MIME-type protection, and immutable asset caching.
