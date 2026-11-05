# Round 1 AI Studio Checklist

This checklist is intentionally limited to what the current first-round environment can truthfully verify.

## Required before stopping

- `npm install` completes successfully.
- A lockfile is generated/updated if npm is used.
- `npm test` passes.
- `npm run build` passes.
- No TypeScript/build errors are ignored.
- No visible inert controls are knowingly introduced.
- Curated demo remains clearly synthetic.
- Fresh source contains no fake personal recent-project cards.
- No backend/server/auth/cloud dependency is introduced.
- No raw source-upload workflow is introduced.
- No secrets, API keys, absolute machine-specific paths, personal project data, `node_modules`, build output, or copied user repositories are added to source control/package output.
- `KNOWN_ISSUES.md` is updated only for genuine remaining gaps.

## Explicitly NOT required in Round 1

The current AI Studio round does not have to perform or claim:

- emulator/device testing;
- GitHub/repository/CI operations;
- screenshots;
- browser automation;
- manual top-level Chromium folder-picker testing;
- manual IndexedDB permission/reconnect testing.

Those browser-only acceptance checks remain valid product requirements in `ACCEPTANCE_TESTS.md`, but must be reported as **UNVERIFIED IN ROUND 1** until a capable environment is available.
