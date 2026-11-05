# NEXUS — Gemini Starter Kit

NEXUS is a **desktop-first, local-first codebase visualizer**. It opens a software project directly from the user's machine, selectively analyzes useful files, and turns the project into an explorable 3D structure with truthful local metrics.

This package is a clean implementation foundation plus a locked product contract. It is intentionally not presented as a finished application.

## First AI Studio round

1. Read `GEMINI.md`.
2. Read the locked design reference and all required specs in the order listed there.
3. Run `npm install`.
4. Run `npm test`.
5. Run `npm run build`.
6. Fix foundation defects, then complete **Milestone 1 only**.
7. Re-run tests and the production build before reporting.

The first round must rely only on local code inspection, tests, and builds. It must not require an emulator, GitHub/CI, screenshots, browser automation, or pretend that real File System Access flows were manually verified when that environment is unavailable.

## Included foundation

- React + TypeScript + Vite + React Three Fiber.
- Locked NEXUS obsidian/purple design reference with browser-reality notes.
- Client-only local-folder access boundary; no ZIP/source upload workflow.
- Stable project identity support via persisted directory handles.
- Deterministic node IDs from project ID + relative path.
- IndexedDB storage for compact project indexes, nodes, directory handles, and preferences.
- Cancellable scanner with recoverable warnings, generated-folder exclusions, sensitive-file metadata-only handling, and real analysis categories.
- Indexed-vs-analyzed metrics and recursive folder/project aggregation.
- Real cached Projects page plus one clearly labeled curated demo.
- Distinct Graph, Structure, Search, Analytics, Dependencies, and Settings behavior.
- Reduced Visual Effects is wired to lower graph rendering detail/effects.
- Dependencies shows no invented edges before a real parser exists.
- Unit tests for deterministic service logic.

## Hard product boundaries

V1 is not mobile, an AI wrapper, a cloud IDE, or a collaboration suite. Source code stays on-device. Cloudflare sync/AI/collaboration are later possibilities only after the local product is excellent.
