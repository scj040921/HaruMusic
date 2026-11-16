# 0.1.13 verification scope

Confirmed issues fixed in this iteration:

1. Frozen media time was treated as playback progress on every `timeupdate`; each repeated `waiting`/`stalled` restarted the recovery timeout. The watchdog now follows real media progress and handles pause, background event throttling, errors and completion explicitly.
2. Manual source switching paused the old stream before resolution and captured its position too early. Resolution now preserves old audio; the live clock and pause state are sampled at replacement commit.
3. Mobile playback controls still read the lyric singleton during restore. Both native shells now use player-store state.
4. Body-teleported playback settings were outside the parent drawer's focus scope. The sheet now renders within the player, traps Tab, supports Escape and restores focus. A dismiss stack handles native Back before player navigation; the queue receives priority too.
5. Mobile lyric scrolling reset velocity on each line, even mid-transition. Targets can now change without restarting the spring; touch, visibility and reduced-motion behavior remain interruptible.
6. Desktop API startup used a separate probe and reported success before the actual listener bound. Startup now awaits the real listener, retries occupied loopback ports, commits the bound port, and only then creates the renderer. Real Electron acceptance deliberately occupies the configured port and verifies that the selected API is listening before UI requests.
7. Tab dragging performed one bounding-box read per tab per pointer move. Geometry is now captured at gesture start; resize cancels the gesture. Narrow-screen navigation hit areas were enlarged by removing inter-tab gaps.

Validation: 167 tests across 26 suites; production build; actual Electron startup with an occupied API port; node/web type checks; i18n check; embedded API, range forwarding and cancellation smoke checks. Browser-renderer checks cover edge-to-edge layout on five routes, touch and pointer gestures, zero tab geometry reads during movement, 44px targets at 320px, floating sheet bounds, focus cycling, Escape/focus restoration, the native-Back dismiss path and lyric interactions. Screenshot artifacts are under `artifacts/ui-0.1.13` locally.

Physical-device networking, every third-party song, vendor system-bar composition and an Android hardware Back press are not established by these checks. The Back stack path is exercised in the browser renderer; native APK compilation is checked by the release workflow.
