# Decision Log

## Locked before implementation

- NEXUS is a codebase/project visualizer, not a generic knowledge graph.
- Desktop/laptop target only for V1.
- Web app + offline-capable PWA.
- Direct local directory access; no repository upload for normal use.
- Local-first source privacy.
- Client-only V1: AI Studio must not add a backend just because one is available.
- Approved UI: obsidian surfaces, purple/indigo accents, restrained professional developer-tool aesthetic.
- The reference image is visual direction, not permission to fake absolute paths, ignored-folder sizes, desktop window controls, or dead buttons.
- 3D is the flagship visualization, but it communicates hierarchy and later real dependencies rather than acting as decorative particles.
- Structure is a separate non-spatial accessible/high-density view.
- Heavy/generated directories are ignored before descent.
- Known sensitive files are metadata-only by default.
- Indexed metadata size and actually analyzed text bytes are separate metrics.
- V1 line count means physical lines in analyzed text, not semantic SLOC.
- Project identity persists by matching stored directory handles; node identity is deterministic by project + relative path.
- Cached index viewing and filesystem permission/refresh are separate states.
- Hard safety exclusions are mandatory. Proper `.gitignore` support is deferred until a tested implementation exists.
- No required AI, accounts, multiplayer, or Cloudflare backend in V1.
- Cloudflare may later sync NEXUS metadata and shared sessions, not silently upload raw repositories.

## Open research items

- Best production hierarchy layout for 1k–10k relevant indexed files without visual overload.
- Exact Worker/bounded-concurrency implementation and profiling thresholds.
- Practical incremental-refresh fingerprint/cache design.
- Language parser strategy after TypeScript/JavaScript.
- Whether a later Tauri desktop wrapper provides enough value for native Git/file watching and absolute-path/native integration to justify distribution complexity.
