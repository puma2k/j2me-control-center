# Responsive workspace refinement

Updated 2026-10-27. Scope: the existing React dashboard, in English, for desktop and mobile browsers.

## Design choices

Retain the existing navy surfaces and mint accent. On desktop keep the sidebar and separate viewer/control columns; on phones use five labeled bottom navigation destinations and full-width content. Present the same instance table data as labeled cards on phones, with larger actions. Keep direct typing, the 60 FPS target, idle streaming and runtime configuration unchanged.

Put play controls before optional farming analytics. Make form fields 16px on phones to avoid input zoom, use at least 44px mobile action targets, respect safe-area insets, and keep toast messages above navigation. Provide focus outlines, a skip link, and dialog focus cycling / Escape / focus restoration. Keep API documentation accessible from Settings on phones.

## Verification and limits

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 29 passed.
- `npm run build`: passed; frontend JS 95.03 kB gzip, CSS 6.16 kB gzip.
- Existing saved screenshots informed the changes. They are historical references, not evidence of this version.
- Live browser access was previously rejected by browser security policy. No alternate browser, CDP, or Playwright CLI was used to bypass that restriction. Fresh visual comparisons, touch behavior, and dialog interaction tests remain unverified on real devices.
- Responsive breakpoints were reviewed in source for narrow phones, tablets and desktop. This is not a claim of a completed visual or accessibility audit.

## Compact follow-up

Removed the page eyebrow, marketing subtitle, repeated keyboard hint and footer. Shortened Overview and game control labels. Stream tuning, stream diagnostics, keyboard shortcuts and statistics explanations now use disclosure controls. Status, errors, stale-data warnings and all game actions remain available. This follow-up passed typecheck, formatting and production build; browser interaction / screenshot verification remains blocked as described above.

## Desktop workflow follow-up

- Entry opens Instances, so the primary task is launching or opening a game rather than scanning server metrics.
- A persistent desktop instance bar provides a named switcher, status, Start/Stop and Restart. Switching instances opens Play.
- Play, Settings & saves, and Logs are separate views. Save import/export and deletion stay under Settings & saves; configuration and runtime logs no longer extend the playing page.
- Leaving Play removes frame subscriptions and input targets, including broadcast targets. The keyboard listener releases held keys when the view changes. Log polling runs only in Logs.
- Instance rows have an explicit Open action. Empty search results provide Clear search.
- Verified: 31 unit/API tests, typecheck, formatting, frontend/server production build. Two flow tests cover absence of background input/stream targets and explicit broadcast selection. No fresh browser visual/interaction verification was possible due to the existing browser policy block.

## Input affordances

Direct game typing now has a visible, clickable field below the image and an active typing state, with a separate Done / Open keyboard action. The existing sentinel, composition handling and immediate game delivery remain in place; input focus and click restore the sentinel caret position. This field is a live input bridge rather than a second stored draft; text appears in the game's selected field.

Form controls have a consistent 44px minimum height, full-width configuration fields, clearer labels and placeholder contrast. Raw key-mapping JSON is under Advanced keyboard mapping, and disabled instance configuration explains that the game must be stopped. Typecheck, formatting and production build passed. Live keyboard, IME, touch and visual verification remain unavailable under the browser policy restriction.

## Native TextBox editor

The supplied screenshot identified the native MIDP TextBox character-picker screen, not just the dashboard's keyboard trigger. Added a real HTML editor while a native TextBox is active: current text, selection, paste, Unicode composition, password masking and explicit Confirm. Changes replace the active TextBox through a token-checked event-queue operation; ordinary Canvas games retain direct input. Native Form/TextField overlay support is not included.

Reference patterns: PlayCanvas text input tutorial (https://developer.playcanvas.com/tutorials/ui-text-input/) uses HTML input alongside rendered game UI; CheerpJ input-method configuration (https://cheerpj.com/docs/reference/cheerpjInit.html) supports platform input methods. These informed the browser editor, without adding either runtime.

The supplied image contained old button/help text absent from the currently served bundle. HTML now uses no-store to reduce stale document reuse; an already-open page still needs a reload. No claim is made about the exact cause of that screenshot mismatch.

Verification: 31 unit/API tests; Java fixture verifies detection, Unicode replacement, stale token rejection and command confirmation. Adapter fixture verifies the stdout protocol, empty replacement, raw frame capture and absence of editor protocol payloads from runtime logs. No browser visual/IME verification was possible under the existing browser restriction.

## Mobile control card (user reference, 2026-10-29)

Reorganized the instance mobile view around one light game/control card, with a compact live toolbar, Fit / Focus view, soft actions, an eight-direction pad and an adjacent numeric pad. Native portrait/landscape game dimensions are preserved; Fit changes presentation only. It does not rotate the game or change its runtime resolution. Buttons use supported MIDP key names rather than unverified game-specific skill labels.

The directional pad owns chords per pointer. Overlapping touches retain shared directions until the last owner releases; cancel, lost capture, blur, hiding the tab and disabling controls release held keys. Mobile input focus remains explicit after the separate touch-keyboard fix.

Desktop controls remain available. Statistics, slot switching and advanced controls follow the mobile pad. Fresh checks: 32 unit/API tests, typecheck, formatting and production build passed. Visual comparison / real-device interaction remains unverified. Production deployment awaits the server address and project directory from the user.

## Native input regression investigation

The native emulator List had no pointer handlers, explaining why tapping the AngelChip launcher row did nothing even when the web pointer path delivered events. Added hit regions based on the rendered list page, activation on matching press/release, drag cancellation and command-bar taps. Extended the native editor to focused Form TextFields, including constraints and state-change notification.

Removing the persistent typing bar also removed mobile's explicit focus target for custom Canvas fields. Added a compact Keyboard action in the viewer toolbar for that fallback. Touching the game itself still does not focus the hidden typing capture, and the removed typing bar remains absent.

The Docker adapter regression fixture exercises a real JVM: TextBox replacement, empty replacement, stale token rejection, raw frames, Unicode Form editing and pointer activation of the second native List row. This does not replace real phone/browser testing.
