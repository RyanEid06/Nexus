# Development Milestones

## Milestone 1 — Foundation, truthful UX, and local-access validation

Goal: prove the NEXUS shell, local-access architecture, stable identity, and flagship visual language without fake product behavior.

- App installs/runs/builds/tests cleanly.
- UI closely follows final reference and `REFERENCE_NOTES.md` exceptions.
- Fresh install shows no fake personal recent projects; curated demo is clearly synthetic.
- 3D graph orbit/zoom/select works with deterministic cluster color semantics.
- Inspector uses recursive folder/project stats.
- Structure is a real non-spatial view.
- Search name/path ranking and Ctrl/Cmd+K work.
- Open Local Project works in supported Chromium desktop.
- Scanner skips heavy directories before descent, skips sensitive contents, exposes progress, recovers per-file warnings, and supports real cancel.
- Stable project/node identity and stored directory handle are validated.
- Local compact project index saves to IndexedDB.
- No source upload occurs.
- No dead buttons/tabs remain in the Milestone 1 UI.

**Stop after validating this milestone.** Fix quality issues before adding major systems.

## Milestone 2 — Reopen, refresh, real structure exploration, and large-repo performance

- Cached project list shows connected / permission-required / unavailable state.
- Explicit reconnect/permission recovery flow.
- Refresh compares path/size/lastModified fingerprints and avoids rereading unchanged text where practical.
- Move scanner/analysis work to Worker/bounded work queue; no long main-thread stalls.
- Stream early structure before full analysis completes.
- Focus/isolate folder branches; depth/density controls only if they materially help.
- Better deterministic hierarchy layout and camera focusing.
- Proper tested `.gitignore` semantics if added; never naive partial semantics marketed as complete.
- Large-project profiling with real 1k–10k relevant-file repositories and stress tests toward the 50k safety ceiling.

## Milestone 3 — Metrics polish and optional Git-aware insights

- Largest files/folders polish.
- Language composition validation.
- Last-modified insights.
- Optional local Git metadata only where browser capabilities make it truthful; otherwise defer to future desktop bridge.

## Milestone 4 — Dependency graph

- Parser adapter interface.
- TS/JS static import, export-from, dynamic import, and CommonJS require resolver.
- Extension/directory-index resolution and practical TS/JS alias support.
- External packages represented without `node_modules` expansion.
- Incoming/outgoing dependencies.
- Circular dependency detection.
- Path between modules.
- Focus/isolate dependency neighborhood.
- No fake inferred dependencies.

## Milestone 5 — PWA / accessibility / release polish

- Offline PWA install behavior on a stable production origin.
- Consider persistent-storage request after first successful local project.
- Loading/recovery/error states complete.
- Reduced-quality mode and WebGL failure fallback to Structure.
- Keyboard navigation and focus states throughout ordinary UI.
- Resume/portfolio-ready demo repository and screenshots.

## Later, only after V1 is excellent

Cloudflare sync of NEXUS metadata, shared visualization sessions, annotations/collaboration, optional accounts, and optional AI features.
