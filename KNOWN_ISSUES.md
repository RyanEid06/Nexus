# Known Issues / Deliberate Milestone Boundaries

The foundation is intentionally honest about what is **not complete yet**:

- Production Worker/bounded-concurrency scanner architecture is not implemented yet; current scanner yields/cancels and is suitable as a foundation, but Milestone 2 must move heavy work off the UI thread and profile real repositories.
- Incremental refresh fingerprints/cache reuse are specified but not implemented yet.
- Stored-handle permission/reconnect states have storage helpers but do not yet have the full Projects-page reconnect UI.
- Full `.gitignore` semantics are deliberately not claimed or implemented. Hard safety exclusions are implemented.
- Production-grade dependency parsing/resolution is not implemented; Dependencies explicitly shows no fake edges.
- Git history integration is not implemented in pure browser V1.
- WebGL low-power/context-loss automatic fallback is not fully implemented.
- Full virtualized/expandable Structure browsing and keyboard tree navigation remain Milestone 2/release accessibility work; the foundation deliberately caps rendered structure rows on huge indexes.
- File-symbol parsing is not implemented.

## Round 1 validation boundary

Browser-only File System Access, permission/reconnect, and manual 3D interaction checks require a real supported top-level Chromium environment. The first AI Studio round must not claim those are verified if that environment is unavailable; it should still run local install, tests, and production build.
