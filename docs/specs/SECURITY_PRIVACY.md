# Security and Privacy

- Local projects remain local by default.
- V1 is client-only; do not add server routes, cloud DBs, auth, Gemini API calls, upload endpoints, or telemetry just because the host supports them.
- No telemetry or analytics SDK is required for V1.
- Do not render project content as unsanitized HTML.
- Treat file names, relative paths, Markdown, JSON, and future imported NEXUS backups as untrusted data.
- Never execute code from the opened project.
- Never automatically follow symlinks outside the approved root if native/desktop support is added later.
- Do not claim or fabricate absolute local paths in browser V1.
- Known credential/key classes are metadata-only by default (`.env*`, private keys, keystores, etc.).
- Persist only compact metadata/indexes, serializable directory handles, and preferences. Never persist full raw source text.
- A stored directory handle does not equal permanent permission; permission recovery must remain explicit and user-initiated.
- Removing a project from NEXUS deletes NEXUS-local records only and never deletes the user's folder.
- Any future cloud/share/export feature must be opt-in and explicitly disclose exactly what leaves the machine.
- Never include machine-specific paths, personal project data, API keys, or secrets in the public repository/demo.
