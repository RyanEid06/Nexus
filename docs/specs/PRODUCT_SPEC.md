# NEXUS V1 Product Specification

## Product statement

NEXUS transforms a local software project into an interactive spatial map so a developer can understand **what exists, where it lives, how large it is, and how important parts connect** without digging through endless directory trees.

## Primary user

A developer or computer-science student opening an unfamiliar or personally maintained repository on a laptop/desktop.

## Core jobs to be done

1. Understand a repository's structure quickly.
2. Find large/important areas of a project.
3. See language/file composition and physical analyzed line counts.
4. Search and focus on files/folders spatially.
5. Understand real module dependencies.
6. Reopen a cached project immediately and refresh it without rereading unchanged source unnecessarily.

## Core views — locked meaning

### Projects
Shows **real locally cached NEXUS indexes only**, plus `Open Local Project` and one clearly labeled curated demo. Do not seed a fresh install with fake user projects.

A saved local project can be in these logical states:
- **Cached / connected:** index exists and directory permission is usable.
- **Cached / permission required:** index can still be viewed; refresh requires a user gesture to reconnect/request permission.
- **Cached / folder unavailable:** cached index can still be viewed; user may locate/reopen the folder or remove the NEXUS index.

Removing a project from NEXUS deletes NEXUS metadata/handle references only. It must never delete the user's source directory.

### Import / analysis setup
The user chooses one local directory. The UI distinguishes:
- **Indexing metadata:** all non-excluded entries can appear in structure.
- **Analyzing contents:** only supported text/source/config/doc/test files selected for analysis are read under safety limits.
- **Metadata-only files:** media/binary/disabled-category files remain represented without reading contents.
- **Sensitive files:** known secrets/keys such as `.env`, `.pem`, `.key`, keystores are metadata-only by default.

Hard generated/dependency/cache directories are excluded **before descent**.

### Graph
Flagship 3D **repository hierarchy**. Root is dominant; top-level areas are stable colored clusters; deeper files/folders reveal progressively. Graph is useful before decorative.

Spatial semantics:
- distance/branching = structural relationship;
- cluster color = deterministic top-level project area;
- node size = node role/significance, not random decoration;
- edges in Graph = hierarchy only;
- glow = selection/focus, not every node;
- labels = root/top-level/selected/hovered as appropriate, never hundreds at once.

### Structure
Non-spatial deterministic repository explorer (tree/table). This is the accessible/high-density alternative to the 3D graph and must not route to Dependencies.

### Inspector
Selecting a node shows **relative path**, type, recursive indexed size, recursive analyzed physical lines, descendant file/folder counts, direct children, language/content-analysis state where relevant. Never fake absolute paths.

### Analytics
Project totals, analyzed-vs-indexed distinction, language composition, largest indexed files/folders, skip/warning summary, and later deterministic dependency/Git signals.

### Dependencies
Only real parsed relationships. Start with TypeScript/JavaScript. Initial contract:
- static `import ... from` / side-effect imports;
- `export ... from`;
- dynamic `import()`;
- CommonJS `require()`;
- relative path resolution for supported TS/JS extensions and `index.*`;
- practical `tsconfig.json` / `jsconfig.json` alias support when implemented;
- external packages are represented as external references, never expanded by traversing `node_modules`.

No proximity/folder-based fake dependency edges.

### Search
Search indexed **name + relative path**. Rank exact filename > filename prefix > filename contains > path contains. Empty query shows an instructional empty state, not arbitrary first files. Choosing a result reveals the selected node and its ancestor chain in Graph.

### Settings
Expose only real behavior. Initial settings: analysis read-size limit and reduced visual effects. Avoid a theme playground.

## Data terminology

- **Indexed size:** sum of indexed file metadata sizes. Excluded directories are not traversed and are not part of this total.
- **Analyzed text bytes:** bytes of text files actually read for analysis.
- **Lines / LOC in V1:** physical lines in supported analyzed text files. This is not semantic SLOC and must not be presented as such.

## Explicitly outside V1

- Mobile UI.
- Required AI/chat assistant.
- Cloud source-code storage.
- Mandatory login.
- Realtime collaboration.
- Public social features.
- Generic task/note/project management.
- Native-grade Git/file watching guarantees in a pure browser.

## Success bar

A developer should be able to open a real repository, understand its top-level organization within seconds, inspect accurate local metrics, search it, and later understand parsed dependencies while the source remains on-device and the experience stays smooth.
