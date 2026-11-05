# GEMINI — BINDING ROUND 1 BUILD CONTRACT FOR NEXUS

You are the first implementation agent for NEXUS. **Do not freestyle the product, invent capabilities, or hide incomplete work behind polished UI.** This starter contains locked product, architecture, privacy, and visual decisions.

## Current environment boundary

For this first AI Studio round, assume you can only inspect/edit the local project and run local commands such as dependency installation, tests, type checks, and production builds.

You do **not** currently have a GitHub repository, remote CI, emulator, browser automation, or a reliable real top-level Chromium session. Therefore:
- do not ask for or require an emulator;
- do not require screenshots or manual browser verification;
- do not create/push a repository or claim CI results;
- do not claim File System Access behavior has been manually verified if you cannot actually exercise it;
- leave browser-only acceptance items explicitly marked **UNVERIFIED IN ROUND 1** rather than guessing.

A repository and broader validation will be introduced after this first round.

## Mandatory reading order

1. `docs/design/NEXUS_FINAL_UI_REFERENCE.png`
2. `docs/design/REFERENCE_NOTES.md`
3. `docs/specs/PRODUCT_SPEC.md`
4. `docs/specs/DESIGN_SYSTEM.md`
5. `docs/specs/ARCHITECTURE.md`
6. `docs/specs/LOCAL_FILE_ACCESS.md`
7. `docs/specs/SECURITY_PRIVACY.md`
8. `docs/specs/DECISIONS.md`
9. `docs/specs/MILESTONES.md`
10. `docs/specs/ACCEPTANCE_TESTS.md`
11. `docs/specs/ROUND1_CHECKLIST.md`
12. `KNOWN_ISSUES.md`

## Non-negotiable product decisions

- Product name: **NEXUS**.
- Desktop/laptop only. Do not build phone UI.
- Web app + installable PWA.
- Local-first. Opening a project means **direct local directory access**, not uploading a ZIP or copying gigabytes into browser storage.
- The obsidian/purple reference is the locked visual direction. Preserve its restraint, hierarchy, typography, spacing, developer-tool feel, and project-explorer emphasis.
- The reference is not permission to fake absolute paths, ignored-folder sizes, native window controls, or dead controls. Read `REFERENCE_NOTES.md`.
- Fresh installs must not show fake personal recent projects. Keep one clearly labeled curated demo.
- V1 has no required AI API, account, multiplayer, backend, or cloud dependency.
- **AI Studio runtime availability is not a reason to add a backend. V1 is client-only.**
- Do not add features merely because they are easy.

## Engineering rules

- Keep graph/data engine independent from Three.js rendering.
- Never store full source files in IndexedDB. Store compact analysis/index data, serializable directory handles, and preferences only.
- Project identity must remain stable when the same stored directory is reopened. Node identity must remain stable for unchanged relative paths.
- Default-exclude generated/heavy folders before descent: `node_modules`, `.git`, build/dist outputs, Gradle/caches, coverage, vendor outputs, etc.
- Known sensitive files/keys are metadata-only by default.
- Binary/media assets are metadata-only unless a later explicit feature needs contents.
- Large source files have a read-size safety limit.
- Scanner work must be cancellable; recoverable per-file failures become warnings, not whole-project destruction.
- Do not promise `.gitignore` support until a tested implementation with real semantics exists.
- Long-running scanner/parser work moves to a Worker/bounded work queue in Milestone 2. Do not introduce unbounded `Promise.all()` over repositories.
- Never render thousands of graph nodes at once. Use progressive disclosure/focused visible subsets.
- Dependency graphs come from actual parsing/resolution. Never fake dependencies from hierarchy/proximity.
- Start dependency parsing with TypeScript/JavaScript only, behind a clean adapter interface.
- Use deterministic layouts/colors where practical.
- Structure is a real non-spatial explorer and accessibility/high-density fallback. It must not route to Dependencies.
- Search includes names + relative paths and must reveal a selected deep node plus its ancestor chain in Graph.
- No telemetry by default.

## Truthful-UI rule

Every visible control must be:
1. working;
2. deliberately disabled with a clear reason; or
3. omitted.

Do not leave decorative checkboxes, fake tabs, pretend shortcuts, fake project cards, fake graph modes, fake settings, or unsupported status badges.

## Round 1 workflow

Complete **Milestone 1 only**.

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm run build`.
4. Fix every install/type/test/build defect before new product work.
5. Review Milestone 1 code against the locked design and truthful-UI rule.
6. Improve/fix Milestone 1 only; do not start dependency parsing or later milestones.
7. Add/adjust deterministic unit tests for code paths you change where practical.
8. Re-run `npm test` and `npm run build`.
9. Update `KNOWN_ISSUES.md` only with real remaining gaps.
10. Stop and report:
   - files/areas changed;
   - final test result;
   - final build result;
   - anything still unverified because it requires a real Chromium session;
   - remaining known issues.

Do **not** claim browser-only flows are verified merely because code compiles. Do **not** start AI, backend, cloud sync, accounts, collaboration, mobile, Git integration, dependency parsing, or later roadmap scope.
