# J2ME Control Center design

Build a private, self-hosted game control center from the supplied TASKS.md. The user requests autonomous execution without clarification. Use one Fastify service serving a React SPA, SQLite WAL metadata, and one child JVM/Xvfb pair per instance. Run the container as a non-root user with no Docker socket. Localhost is the default bind. Game code is trusted operator input: shared-container JVMs are not a hostile-code security boundary.

Pin FreeJ2ME-Plus baca76a4dda6f30abac67fb4a3db009eed05f91c. Verify build.xml rather than README artifact names. Prototype a small GPL bridge that uses MobilePlatform input and framebuffer directly; Xvfb remains private for AWT compatibility. This avoids brittle desktop cropping and key focus. No runtime network listeners. Commands travel over child stdin; frames are atomic files written only on request.

REST handles library/lifecycle/config/auth. Auth uses hashed password and opaque expiring sessions in SQLite, HttpOnly SameSite cookies, Origin checks, rate limits. WS upgrades require session and same-origin. Per-connection pressed-key ownership prevents one viewer from releasing another's held keys. Bounded frames, sequential capture, viewer-only demand, slow-client drops. SQLite holds games, instances, settings, events, users and sessions with schema version migrations.

Ship an original MIDlet test game with visible key counter and RMS counter. Validate upload corruption, duplicate files, hostile paths, quotas, lifecycle races, WS authentication/disconnect, true frames and five JVMs. Benchmark only measured results. 24h soak, public hosting and remote worker scale are separate validation gates; never mark them passed without evidence.
