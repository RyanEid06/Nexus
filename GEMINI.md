# NEXUS System Architecture & Specification Contract

> **CONFIDENTIAL & BINDING ARCHITECTURAL SPECIFICATION**  
> System: **NEXUS — Local-First Code Architecture Visualizer**  
> Version: `1.0.0-M1`  
> Target Milestone: **Milestone 1 Only**

---

## 1. Locked Architectural Principles

### 1.1 Desktop-Only & Client-Only Architecture
- **Desktop Focus**: NEXUS is engineered exclusively for desktop workstations and high-information-density screens. Mobile viewports, responsive phone collapse, or mobile hamburger touch navigation are explicitly out of scope.
- **Client-Only Execution**: The application runs 100% inside the client browser. No backend services, cloud sync, proxy servers, databases, or user auth systems exist.

### 1.2 Local-Folder Access Model
- **Direct Local File System Access**: Operates on real local source code repositories selected by the engineer via the standard Chromium File System Access API (`window.showDirectoryPicker`), with universal directory input fallback (`webkitdirectory`) for compatibility.
- **In-Memory Handle Lifecycle**: Directory handles and raw file streams are held exclusively in browser memory during the active session.

### 1.3 Local-First Privacy Guarantee
- **Zero Remote Exfiltration**: No code, file paths, telemetry, metadata, or diagnostic payloads ever leave the user's browser.
- **No Cloud Sync / No External APIs**: Completely functional without network access.

### 1.4 Stable Project & Node Identities
- **Deterministic Project ID**: Derived deterministically from the canonical root directory name and path signature (`proj_[slug]_[hash]`).
- **Deterministic Node ID**: Every directory and file receives a persistent, canonical identifier formatted as `${projectId}::${normalizedRelativePath}`.
- **Path Canonicalization**: Paths are normalized to POSIX forward slashes (`/`), eliminating duplicate nodes across platforms and preserving persistent tree addresses.

### 1.5 Zero-Fake-Data & Zero-Dead-Control Rules
- **No Mock Repositories**: If no folder has been opened by the user, NEXUS displays a pristine Empty/Welcome State. It NEVER renders dummy files, synthetic imports, or fake project graphs.
- **Zero Dead Controls**: Every button, input, toggle, tab, and filter rendered in the UI is fully wired to live state and functional logic. Features planned for future milestones (e.g., dependency parsing, AI insights, Git history) are omitted from the UI in Milestone 1 rather than present as non-functional placeholders.

---

## 2. Locked NEXUS Obsidian/Purple Visual Design System

The visual design system reflects a high-performance developer workspace:
- **Palette**:
  - Obsidian Void (Root Canvas): `#07060A` / `#0B0A10`
  - Obsidian Surface (Panels & Cards): `#110F19` / `#161422`
  - Obsidian Elevated (Modals & Hover): `#1D192E` / `#231E38`
  - Border Violet: `#2D2347` / `#3C2E60`
  - Border Violet Subtle: `rgba(139, 92, 246, 0.15)`
  - Accent Purple Glow: `#8B5CF6` (Violet-500), `#A855F7` (Purple-500), `#7C3AED` (Violet-600)
  - Typography: Crisp white `#F8FAFC` for active headers, muted slate `#94A3B8` for secondary text, dim `#64748B` for metadata.
  - Monospace: Monospaced code blocks, file paths, byte sizes, and line counters.
- **Micro-Interactions**:
  - Violet glowing borders on focused inputs and active items.
  - Crisp file explorer tree with clean indentation guidelines.
  - Visual status pill indicating "Local-First • 0 Remote Requests".

---

## 3. Milestone Specifications & Sequencing

### Milestone 1: Local Project Ingestion & File Architecture (THIS MILESTONE)
1. **Directory Ingestion**:
   - Modern `showDirectoryPicker()` integration with error handling.
   - Fallback `input[webkitdirectory]` support for non-Chromium or sandboxed environments.
   - Drag-and-drop local folder zone.
2. **Deterministic Identity Engine**:
   - `createProjectId` and `createNodeId` generating immutable hierarchical identities.
3. **Directory Tree & File System Index**:
   - Recursive traversal with configurable ignore patterns (`.git`, `node_modules`, `.DS_Store`).
   - Calculation of recursive metrics: total files, directory count, cumulative byte size.
   - Categorization by language and file extensions.
4. **Interactive File Explorer**:
   - Expandable/collapsible directory hierarchy with remember-state.
   - Instant search/filter by path query and file extension chips.
   - Toggles for hidden files (`.*`) and dependency directories (`node_modules`).
5. **Code & Directory Inspector**:
   - Instant file preview for UTF-8 text/code files with line numbers and byte metadata.
   - Directory inspector showing child nodes, cumulative size, and child language distribution.
6. **Recent Projects Local Vault**:
   - Safe metadata-only cache in `localStorage` preserving previous project stats without storing file contents.

### Milestone 2: AST & Code Dependency Parsing (DEFERRED — DO NOT IMPLEMENT IN M1)
- Import/export extraction via code analysis.
- Dependency link synthesis between internal project modules.

### Milestone 3: Interactive Architecture Force Graph (DEFERRED — DO NOT IMPLEMENT IN M1)
- Force-directed physics canvas visualizer for file relationships.

### Milestone 4: Local AI Architecture Insights (DEFERRED — DO NOT IMPLEMENT IN M1)
- On-device / user-configured AI summarization and architectural analysis.

### Milestone 5: Git Change Overlay (DEFERRED — DO NOT IMPLEMENT IN M1)
- Git status diffs and commit overlays.

---

## 4. Verification Protocol
1. Local unit tests verify path canonicalization, node ID generation, language classification, tree building, and filter predicates.
2. Production bundle build compiles cleanly with zero TypeScript errors.
3. Real browser filesystem interactions are executed in live Chromium environments (flagged in Milestone 1 documentation).
