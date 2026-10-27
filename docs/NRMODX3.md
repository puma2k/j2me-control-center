# NRMod x3 runtime profile and controls

Local target: SHA-256 `2618def297f0c3976d468100ce9bf59b1ef0cfd5165f2f74476b7321b792c664`. Recognition uses the exact uploaded JAR hash, not a user-controlled display name. The game and decompiled source are not included in the repository changes.

## Verified from the supplied local bytecode/decompilation

The manifest exposes three DragonBoyLocal slots, version 2.3.7, behind Advance Menu 3.6.3. The wrapper intercepts key 42 (`*`): a hold beyond its 500 ms wait opens the wrapper menu; a shorter press/release forwards star to the selected game. Directional keys, OK, softkeys, digits, star and hash are handled by all three corresponding Canvas classes. Number-key functions depend on the active game screen; no unverified automation/healing labels are assigned.

## Dedicated keyboard

The instance detail shows a dedicated panel only for this exact JAR. Ordinary typing is unchanged, including chat/password input. Alt + arrows moves, Alt + Enter confirms, Alt + Q/E sends the left/right softkey, Alt + 0–9 sends the matching game digit, Alt + comma/period sends star/hash, and Alt + B sends Back. The switch-slot button sends a 650 ms star hold. It does not log in or select a slot automatically. Shortcuts are disabled while asleep/disconnected/stopped and do not operate in dashboard form fields. AltGraph, IME composition and mixed browser modifier chords are excluded. Held keys release on blur, hidden tab, profile unmount and runtime state changes.

The existing gamepad remains available for touch input. The profile sends only to its current instance even when broadcast is selected. No per-account action is automated.

## Performance constraints

Keep the game and stream targets at 60 FPS, the existing C1/SerialGC/native allocator optimizations, and idle frame unsubscribe. Start with the existing 128 MiB heap ceiling; do not lower it solely from launcher measurements. Multiple loaded slots can retain independent resources within the same JVM. Record actual heap/RSS at the launcher and after selecting a game before claiming a game-specific saving.

## Local verification (2026-10-26)

The exact supplied JAR was uploaded and started at 240×320, Nokia profile, 128 MiB maximum heap and 60 game/stream FPS. Launcher observation: approximately 50.3 MiB mean JVM RSS. After launching slot 1: approximately 85.0 MiB RSS, roughly 16 MiB used heap, and 640 received frames across approximately 10 seconds (not a gameplay guarantee). The language selection screen visibly reported game FPS around 54–56 in two screenshots, so configured 60 is a target, not proof of sustained in-game 60. No account was submitted.

A 650 ms star hold returned the running game to the three-slot wrapper menu; this was visually verified from a native PNG capture. All 28 unit tests and 10 browser/integration tests passed; after adding touch action buttons, the focused controls browser test passed again, including click press/release. Typecheck, lint and production Docker rebuild passed. Browser automation of the user's in-app tab was denied by policy; functional UI controls were tested in the isolated harness, and game visuals were checked through the emulator screenshot API. No further heap reduction or additional memory-saving percentage is claimed; the existing optimized runtime settings are retained.

Final rebuilt-image sample while the slot-1 language screen was visible: mean JVM RSS 89.2 MiB, 605 stream frames in approximately 10 seconds, whole-container CPU 40.8% of one core. These are warm-up/menu observations, not map benchmarks. The language selector was then tapped and the server selection screen was visually verified, without selecting a server or submitting credentials. Raw data: evidence/nrmod-final.json.

## Local farming progress

The optional Farming progress panel reads only numeric counters from this fingerprinted build. Locally decoded overlay `c.g` labels character field `i:J` as gold and `e:J` as power. Static self-typed fields `b` and `c` on `a.av`, `b.a.av`, `c.a.av` hold the player and disciple respectively. Reflection matches field name **and descriptor**, because the obfuscated classes reuse field names with different types. It never calls singleton getters that could create a character.

The Java 8 monitor checks that each class is already loaded and initialized, then samples existing objects every five seconds. It does not load an unused game slot, send packets, inspect credentials, mutate game fields, force GC or change the supplied JAR. Numeric snapshots are atomically written to local per-instance `progress.json`; the authenticated API returns them only for the current running JVM and rejects stale snapshots. All three slots are sampled independently, even without frame viewers.

Counters remain decimal strings across Java/JSON and use BigInt differences/rates in the browser. Gold statistics are **net balance change**, including spending and transfers; they are not verified loot income. Disciple figures use the most recent client-side power value; if the server has not sent disciple data, open the game's disciple information yourself. No automatic refresh packets are sent. Missing data is unavailable, not zero. Rates use the sampling interval since each baseline; the first second has no rate. Hiding the panel stops its HTTP polling but not JVM collection. Each browser remembers panel visibility for each instance.

Reset clears only tracking baselines for all three slots, without changing game fields, RMS or configuration. JVM restarts start a new tracking session. Changes to character identity or loss of available character data rebase that slot; pet identity changes or power dropping below its baseline rebase its own power counters. Statistics are session-only and are not exported as RMS saves. Private snapshots are not published.

Verification includes a synthetic Java fixture with real reflection and atomic snapshot output: unloaded/uninitialized classes stay untouched, initial/updated gold, reset, missing pet and missing character. UI tests use explicitly synthetic values to check signed hourly rates, integers above 2^53, show/hide and reset. Real logged-in balances have not been compared against an account in this session; no login credentials were submitted.

The real supplied JAR produced fresh three-slot waiting snapshots through the authenticated API, and its reset endpoint returned success. This confirms collection/transport when no character is loaded, not correctness against a logged-in account balance.

### Progress presentation and export

The panel shows ready-slot count, a live/delayed status and separate slot cards with tabular numeric values. A sample older than 15 seconds or an HTTP failure hides hourly rates until fresh data arrives; the last balance remains timestamped. Reset requires an explicit second click and can be canceled. Hiding the panel cancels a pending reset confirmation. CSV exports the current sampled counters and net rates as exact decimal strings, without credentials, character names or game actions. Delayed snapshots export blank rate cells. The snapshot is not a historical ledger. Browser verification checks reset cancel/confirm, exact CSV bytes, show/hide, mobile visibility and delayed-data behavior.
