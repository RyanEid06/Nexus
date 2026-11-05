# Local Project Access

## Required model

`Open Local Project` uses the desktop browser's directory picker in supported Chromium browsers. The user explicitly grants access to one directory.

NEXUS then:

1. Traverses entries locally.
2. Applies hard exclusion rules before descending into known heavy/generated directories.
3. Reads file metadata.
4. Reads text only for supported, enabled, non-sensitive files under a safety size limit.
5. Extracts physical line counts and later dependencies.
6. Discards raw text after analysis.
7. Stores only compact index records plus the serializable directory handle in IndexedDB.

## Browser reality

- The browser does **not** expose an arbitrary absolute path such as `C:\\Users\\...`; use the directory name and relative paths.
- A stored directory handle can survive in IndexedDB, but permission may later be `prompt`/`denied`. Cached index viewing and filesystem refresh are separate concerns.
- Directory picking requires a user gesture and compatible secure/top-level browser context. Embedded previews are not the source of truth for filesystem validation.
- V1 may explicitly support Chromium desktop. Unsupported browsers get a compatibility message; no ZIP-upload fallback is added merely for browser parity.

## Never do this

- Do not create a hidden upload endpoint.
- Do not ask the user to ZIP a multi-GB repository for normal use.
- Do not Base64 source files into localStorage.
- Do not store full repository contents in IndexedDB.
- Do not traverse ignored folders merely to show vanity disk-size numbers.
- Do not claim ignored-folder byte sizes unless obtained without recursive traversal.

## Safety limits

Foundation defaults:
- Maximum indexed entries: 50,000.
- Maximum text file read for analysis: 2 MiB per file (preference may change this within sane bounds).
- Generated/dependency/cache directories excluded before traversal.
- Known sensitive files are metadata-only by default.

## Ignore rules decision

Hard safety exclusions are mandatory and always apply. **Do not ship a naive `.gitignore` parser.** Proper `.gitignore` semantics may be added in Milestone 2 using a tested implementation; until then, the UI must not claim full `.gitignore` support.

## Persistence / origin

IndexedDB and stored handles are origin-scoped. `localhost`, an AI Studio preview, and the final production domain are separate stores. Use a stable production origin before relying on long-term cached project history.
