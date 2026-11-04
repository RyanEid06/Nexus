# NEXUS Known Issues & Round 1 Verification Log

**Milestone**: Milestone 1 Only  
**Verification Date**: 2026-11-04  
**Status**: Verified Locally via Code Inspection, Unit Tests, and Production Build  

---

## 1. Verified Locally in Round 1

- [x] **Path Normalization**: Handles Windows backslashes, duplicate slashes, leading/trailing slashes, and relative POSIX standard paths (`src/lib/identity.ts`).
- [x] **Stable Identity Generation**: Deterministic FNV-1a hashing generates stable project IDs (`proj_[slug]_[hash]`) and canonical persistent node IDs (`${projectId}::${path}`).
- [x] **File Classification & Language Registry**: Accurate extension parsing (including dotfiles and special filenames like `Dockerfile`, `Makefile`), syntax type mapping, and Obsidian-themed color categorization (`src/lib/fileClassifier.ts`).
- [x] **Hierarchy & Tree Aggregation**: Recursive tree construction from flat streams, calculation of recursive file counts and cumulative byte sizes, sorting directories first, and language distribution calculation (`src/lib/treeBuilder.ts`).
- [x] **Tree Filtering**: Real-time multi-criteria filtering by search query, extension, dotfile toggle, and dependency folder exclusion while preserving structural ancestry and pruning empty branches.
- [x] **Recent Projects Store**: Local-first metadata caching in `localStorage` with error guards for restricted sandboxes (`src/lib/recentProjects.ts`).
- [x] **Zero-Fake-Data Enforcement**: The application boots into a pure, clean Welcome State without hardcoded mock repositories, dummy files, or simulated graphs.
- [x] **Zero-Dead-Control Enforcement**: All rendered controls (search, filter bar, sort order, sort direction, expand all, collapse all, copy path, file viewer, recents clear/delete, directory fallback picker) are wired to live handlers. Future milestone controls (AST dependencies, AI, Git) are excluded in Milestone 1 rather than rendered as dead buttons.
- [x] **Unit Test Suite**: 9/9 passing tests via `npm test` (`tsx --test src/**/*.test.ts`).
- [x] **Production Build**: Clean compilation via `npm run build` (`vite build`) with zero TypeScript errors.

---

## 2. Browser-Only Checks (UNVERIFIED IN ROUND 1)

As mandated by Round 1 protocol (using only local code inspection, local tests, and local builds without browser automation or claiming manual browser testing):

- **UNVERIFIED IN ROUND 1**: Direct Chromium File System Access API modal dialogs (`window.showDirectoryPicker()`) inside iframe / sandboxed browser permissions contexts. (Code provides automatic fallback to `input[webkitdirectory]` and drag-and-drop).
- **UNVERIFIED IN ROUND 1**: Drag-and-drop filesystem directory traversal (`DataTransferItem.webkitGetAsEntry()`) across different host OS desktop file managers (macOS Finder vs Windows Explorer vs Linux Nautilus).
- **UNVERIFIED IN ROUND 1**: Browser clipboard write permission prompt (`navigator.clipboard.writeText`) in restricted iframe environments during "Copy Path" action.
- **UNVERIFIED IN ROUND 1**: Large multi-gigabyte directory ingestion performance and memory consumption on lower-tier client hardware.

---

## 3. Deliberately Deferred to Future Milestones

Per Milestone 1 constraints, the following features are not implemented:
- **Milestone 2**: AST & import/export dependency parsing
- **Milestone 3**: Interactive force-directed canvas architecture graph
- **Milestone 4**: Local AI architecture insights & summaries
- **Milestone 5**: Git status, commit overlays, and diffs
- **General Exclusions**: Remote backend, cloud synchronization, user login/accounts, collaboration, and mobile views.
