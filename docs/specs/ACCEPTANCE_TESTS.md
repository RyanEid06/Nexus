# Acceptance Tests

A coding agent may not call a milestone finished until relevant checks pass.

## Build quality

- `npm test` passes.
- `npm run build` passes.
- No obvious runtime console errors in normal flows.
- No visible control claims functionality it does not have.

## Local project import

- Folder picker opens on supported Chromium desktop in a real top-level browsing context.
- Canceling picker does not show a false error.
- `node_modules`, `.git`, `build`, `dist`, `.gradle`, coverage/caches/vendor outputs are not descended into by default.
- A multi-GB project dominated by ignored folders is not copied/uploaded and those ignored trees are not recursively sized.
- Binary/media contents are metadata-only.
- Known sensitive files remain metadata-only by default.
- A text file larger than the configured threshold is indexed but not fully read.
- Scanner progress updates while work is happening.
- Cancel/stop actually aborts analysis.
- One unreadable file produces a warning and does not automatically destroy the entire scan.
- Hitting the entry safety limit produces an explicit incomplete/failure state; it is never presented as a successful complete index.

## Identity / persistence

- Rescanning the same selected directory reuses the project ID when the stored handle matches.
- Unchanged relative paths keep stable node IDs across rescans.
- Compact index persists after reload.
- Raw source text is not stored in IndexedDB.
- Stored handle and cached index are separate from permission state.
- Permission-required projects remain viewable from cache and provide a user-gesture reconnect/refresh path once implemented.
- Removing a project from NEXUS does not delete or modify the user's source directory.

## Metrics

- `indexedBytes` counts indexed file sizes only.
- `analyzedTextBytes` counts only files whose text was actually read.
- Directory/project `sizeBytes`, line counts, and descendant counts are recursive.
- UI labels physical line counts honestly; it does not claim semantic SLOC.
- Ignored folder sizes are never faked.

## Graph

- Orbit, pan/zoom, and selection work.
- Selected node and inspector remain synchronized.
- Selecting a deep Search result makes the node and full ancestor chain visible in Graph.
- Opening a project with many indexed files does not attempt to render all files simultaneously.
- Root/folder hierarchy is visually understandable.
- Cluster colors are deterministic between sessions for unchanged top-level paths.
- Labels remain sparse enough to read.
- Text remains usable at 1366×768 and common larger laptop resolutions.

## Structure / search

- Structure is a real non-spatial repository view, not a route to Dependencies.
- Search matches names and relative paths.
- Empty query shows guidance rather than arbitrary project entries.
- Keyboard shortcut Ctrl/Cmd+K opens Search when a project is active.

## Dependencies

Until dependency parsing is implemented, the Dependencies view states that it is unavailable and shows **zero invented edges**.

When implemented, tests must cover TS/JS imports, export-from, dynamic import, require, extension/index resolution, external-package handling, and no `node_modules` traversal.

## Product integrity

- No mobile-specific work is added.
- No Gemini/AI API, Node backend, cloud DB, auth, or source upload is required.
- Unsupported browsers get a compatibility message instead of a broken picker.
- Visual design remains faithful to the approved reference while obeying `REFERENCE_NOTES.md` browser-reality exceptions.
