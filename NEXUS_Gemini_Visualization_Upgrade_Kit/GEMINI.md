# NEXUS — VISUALIZATION, EXPLORATION & UX UPGRADE

## AUTHORITATIVE IMPLEMENTATION BRIEF

This file is the implementation specification for the next NEXUS release. Read the **entire existing repository first**, then read every reference image in this kit before changing code.

This specification intentionally supersedes any older visualization wording in the repository's current `GEMINI.md` while implementation is in progress. Preserve all existing production behavior unless this document explicitly changes it.

Do not treat this as a request for a visual mockup. Implement the features in the real application, use real project data, preserve existing saved projects, and verify the result.

---

# 0. FIRST: UNDERSTAND THE EXISTING PRODUCT

NEXUS is already a working, local-first codebase visualizer. Do not rebuild it from scratch.

Current verified stack from `package.json`:

- Node.js: `>=22`
- TypeScript 7
- React 19
- Vite 8
- Zustand 5
- Dexie / IndexedDB
- Three.js
- `@react-three/fiber`
- `@react-three/drei`
- Lucide React
- Vitest
- Vite PWA plugin
- Static Cloudflare Pages deployment

## Language/runtime rule

Use **TypeScript + React + CSS** for this work.

The 3D renderer must remain Three.js / React Three Fiber / Drei.

Do NOT introduce:

- Python runtime
- Java/Kotlin
- Node/Express backend
- Cloudflare Workers or server functions
- database server
- server-side source-code processing
- remote AI service
- source upload service
- Electron
- WebAssembly unless there is a proven need

A small client-side dependency for 2D graph interaction, Markdown rendering, or syntax highlighting is allowed only if it materially improves reliability or maintainability. Prefer the existing stack where practical. If adding a dependency, explain why and update `package-lock.json` correctly.

NEXUS must remain a **pure static client-side SPA/PWA** deployable to Cloudflare Pages with:

- build command: `npm run build`
- output: `dist`
- no environment variables
- no backend

---

# 1. REFERENCE ART — READ BEFORE CODING

The kit contains the approved visual references:

## Approved 2D design

`REFERENCE_ART/2D_APPROVED.png`

This is the **locked layout and visual direction** for the 2D Map mode.

Reproduce its visual language faithfully inside the visualization area while keeping the existing NEXUS outer shell consistent.

## Approved 3D visual direction

- `REFERENCE_ART/3D/3D_01_MAIN_PERSPECTIVE.png`
- `REFERENCE_ART/3D/3D_02_TOP_VIEW.png`
- `REFERENCE_ART/3D/3D_03_SIDE_VIEW.png`
- `REFERENCE_ART/3D/3D_04_BOTTOM_VIEW.png`
- `REFERENCE_ART/3D/3D_05_DRILLDOWN_FOCUS.png`

IMPORTANT: these 3D images define the **node materials, restrained glow, lighting quality, dark-space atmosphere, color language, and readability**.

They are **NOT authoritative for node coordinates**.

Do not copy their flat solar-system/orbit geometry.

The real NEXUS 3D hierarchy behavior described below is authoritative.

---

# 2. PRODUCT GOAL

The core NEXUS workflow should become:

> Open repository → understand its structure → follow relationships → drill into a branch → inspect the real file → move backward/forward through exploration without losing context.

The result must feel like a serious developer tool rather than a decorative space animation.

Beauty matters, but useful spatial understanding matters more.

The outer interface is already approved. Make the **inside visualization/exploration experience** significantly better without gratuitously redesigning unrelated screens.

---

# 3. EXISTING FILES YOU MUST INSPECT BEFORE EDITING

At minimum inspect these files and understand their current behavior:

### Graph and layout
- `src/components/GraphPage.tsx`
- `src/components/ProjectGraph.tsx`
- `src/services/layout.ts`
- `src/store/useAppStore.ts`

### Exploration/navigation
- `src/components/StructurePage.tsx`
- `src/components/SearchPage.tsx`
- `src/components/Inspector.tsx`
- `src/components/Sidebar.tsx`
- `src/components/WorkspaceTabs.tsx`
- `src/components/DependenciesPage.tsx`
- `src/components/AnalyticsPage.tsx`

### Import/storage/security
- `src/components/ImportProject.tsx`
- `src/storage/db.ts`
- `src/services/projectScanner.ts`
- `src/utils/fileTypes.ts`
- `src/domain/models.ts`

### Styles/tests
- `src/styles/app.css`
- all files under `tests/`

Do not modify scanner/dependency/storage contracts casually. They already contain important safety and backward-compatibility behavior.

---

# 4. LOCKED OUTER UI

Keep the existing NEXUS shell and product identity consistent.

Preserve:

- obsidian/purple NEXUS visual identity
- sidebar structure and dimensions unless fixing one of the explicit issues below
- current workspace framing
- inspector concept
- Projects / Settings designs
- typography direction
- compact developer-tool density
- local-source privacy messaging

Do not perform a full application redesign.

The primary rename is:

**Graph → Map**

Inside Map, provide:

**2D | 3D**

The selected mode must be obvious and use the approved bottom-right control style.

---

# 5. APPROVED 2D MAP — IMPLEMENT FULLY

Use `REFERENCE_ART/2D_APPROVED.png` as the visual target.

## 5.1 Visual hierarchy

The 2D Map must communicate hierarchy immediately:

- project root = largest central node
- top-level directories = prominent colored directory nodes
- deeper directories = medium nodes
- files = smaller nodes
- parent/child hierarchy = clean solid lines
- dependency relationships = visually distinct, softer/dashed lines

Do not hardcode filenames or the example structure from the artwork.

Render actual `ProjectIndex.nodes` and actual dependency data.

### Node sizing

Use meaningful but bounded sizing.

Possible signals:

- project root: fixed dominant size
- directory: descendant file count / descendant folder count
- file: LOC, indexed size, or dependency connectivity

Apply strict minimum/maximum caps so extreme repositories do not destroy the layout.

### Color

Keep the approved cluster color language, but reduce the overly saturated/toy-like appearance of the current six-color balls.

Color should help identify major branches, not overpower the data.

### Background

- almost-black obsidian
- sparse low-opacity stars
- no busy animated wallpaper
- no large nebula directly behind nodes
- data remains the highest-contrast content

## 5.2 2D layout

The approved reference is radial and readable.

Implement a deterministic layout that:

- produces stable positions between renders
- avoids severe collisions
- groups children around their parent
- preserves hierarchy visually
- makes important branches easier to scan
- does not constantly jiggle or re-simulate

A deterministic collision-resolution pass is acceptable.

If using a force graph library, stop/settle it deterministically and persist/reuse stable positions for the current index. Do not create perpetual motion.

## 5.3 2D interactions

Required:

- drag to pan
- scroll/pinch to zoom
- click to select
- directory exploration/expansion
- file opening
- hover relationship highlighting
- Fit Map
- Reset View
- Focus Selection
- fullscreen
- keyboard-accessible equivalents where reasonable

When a directory is explored, reveal its actual children without unexpectedly re-randomizing the rest of the map.

Do not render an entire huge repository at once. Reuse or evolve the current bounded visibility concept.

## 5.4 Labels

Improve the current sparse labeling system.

- root and top-level directories should be consistently readable
- selected/hovered nodes always get labels
- file labels progressively appear as zoom increases
- avoid mass DOM labels at far zoom
- prevent obvious overlap where practical

---

# 6. APPROVED 3D MAP — PRESERVE NEXUS'S SIGNATURE BEHAVIOR

This is the most important implementation rule.

Current code in `src/services/layout.ts` uses:

- deterministic parent-relative positioning
- the golden angle
- per-depth radius changes
- vertical lift offsets

Current `visibleGraphNodes()` reveals selected branches and related nodes.

The user specifically likes the way exploring nodes grows into a **circular 3D staircase / spiral hierarchy**.

## DO NOT REPLACE THIS WITH A FLAT SOLAR SYSTEM.

Do not make all nodes sit on one plane.

Do not create decorative orbit rings that imply relationships that do not exist.

Do not replace the existing spatial identity with a generic force-directed cloud.

## 6.1 Desired expansion behavior

When a directory/branch is opened:

1. its real children appear around that parent
2. every child has a truthful parent-child connection
3. their placement continues around the parent using the existing circular/golden-angle logic
4. the next hierarchy level advances in actual X/Y/Z space
5. repeated exploration produces a branching circular staircase
6. viewed from the side, height/depth differences are obvious
7. viewed from below, the hierarchy still makes spatial sense
8. viewed from above, branch organization remains clear

Preserve deterministic placement.

Improve collisions without destroying the staircase.

Recommended approach:

- evolve `withDeterministicLayout()` rather than replacing it
- consider sibling-count-aware radius
- consider descendant-size-aware spacing
- add a deterministic collision-relaxation/post-processing step
- keep parent-relative golden-angle placement as the backbone
- add tests proving the same input produces the same coordinates

## 6.2 3D visual redesign

The existing implementation uses basic spheres:

- project radius ~0.78
- directory radius ~0.46
- file radius ~0.20

That is too primitive.

Use the reference art's **quality**, not its orbital geometry.

### Project node

- distinctive violet NEXUS core
- premium but restrained material
- strong readable project identity
- subtle halo/glow
- visually dominant
- not enormous

### Directory node

Use a visually distinct hub shape such as:

- rounded low-profile capsule/disc
- beveled hub
- compact dimensional folder-like platform

Requirements:

- different from files
- branch color rim/accent
- folder icon where legible
- clear directory name
- descendant count can appear in label/tooltip

### File node

Use a simpler, smaller object:

- small luminous marker
- compact sphere/diamond/disc
- minimal geometry for performance

Files must not look equally important as directories.

### Connections

Hierarchy edges:

- thin
- clean
- slightly luminous near selected branch
- subdued when unrelated

Dependency edges:

- optional filter layer
- visually distinct from hierarchy
- no fake decorative connections
- unresolved dependencies must not masquerade as resolved project edges

### Lighting/effects

- restrained bloom-like appearance without excessive post-processing
- sparse stars
- subtle depth cues
- no giant nebula effect
- no particle storm
- no expensive effect that makes large projects unusable

Reduced Effects preference must still work.

## 6.3 Camera/navigation

Keep real Three.js/R3F 3D camera behavior.

Required:

- orbit
- pan
- zoom
- damping when reduced-effects is off
- Fit Map
- Focus Selection
- Reset Camera
- fullscreen

Selecting/focusing a node should smoothly move the controls' target without teleporting or disorienting the user.

Do not lock the camera to a top-down angle.

The user must be able to inspect the map from:

- front/perspective
- top
- side
- below

Do not add five permanent camera buttons unless they genuinely improve the UX; the reference angles are primarily visual QA targets.

---

# 7. SHARED 2D / 3D GRAPH STATE

Both modes must operate on the same real project graph state.

Add shared state cleanly, likely through `useAppStore.ts` or a focused graph store/slice.

Track at minimum:

- map mode: `2d | 3d`
- selected node
- expanded/revealed branch state if introduced
- relationship filter
- node exploration history

Relationship filter:

**Hierarchy | Dependencies | Both**

Rules:

- switching 2D/3D does not rescan the repository
- switching 2D/3D does not lose the selected node
- switching modes does not lose expanded branch context
- preserve independent camera/viewport state for each mode where practical
- never lose current project
- never alter IndexedDB project data merely because view state changes

2D should be the default for newly opened projects after this upgrade.

If existing saved projects have no new preference fields, migrate gracefully with defaults rather than breaking them.

---

# 8. REAL FILE VIEWER — REQUIRED

NEXUS should no longer stop at metadata when the user reaches a file.

A permitted real file should be viewable directly from NEXUS.

Examples:

- `README.md`
- `src/components/Header.tsx`
- `package.json`

## 8.1 Opening behavior

A file must be openable from:

- Map
- Structure
- Search
- Inspector
- Dependencies where appropriate
- Analytics ranked lists where appropriate

Interaction:

- single click selects
- double click opens a file
- Enter/Open action provides keyboard access

When file viewer closes:

- return to the previous exploration context
- preserve selected node
- preserve Map camera/zoom where possible

## 8.2 File viewer UI

The file viewer must fit naturally inside the existing workspace.

Use a deep opaque near-black content surface.

The surrounding map can retain subtle stars, but stars must never reduce source readability.

Header:

- file name
- relative path
- close/back
- copy
- optional Show on Map
- dependency shortcuts if available

Source viewer:

- read-only
- syntax highlighting
- line numbers
- in-file search
- smooth vertical/horizontal scrolling
- readable monospace font
- no editor affordances that imply saving/editing

## 8.3 Markdown

For Markdown files provide:

**Preview | Source**

Preview:

- headings
- paragraphs
- lists
- links shown safely
- fenced code
- tables if supported

Do not allow unsafe raw HTML/script execution.

Do not automatically load arbitrary remote content embedded in Markdown.

## 8.4 Local-first implementation

Use the existing stored directory handle via `src/storage/db.ts` (`getProjectHandle()`).

The current `LocalDirectoryHandle` interface only exposes iteration plus permission methods even though Chromium native handles have direct lookup APIs. Extend types carefully if needed, or safely traverse via `values()`.

Create a focused service such as:

`src/services/filePreview.ts`

Suggested responsibilities:

- validate requested indexed node
- verify `node.kind === 'file'`
- reject traversal outside root
- reuse `isSensitiveTextFile()` from `src/utils/fileTypes.ts`
- reject unsupported/binary content
- enforce preview byte limit
- retrieve stored handle
- verify/request permission only from an appropriate user gesture
- resolve the relative path segment-by-segment
- read only the requested file
- return text + metadata
- never persist raw contents

## 8.5 Privacy/security requirements

NON-NEGOTIABLE:

- no source upload
- no remote preview endpoint
- no source telemetry
- no raw source stored in IndexedDB
- no automatic full-repository reads for preview
- no network request for code highlighting
- no external CDN runtime dependency
- no preview of intentionally sensitive files

Preserve/reuse existing sensitive rules in `src/utils/fileTypes.ts` including `.env*`, `.npmrc`, key/certificate/keystore-like files.

Reject dangerous or unsupported binary files.

Use a safe preview-size limit; ideally tie it to the existing project `analysisConfig.maxTextFileBytes` or a stricter viewer cap.

Handle:

- revoked permission
- stale handle
- relocated repository
- deleted file
- renamed file
- unsupported browser
- demo project with no disk handle
- invalid relative path
- size overflow

No path traversal.

---

# 9. FIX EVERY EXISTING P1–P3 ISSUE FROM THE AUDIT

These are not optional.

## P1 — MUST FIX

### P1.1 Graph does not encode enough useful information

Current spheres mostly communicate node kind and branch color.

Improve information encoding through:

- hierarchy-specific geometry
- bounded semantic node size
- selected/hover relationship highlighting
- descendant/count metadata where useful
- clear distinction between project / directory / file

Do not make the graph visually noisy.

### P1.2 Deterministic layout can collide

Do not throw away deterministic/golden-angle behavior.

Improve it with deterministic spacing/collision handling in both 2D and 3D.

No infinite force simulation.

### P1.3 WebGL error boundary is currently logically broken

In `ProjectGraph.tsx`, `WebGLErrorBoundary` sets `hasError` but `render()` always returns `this.props.children`.

Fix it correctly.

When WebGL is unavailable or context is lost:

- do not repeatedly rerender the broken 3D subtree
- provide a clean fallback
- allow user to switch directly to functional 2D Map
- do not make Map unusable

### P1.4 Structure Explorer interaction is ambiguous

Current directory-row behavior couples selection/expansion too aggressively.

Implement clear behavior:

- row click = select
- chevron = expand/collapse
- double-click file = open
- double-click directory may focus/open its hierarchy if helpful
- ArrowRight/ArrowLeft tree semantics remain correct
- preserve virtualization
- keep valid accessible button semantics

### P1.5 Search forces results back into 3D Graph

Current `SearchPage.tsx` calls `setPage('graph')` for every result.

Fix routing:

- file result → select and open file viewer (or provide immediate Open and Show on Map actions)
- directory result → reveal/focus in Map or Structure appropriately
- project/root result → focus Map
- do not force 3D specifically

---

## P2 — SHOULD BE TREATED AS RELEASE REQUIREMENTS

### P2.1 Duplicate Analytics navigation

Analytics appears in both the persistent sidebar and workspace tabs.

Simplify.

Preferred solution:

- keep Analytics as a workspace tab
- remove duplicate Analytics item from persistent sidebar
- keep Search and Settings readily accessible

If another solution is objectively clearer, document why.

### P2.2 Missing viewport controls

Add useful controls to Map:

- Fit
- Reset/Home
- Focus selection
- fullscreen

Do not clutter the canvas with large floating toolbars.

### P2.3 Import wizard step state is untruthful

`ImportProject.tsx` currently renders "Select Project" as completed even when `folder` is null.

Make the progress indicator truthful.

Example:

- no folder → Select Project = current
- folder selected → Select Project = complete, Analysis Rules = current
- scan running → Analyze = current
- completion transitions cleanly

Do not fake completed steps.

### P2.4 Sidebar silently truncates top folders to 12

`Sidebar.tsx` currently uses `.slice(0, 12)` with no disclosure.

Do not silently hide content.

Keep sidebar compact. Recommended:

- retain a reasonable preview limit
- when more exist, show a functional `+ N more · View Structure` control

Do not dump thousands of folders into the sidebar.

### P2.5 Inspector silently truncates direct children

`Inspector.tsx` currently displays 12 children then plain explanatory text.

Replace with a functional action:

- `View all N children in Structure`

Preserve selected node/reveal its location.

### P2.6 Sparse graph labels

Current 3D labels only appear for root, shallow nodes, and selected node.

Implement zoom-aware/hover-aware labels so the graph is understandable without filling the screen with labels.

### P2.7 Overly toy-like cluster colors

Keep branch identity but tone saturation and glow down.

The visual hierarchy must look professional and consistent with approved art.

### P2.8 Selection changes graph contents abruptly

Current `visibleGraphNodes()` can substantially change the rendered set based only on selection.

Improve this interaction.

Preferred direction:

- separate `selected` from `expanded/revealed` state
- expanding a branch should be intentional and persistent during the exploration session
- transitions should animate smoothly
- previously explored nearby structure should not disappear without reason
- retain hard visibility limits for performance

Do not break the circular staircase behavior.

---

## P3 — COMPLETE THESE TOO

### P3.1 Make Analytics actually useful for architectural understanding

Current analytics already has basic metrics, largest files, languages, and most-imported modules.

Extend with compact actionable insight lists/cards such as:

- Most Connected Files = incoming + outgoing internal dependencies
- Highest Fan-Out = files with most outgoing dependencies
- Highest Fan-In / Most Depended-Upon
- Unresolved Import Hotspots = files producing the most unresolved internal-looking edges
- Biggest Modules/Folders by LOC and/or descendant file count
- Circular Dependency Hotspots when cycles exist

Every ranked item should be clickable and lead to a useful context:

- file viewer
- Dependencies
- Map focus
- Structure reveal

Avoid fake "AI insights" or subjective scoring.

Everything must derive deterministically from existing index/dependency data.

### P3.2 Add node exploration Back/Forward history

Users need to move through explored nodes without manually reconstructing their path.

Implement compact Back / Forward actions for node exploration.

History should capture meaningful node navigation such as:

- Map selection/focus
- Structure navigation
- Search result navigation
- Dependencies module navigation
- file viewer opens

Avoid adding duplicate consecutive entries.

Do not confuse this with destructive browser navigation.

Keep a reasonable bounded history size.

---

# 10. SEARCH UPGRADE

Current search ranking is simple exact/start/includes/path matching.

Improve search while keeping it local and fast.

Requirements:

- filename and path matching
- forgiving fuzzy/subsequence matching
- exact/prefix still rank highest
- directories/files clearly distinguished
- keyboard navigation: Up/Down/Enter/Escape
- highlighted matching text if cleanly implementable
- no network search
- no source-content indexing requirement for this release

Do not add a large search dependency just for basic fuzzy matching unless justified.

---

# 11. STRUCTURE, DEPENDENCIES, INSPECTOR INTEGRATION

All exploration surfaces should feel connected rather than isolated.

If a user selects a node in one surface, other surfaces should be able to reveal it when opened.

Examples:

- Analytics item → relevant file/Dependencies/Map
- Dependency target → select target and optionally Open File
- Inspector child → select; View All → Structure revealed to the parent
- Search directory → Map focus or Structure reveal

Preserve the real node ID/path as the source of truth.

Do not create duplicate shadow models of the repository.

---

# 12. RESPONSIVENESS & ACCESSIBILITY

NEXUS is desktop-first, but avoid obvious breakage at narrower desktop/tablet widths.

Requirements:

- keyboard focus remains visible
- buttons have labels/tooltips where icon-only
- no inaccessible nested buttons
- no critical interaction available only by hover
- reduced effects remains meaningful
- file viewer works with keyboard
- Map controls have accessible names

Do not degrade current focus-visible styling.

---

# 13. PERFORMANCE BUDGET

Real projects can contain thousands of indexed nodes even though the graph displays a bounded subset.

Do not make the visualization scale directly with every indexed node.

## 3D

- reuse geometry/materials where practical
- do not allocate per-frame objects unnecessarily
- memoize graph lookups
- avoid huge counts of `<Html>` labels
- cull/fade labels by distance/zoom
- keep current bounded visibility philosophy
- preserve reduced-effects mode

## 2D

- do not render thousands of heavyweight DOM nodes simultaneously
- virtualize/cull or reveal progressively
- avoid continuous simulation
- debounce expensive viewport-dependent calculations

## File viewer

- read one requested file only
- release file contents when viewer/context no longer needs them
- never retain entire source tree in memory

---

# 14. SUGGESTED ARCHITECTURE

This is guidance, not a requirement to create these exact filenames.

Possible additions:

- `src/components/ProjectMap.tsx` — mode host / shared controls
- `src/components/ProjectGraph2D.tsx` — 2D renderer
- `src/components/ProjectGraph.tsx` — upgraded 3D renderer or rename to `ProjectGraph3D.tsx`
- `src/components/FileViewer.tsx`
- `src/services/filePreview.ts`
- enhanced `src/services/layout.ts` for shared deterministic helpers
- enhanced `src/store/useAppStore.ts` for mode, expansion, viewer, history

Avoid giant monolithic components.

Do not move stable scanner/dependency logic into UI components.

---

# 15. STORE / STATE REQUIREMENTS

Current Zustand state is minimal:

- page
- project
- selectedNodeId

Expand carefully.

Likely additions:

- `mapMode`
- `relationshipMode`
- `expandedNodeIds`
- current open file/viewer state
- navigation history index + entries
- 2D viewport state
- 3D camera state only if practical

Rules:

- clearing project clears project-scoped transient state
- setting a new project initializes sane defaults
- old saved projects load without migration failure
- transient UI state does not need to pollute project IndexedDB unless there is a clear product reason

---

# 16. DO NOT BREAK EXISTING SAFETY / STORAGE

Preserve:

- IndexedDB project cache
- stored directory handles
- safe relocation checks
- analysis configuration
- incremental refresh behavior
- sensitive file skipping
- max-entry safety
- dependency resolver behavior
- worker analysis
- PWA behavior
- Cloudflare Pages headers/build

No schema migration should be introduced unless necessary.

If a DB schema change is required, implement a safe Dexie migration and prove old project records still load.

Prefer avoiding a schema change for transient visualization state.

---

# 17. IMPLEMENTATION ORDER

Work in this order to minimize breakage.

## Phase A — Baseline

1. Read entire repo.
2. Run current tests/build before modifying if environment allows.
3. Record existing failures instead of blaming them on the new work.
4. Inspect all six reference images.

## Phase B — Shared graph state and P1 correctness fixes

1. Fix WebGL boundary.
2. Introduce 2D/3D mode state.
3. Introduce intentional expansion/reveal state.
4. Add exploration history.
5. Add relationship filter model.
6. Preserve backward compatibility.

## Phase C — 2D Map

Implement the approved 2D reference faithfully using real data.

Complete pan/zoom/focus/fit, labels, hierarchy/dependency filters, selection and expansion.

## Phase D — 3D redesign

Upgrade geometry/materials/labels/lighting while preserving the golden-angle circular staircase.

Improve deterministic collision spacing.

Add camera controls/focus/reset/fit.

## Phase E — File viewer

Implement safe on-demand file reads and Markdown/source preview.

Integrate it into Map, Structure, Search, Inspector, Dependencies and relevant Analytics links.

## Phase F — Remaining P1/P2/P3 UX

Complete:

- Structure interaction separation
- Search upgrade
- duplicate Analytics navigation cleanup
- truthful import wizard steps
- sidebar overflow disclosure
- inspector View All
- Analytics architectural insights
- smooth graph transitions

## Phase G — QA and documentation

Run all release gates and visually inspect changed screens.

Update repository documentation to match actual final behavior.

---

# 18. TEST REQUIREMENTS

Do not delete or weaken existing tests to get green results.

Add focused tests where logic can be tested without WebGL.

At minimum cover:

## Layout

- deterministic 2D positions
- deterministic 3D positions
- same input → same output
- children remain parent-relative
- 3D expansion has non-zero depth/vertical separation
- collision handling does not produce NaN/Infinity
- hard graph limit preserved

## Graph state

- mode switching preserves selection
- expanded nodes survive 2D/3D switching
- relationship mode behaves correctly
- navigation history Back/Forward
- no duplicate consecutive history entries

## File preview

- only indexed file nodes can be requested
- sensitive filename rejected
- invalid traversal rejected
- missing handle handled
- revoked permission handled
- missing file handled
- oversized file rejected
- unsupported/binary file rejected
- raw contents are not persisted

## Search

- exact beats prefix
- prefix beats fuzzy
- path matches work
- fuzzy results are deterministic

## Existing behavior

Ensure existing scanner/storage/dependency/relocation tests remain green.

---

# 19. REQUIRED COMMANDS / RELEASE GATES

Run from repository root:

```bash
npm ci
npm run lint
npm test
npm run build
```

Notes:

- `npm run lint` in this repository is TypeScript build/no-emit validation; do not pretend ESLint ran if it does not exist.
- Do not change Node requirement away from `>=22` without a compelling reason.
- If dependency installation cannot run due environment/network limits, state that exactly. Do not fabricate passing results.

If a local browser/dev server is available, run:

```bash
npm run dev
```

Then visually/interaction-test the application.

---

# 20. VISUAL QA MATRIX

Actually test these states if browser access is available.

## 2D

1. initial project root + top-level directories
2. expand one directory
3. expand multiple hierarchy levels
4. zoom in until file labels appear
5. zoom out
6. hierarchy-only mode
7. dependencies-only mode
8. both mode
9. selected/hover relationships
10. Fit / Reset / Focus / fullscreen

## 3D

Inspect the same expanded hierarchy from:

1. perspective/front
2. top
3. side
4. below
5. close drill-down on a directory

The structure must read as a real circular staircase in depth, not a flat disc.

Compare the **materials/style** to the five 3D reference images.

## Viewer

1. Markdown Preview
2. Markdown Source
3. TypeScript/JavaScript code
4. JSON/config file
5. blocked sensitive file
6. file missing from disk
7. permission lost
8. close viewer and return to same Map context

## Cross-navigation

1. Search → file
2. Search → directory
3. Analytics → file/dependency context
4. Dependencies → file
5. Inspector → View All
6. Back / Forward through several nodes

## Failure mode

Force/handle WebGL unavailability if practical and confirm 2D remains usable.

---

# 21. ACCEPTANCE CRITERIA

This upgrade is complete only when all of the following are true:

### Core design

- outside NEXUS shell remains consistent
- Graph is renamed Map where appropriate
- approved 2D design is implemented interactively
- 3D visual quality is substantially improved
- 3D circular staircase/golden-angle expansion remains recognizable
- 3D is genuinely spatial from front/top/side/bottom
- stars/background remain subtle

### Useful exploration

- directory hierarchy is immediately understandable
- dependencies can be toggled separately from hierarchy
- labels are useful without becoming clutter
- node focus is smooth
- Map has Fit/Reset/Focus/fullscreen
- file viewer opens real permitted files
- Markdown Preview/Source works
- code viewer works read-only
- Back/Forward exploration works

### All audit fixes

- P1.1 through P1.5 fixed
- P2.1 through P2.8 fixed
- P3.1 through P3.2 fixed

### Safety

- no source upload
- no backend introduced
- sensitive files remain blocked
- raw source not persisted in IndexedDB
- saved projects remain compatible
- scanner/storage/dependency logic remains correct

### Quality

- current tests still pass
- new relevant tests pass
- TypeScript validation passes
- production build passes
- no obvious console errors in tested browser flow
- no fake/decorative controls
- no reported test/browser result that was not actually executed

---

# 22. FINAL REPORT FORMAT

When finished, return a concise but complete report containing:

1. **Implemented** — what changed.
2. **Files changed/added** — grouped by purpose.
3. **2D Map** — implementation summary.
4. **3D Map** — how golden-angle staircase behavior was preserved and improved.
5. **File Viewer** — permissions, safety, supported content.
6. **P1/P2/P3 Audit Fixes** — mark every item fixed or explain any remaining blocker.
7. **Dependencies Added** — names and reasons; say none if none.
8. **Tests** — exact commands and pass/fail counts/results.
9. **Build** — exact result.
10. **Visual QA** — which angles/interactions were actually tested.
11. **Privacy/Compatibility** — confirm local-first behavior and existing saved-project compatibility.
12. **Remaining limitations** — do not hide them.

Do not say "production ready" unless the release gates above genuinely pass.

---

# FINAL PRODUCT PRINCIPLE

NEXUS is not trying to win by showing the prettiest collection of glowing shapes.

It should let a developer understand an unfamiliar repository spatially, follow relationships, descend through the hierarchy, inspect the actual file, and return to where they were with almost no friction.

Preserve what already works. Fix every P1–P3 issue. Implement the approved art faithfully. Keep the existing golden-angle circular 3D staircase as a signature NEXUS interaction.
