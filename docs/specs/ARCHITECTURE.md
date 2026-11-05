# Architecture

## V1 stack

- React + TypeScript + Vite.
- Three.js through React Three Fiber for visualization.
- Zustand for transient UI/application state.
- Dexie / IndexedDB for compact local NEXUS indexes, directory handles, and preferences.
- Zod only where persisted/imported schema validation is useful; do not add validation theatre.
- Vitest for deterministic services.
- PWA via `vite-plugin-pwa`.
- **Client-only V1.** Do not add an AI Studio/Node backend, upload endpoint, auth service, cloud DB, server filesystem proxy, or Gemini API requirement.

## Layer boundaries

### `domain/`
Pure data models. Must not import React or Three.js.

### `services/`
Scanning, metrics, dependency parsing, layouts, graph algorithms. Prefer pure/testable functions. Long-running scan/parse work must migrate off the UI thread as repository sizes and analysis scope grow.

### `storage/`
IndexedDB persistence. Store metadata/indexes/handles/preferences, not raw project content.

### `components/`
UI and rendering only.

### Graph engine vs renderer
The graph engine owns nodes, edges, metrics, filtering, focus, paths, clustering, visibility policy, and layout inputs. Three.js owns visual representation and camera interaction. Core graph meaning must never live only inside Three.js objects.

## Identity — locked

- A local project's NEXUS `projectId` is created once and reused when the selected directory handle matches a stored handle via `isSameEntry()`.
- Node identity is deterministic from `projectId + relative path` so rescanning an unchanged path preserves selection/layout references.
- Rename/move naturally creates a new path identity in V1.
- Never generate fresh random node IDs on every scan.

## Cached reopen / refresh model

1. Load cached compact index immediately; viewing it does not require rereading source files.
2. Retrieve the stored directory handle.
3. Check permission only when filesystem access is needed.
4. If permission is `prompt`, show an explicit reconnect/refresh action that originates from a user gesture.
5. Refresh enumerates current entries and compares fingerprints (`relative path`, `size`, `lastModified`) before rereading/reparsing unchanged files when incremental refresh is implemented.
6. Deleted entries disappear; new/changed entries are reprocessed.

Do not promise magical zero-enumeration or native realtime watching in browser V1.

## Large-project architecture

The product may index many entries but **must not render them all simultaneously**.

Target architecture:

`UI -> scanner worker / bounded work queue -> analysis adapters -> compact index -> graph engine -> renderer`

Requirements:
- Exclusion decisions happen before descending into a directory.
- Work is cancellable via `AbortSignal` or equivalent.
- Per-file read failures are recoverable warnings unless root permission/access is lost.
- Use bounded concurrency when parallel file work is introduced. Never `Promise.all()` tens of thousands of files.
- Stream progress and early structure to UI.
- Render roughly tens to low hundreds of meaningful nodes; reveal deeper nodes by focus/progressive disclosure.
- Safety limit protects the browser; exceeding it must produce a clear non-success state, not a fake complete project.

## Performance budgets (engineering targets, not marketing promises)

- No multi-second main-thread freeze during scan.
- Search over a 50k-node compact index should feel immediate (~100 ms class target on ordinary laptop hardware).
- Typical graph visible set < 200 nodes.
- Cached project shell/graph should appear before source reanalysis.
- Ordinary graph navigation should remain smooth on integrated laptop GPUs; reduced-effects fallback is required before release.

## Future Cloudflare boundary

Cloudflare is a later enhancement, not a V1 requirement. If added, sync **NEXUS metadata** such as saved layouts, annotations, settings, and shareable indexes. Do not silently upload raw repositories.
