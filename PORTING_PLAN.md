# PORTING_PLAN.md

Migration plan: **Deck Progress Tracker** (Decky Loader plugin) → **Library Tracker for Millennium** (native Millennium plugin)

Status: **Phase 2 deliverable — awaiting approval before implementation begins.**

---

## 1. Overview of Deck Progress Tracker

Deck Progress Tracker is a Decky Loader plugin (Python backend + React/TS frontend) that automatically tags every game in a user's Steam library with one of five progress states — **Mastered, Completed, In Progress, Dropped, Backlog** — computed from achievement completion %, playtime, last-played date, and HowLongToBeat (HLTB) "main story" hours. Tags can be manually overridden. A badge is injected into the game-detail page header, and a full dashboard (tag-grouped game lists, sync controls, library stats) is rendered in the Quick Access Menu.

### Tag logic (priority order, highest wins)
1. **Mastered** — unlocked/total achievements ≥ 85% (only if the game has achievements).
2. **Completed** — playtime ≥ HLTB main-story hours × 60.
3. **Dropped** — not played in 365+ days (only evaluated if not Mastered/Completed).
4. **In Progress** — playtime ≥ configurable threshold (default 30 min).
5. **Backlog** — none of the above; not a stored row, just "no tag."

Manual overrides set `is_manual=1` and are skipped by auto-calculation until reset.

### Architecture (as built)
- **Frontend is the primary data source.** It reads Steam's live in-memory state — `window.appStore`, `window.SteamClient.Apps.GetMyAchievementsForApp`, `window.appAchievementProgressCache`, `window.collectionStore` — and pushes playtime/achievement snapshots to the Python backend per game. The backend does **not** poll the Steam Web API in normal operation (no API key configured by default); it only persists what the frontend supplies, calculates tags, and does local-file fallback discovery (VDF parsing) when needed.
- **Backend (`main.py` + `py_modules/`)**: a Decky `Plugin` class exposing ~15 async RPC methods (`get_game_tag`, `set_manual_tag`, `sync_single_game_with_data`, `get_tag_statistics`, `get_all_tags_with_names`, `get_backlog_games`, `check_dropped_games`, etc.), backed by SQLite (`game_tags`, `game_stats`, `hltb_cache`, `settings` tables, plain `sqlite3` wrapped in `asyncio.to_thread`). A background asyncio task sweeps for "dropped" games every 24h. HLTB integration reimplements HLTB's internal `/api/finder` search directly with `urllib` (SSL verification disabled), fuzzy-matched via `difflib.SequenceMatcher` (≥0.7 similarity), cached with a TTL that is read from settings but not actually wired to the cache-read call (hardcoded 7200s — a known bug). Steam library discovery falls back to a hand-rolled VDF text parser and a binary `shortcuts.vdf` parser for non-Steam games, both Linux-path-hardcoded (`~/.steam/steam`, `/home/deck/.steam/steam` — no Windows/macOS support).
- **Frontend (`src/`)**: `definePlugin` entrypoint patches `/library/app/:appid` via Decky's `routerHook.addPatch` + React-tree-walking utilities (`findInReactTree`, `afterPatch`) to inject a `GameTagBadge` into the game header — explicitly modeled on the "ProtonDB Badges" plugin's safe-patching pattern. A `Settings.tsx` QAM panel renders the tag-grouped dashboard and sync button. An achievement-cache watcher polls `window.location.href` for navigation to a game's achievements tab and triggers a per-game sync. No global state library — manual `useState`/`useEffect` + `setInterval` polling.
- **Dependencies**: `@decky/api`, `@decky/ui` on the frontend. Notably, all three declared Python dependencies (`howlongtobeatpy`, `aiosqlite`, `vdf`) are **unused dead weight** — the actual implementation is Python-stdlib-only (`sqlite3`, `asyncio`, `urllib.request`, `difflib`, `re`, `pathlib`).

### Known quirks to consciously fix, not carry over
- `cache_ttl` setting isn't actually wired into the HLTB cache TTL read (hardcoded 7200s regardless of setting value).
- `mastered_multiplier` setting exists in frontend types/defaults but has zero effect (Mastered is hardcoded 85%).
- `auto_tag_enabled` setting is stored but never checked anywhere.
- No settings-editing UI is actually rendered, despite an `update_settings` RPC existing.
- HLTB scraping disables SSL certificate verification entirely.
- Two parallel single-game sync code paths exist in the backend (legacy vs. current); should be consolidated.
- Linux-only filesystem assumptions throughout (`steam_data.py`) — irrelevant for the port since the frontend-data-first approach below avoids needing local VDF parsing at all in the common case.

---

## 2. Overview of Millennium architecture

Millennium is a native C++ host that injects into the Steam client, speaks Chrome DevTools Protocol to Steam's own embedded CEF browser, and repurposes Valve's internal `SharedJSContext` frame as the runtime for all plugin/theme JS. Two coexisting plugin generations exist:

| | v1 (legacy, loose files) | v2 (current, `.star`-packed) |
|---|---|---|
| Manifest | `plugin.json` | `millennium.toml` |
| Build tool | `@steambrew/ttc` (`millennium-ttc`, Rollup) | `starlight` (Rust/rolldown) |
| Output | loose `.millennium/Dist/{index,webkit}.js` | single packed `<id>.star` |
| Tooling | build-only | build + live hot-reload + LSP type install + signing |

**This plan targets v2 (`starlight`/`millennium.toml`)** since it is the actively developed path with live dev-reload, editor autocomplete, and packaging as first-class features — v1 offers nothing v2 doesn't.

### Critical fact: Python backends are dead
Millennium's plugin loader hard-codes a rejection of any plugin without `"backendType": "lua"` in its manifest — Python backend support was removed. **This is a full backend rewrite from Python to Lua (LuaJIT), not a transpile.** Each plugin backend runs as its own isolated OS child process (crash-contained, unlike a shared loader process), communicating with the C++ core over a local socket using an `EVALUATE`/`INIT`/`ON_FRONTEND_LOADED`/`SHUTDOWN` RPC protocol.

### Backend (Lua) contract
`backend/main.lua` returns a table with optional lifecycle hooks `on_load`, `on_frontend_loaded`, `on_unload` (no `_migration` equivalent — reimplement via `on_load` + version-checked config). Any other function on that table, or any bare global function, becomes callable from the frontend. Preloaded native modules: `json` (cjson), `millennium` (core API + built-in settings store + assets), `http` (libcurl client), `utils` (string/table/math/random/env/shell-exec/hash/uuid helpers), `logger`, `fs` (full filesystem API), `regex`, `datetime`. No LuaRocks/package manager — only this fixed native surface plus your own hand-written Lua modules.

### Frontend contract
`frontend/index.tsx` default-exports the result of `definePlugin(() => ({ title, icon, content, onDismount? }))` — structurally near-identical to Decky's `definePlugin`. Steam's own React/ReactDOM/JSX-runtime are detected at runtime and aliased at build time (`window.SP_REACT` etc.) — **plugins never bundle React**. The SDK re-implements Decky-familiar UI primitives (`PanelSection`, `PanelSectionRow`, `ButtonItem`, `ToggleField`, `DialogButton`, `Focusable`, `Toast`, etc.) and exposes a far more thoroughly-typed `SteamClient` global than Decky does. An optional second bundle, `webkit/index.tsx`, runs in an isolated CDP world on ordinary Steam web pages (store/community) — separate from the main React tree, and **cannot share code/imports** with `frontend/` (build-time-enforced).

### IPC
Frontend→backend: `callable<Params, Return>('funcName')` or `ffi<Params, Return>('funcName')`, compiler-auto-injects the plugin name. Backend→frontend: `millennium.call_frontend_method(name, args)`, invoking a function the frontend registered via the build's auto-generated `exports` object. Only string/number/boolean/table(JSON) cross the boundary.

### Settings/config
Built-in, limit-enforced (256 keys, 512B key length, 256KB value size), auto-persisting key/value store: `millennium.config.get/set/delete/get_all/on_change` (Lua) and `pluginConfig.get/set/delete/getAll` + `usePluginConfig()` React hook (frontend) — writes from **either** side push live updates to **both** sides automatically. This replaces Deck Progress Tracker's hand-rolled SQLite `settings` table with zero extra plumbing.

### What Millennium has that Decky doesn't (relevant here)
Per-plugin process isolation + crash modal UI, built-in reactive config store, raw typed CDP access, a separate `webkit` injection surface for web-page content, compiler-injected plugin-name argument passing, live dev-mode hot-restart, optional code signing/obfuscation.

### What Decky has that Millennium doesn't
Python and its package ecosystem (no equivalent — full rewrite required), a `_migration()` lifecycle hook.

---

## 3. Reference Millennium plugins studied

| Plugin | PluginDatabase name | Relevance |
|---|---|---|
| [SteamHunter-plugin](https://github.com/BossSloth/SteamHunter-plugin) | `achievement-groups` | **Primary reference.** Injects a native tab into Steam's own achievements popup; merges Steam's internal achievement API with a 3rd-party community-stats API; zustand-based settings; localStorage caching. |
| [hltb-millennium-plugin](https://github.com/jcdoll/hltb-millennium-plugin) | `hltb-for-millennium` | **HLTB integration template.** Backend-only disk-persisted cache (stale-while-revalidate, 12h soft / 90d hard TTL), Levenshtein fuzzy matching, self-healing HLTB endpoint-discovery (HLTB has no stable API and rotates endpoints), separate `webkit` module for store-page injection. |
| [steam-librarian](https://github.com/luthor112/steam-librarian) | `steam-librarian` | Generic library/game-page DOM patterns; `Millennium.AddWindowCreateHook` dispatch across many popup types (main window, tray menu, Properties dialog); broad `SteamClient.*` namespace usage (Downloads, Console, User). |

### Key architectural findings that directly shape this plan

**Achievement data comes from Steam's own internal client API, not the Web API.** `SteamClient.Apps.GetMyAchievementsForApp(appId)` returns the authoritative per-user unlock state (`rgAchievements[]` with `bAchieved`, `rtUnlocked`, etc.) with no API key and no network round-trip through the backend — exactly what Deck Progress Tracker's frontend already does via the same global. `SteamClient.GameSessions.RegisterForAchievementNotification(cb)` gives real-time unlock push notifications, which Deck Progress Tracker's Decky version doesn't have (it only polls).

**UI injection has three tiers**, in increasing depth of integration:
1. **DOM-only injection + MutationObserver** — append plain HTML into a located container. Safest, most decoupled, doesn't participate in Steam's React layout/theming.
2. **`react/jsx-runtime` monkey-patching** (SteamHunter's tab-injection technique) — intercepts every `jsx()`/`jsxs()` call, and when props match a known component signature, splices in new content as a first-class participant in Steam's own component tree. Most powerful, most fragile (broke across a Steam React-19 upgrade; requires a self-healing re-patch interval).
3. **Router-hook patching** (`routerHook.addPatch(route, fn)`) — the same mechanism Deck Progress Tracker's Decky version already uses via `@decky/ui`'s `routerHook`; Millennium's SDK exports an equivalent.

For the game-detail badge, technique #3 (route patch, closest to what the Decky version already does) is the direct port target. For achievement-tab-style deep integration (optional future milestone), technique #2 is the SteamHunter-proven approach.

**HLTB caching should live entirely in the Lua backend**, not the frontend — `hltb-millennium-plugin`'s explicit design principle ("backend is the single source of truth for all caching, no client-side cache state") avoids the localStorage-isn't-visible-to-webkit problem and survives differently from a per-context cache. Their merge-on-write strategy (never let a transient bad fetch overwrite a previously-known-good field) and endpoint-rotation self-healing are both directly reusable patterns.

**Millennium's built-in `pluginConfig`/`millennium.config` should replace Deck Progress Tracker's hand-rolled SQLite settings table** — all three reference plugins that need cross-context settings sync (hltb-plugin) hand-rolled a JSON-file + RPC approach specifically because they judged Millennium's built-in settings API "undocumented and possibly unreliable on the Lua side" — but that assessment is from plugins built during v1/early Lua-host days. Since our research of the current Millennium source confirms `millennium.config.*` is now a complete, tested, auto-syncing native API, we will use it directly rather than replicate their workaround, unless implementation testing in Phase 3 reveals it's unreliable — in which case we fall back to the same hand-rolled JSON pattern as a documented contingency.

---

## 4. Feature comparison & Decky → Millennium API mapping

| Deck Progress Tracker feature | Decky API used | Millennium replacement |
|---|---|---|
| Plugin registration, QAM panel | `definePlugin` (`@decky/api`) | `definePlugin` (`'millennium'` SDK) — near-identical shape |
| Game-detail badge injection | `routerHook.addPatch('/library/app/:appid', ...)`, `findInReactTree`, `afterPatch` (`@decky/ui`) | `routerHook.addPatch(...)` (Millennium SDK exports the same hook) |
| Frontend→backend RPC | `call()` (`@decky/api`) | `callable<Params, Return>('funcName')` / `ffi(...)` |
| Backend RPC methods | Python `Plugin` class async methods | Lua table returned from `main.lua`, bare functions or `table:method` |
| Toast notifications | `toaster.toast()` (`@decky/api`) | SDK's `Toast` component / toaster hook |
| Navigation | `Navigation.Navigate`, `Navigation.CloseSideMenus`, `Navigation.NavigateToExternalWeb` (`@decky/ui`) | Same names, Millennium SDK equivalents (confirm exact export names during Phase 3 scaffolding) |
| Gamepad-navigable UI | `Focusable`, `DialogButton` (`@decky/ui`) | `Focusable`, direct SDK equivalents |
| QAM layout | `PanelSection`, `PanelSectionRow`, `ButtonItem` (`@decky/ui`) | Same component names, Millennium SDK |
| Settings persistence | Hand-rolled SQLite `settings` table | `millennium.config.*` (Lua) + `pluginConfig`/`usePluginConfig` (frontend), auto-synced |
| Game tags / stats persistence | SQLite `game_tags`, `game_stats` tables via `sqlite3` | Lua-side: either (a) `millennium.config` if within the 256-key/256KB-value limits (unlikely for a full library), or (b) a hand-rolled JSON-on-disk store via the `fs` module, keyed by appid — **decision needed, see §5** |
| HLTB cache | SQLite `hltb_cache` table | Lua JSON-on-disk cache via `fs`, modeled directly on `hltb-millennium-plugin`'s `cache.lua` (stale-while-revalidate, merge-on-write, TTL + hard-expiry + entry-count pruning) |
| HLTB HTTP fetch | Python `urllib.request` (SSL verification disabled) | Lua `http` module (libcurl-backed) — **SSL verification will be left enabled**, a deliberate fix, not a carryover |
| Achievement data | Frontend: `window.SteamClient.Apps.GetMyAchievementsForApp`, `window.appAchievementProgressCache` | **Identical globals, same approach** — these are Steam client internals, not Decky-specific, and are available unchanged in Millennium's `SharedJSContext` |
| Playtime / last-played data | Frontend: `window.appStore.GetAppOverviewByAppID` | **Identical** — same Steam internal global |
| Library enumeration | Frontend: `window.SteamClient.Apps.GetAllApps()`, `collectionStore` fallbacks | **Identical** |
| Background "dropped" sweep | Python `asyncio.create_task` loop in `_main()` | Lua coroutine scheduling via the RPC event loop, or a simple `on_load`-started polling loop using `datetime`/`utils.sleep` primitives (Lua backends support async I/O via watched file descriptors, but a simple sleep-loop coroutine is sufficient here) |
| Logging | `decky.logger` | `logger` Lua module (writes into Millennium's in-client console/log viewer) |
| Frontend-to-backend log bridge | `log_frontend(level, message)` RPC (declared, unused in current code) | Not carried over — dead feature in the source; Millennium's per-plugin crash modal + console log viewer supersedes the need |
| Non-Steam / shortcut games | Backend binary `shortcuts.vdf` parser | Superseded — frontend's `SteamClient.Apps.GetAllApps()`/`collectionStore` already include non-Steam shortcuts with valid appids in the running client; no local file parsing needed in the common case |
| Local Steam Web API achievement fallback | `STEAM_API_KEY` env var, unused in practice | **Dropped.** Frontend-first data acquisition makes this fallback unnecessary; see §5 for the one edge case (uninstalled-game name resolution) that may still need a lightweight Steam Store API call from Lua |

---

## 5. What can be ported directly, what needs redesign, what is impossible

### Ports directly (same approach, different API names only)
- Frontend Steam-internals data acquisition (`SteamClient.Apps.*`, `appStore.*`, `appAchievementProgressCache`, `collectionStore`) — these are Steam client globals, not Decky-specific, and Millennium's `SharedJSContext` gives identical access.
- Tag-calculation business logic (the 5-tier priority algorithm) — pure logic, language-agnostic, ports 1:1 whether written in Lua or TS (recommend implementing it in Lua backend, matching Deck Progress Tracker's original design of keeping tag state authoritative on the "backend").
- Game-name sanitization for HLTB matching (edition-suffix stripping, non-game skip-list) — pure logic, ports 1:1 to Lua.
- HLTB fuzzy-matching strategy (similarity threshold, best-match selection) — direct algorithmic port; `hltb-millennium-plugin`'s more robust Levenshtein + Steam-ID-verification approach is adopted instead of Deck Progress Tracker's simpler `difflib.SequenceMatcher`-only approach (see §6, this is an intentional upgrade, not a like-for-like port).
- Route-patch badge injection pattern — same `routerHook.addPatch` mechanism, same general React-tree-splicing technique, ported to Millennium SDK's equivalent exports.
- QAM dashboard UI structure (tag-grouped expandable sections, sync button, stats) — component-for-component port using Millennium SDK's `PanelSection`/`PanelSectionRow`/`ButtonItem`/etc., which mirror Decky's naming closely.
- Achievement/playtime/HLTB data types (`GameTag`, `GameStats`, `HLTBData`, `TagStatistics`, etc. from `types.ts`) — port the TypeScript interfaces essentially unchanged.

### Needs redesign
- **Entire backend language**: Python `Plugin` class + `py_modules/*.py` → Lua `main.lua` + Lua submodules. Not a mechanical translation — Lua's module system, lack of classes, and different stdlib require restructuring (e.g., Python's `sqlite3` access pattern has no Lua equivalent; replaced by a JSON-file-per-concern store via the `fs` module, see below).
- **Storage layer**: SQLite → flat JSON files via the `fs` Lua module (or `millennium.config` for small settings-only data). Given a large Steam library (hundreds to thousands of games) can exceed `millennium.config`'s 256-key limit easily, the primary game-tags/stats/HLTB-cache store will be a hand-rolled JSON document (one file, keyed by appid, following `hltb-millennium-plugin`'s proven cache.lua pattern of periodic pruning + merge-on-write), while small global settings (thresholds, TTLs, feature toggles) use `millennium.config` directly.
- **Background dropped-games sweep**: Python `asyncio` task loop → Lua coroutine or simple sleep-loop kicked off in `on_load`, using `utils`/`datetime` primitives instead of `asyncio.sleep`.
- **HLTB HTTP client**: Python `urllib` with SSL verification disabled → Lua `http` module with SSL verification **enabled** (deliberate security fix). Endpoint-discovery self-healing (HLTB has no stable public API and its endpoint names rotate) is added per `hltb-millennium-plugin`'s proven approach — Deck Progress Tracker's original hardcoded `/api/finder` endpoint is a maintenance liability worth fixing proactively.
- **Achievement cache watcher**: Decky version polls `window.location.href` every 500ms. Millennium's `routerHook` gives a cleaner, event-driven way to detect navigation to a game's achievements tab without a raw polling loop — redesign as a route-patch callback instead of a `setInterval`.
- **Uninstalled-game name resolution**: Deck Progress Tracker falls back to local `appmanifest_*.acf` parsing, then Steam Store API. Since Millennium's frontend has the same `appStore`/`collectionStore` access Decky's does, this should cover almost all cases; a Lua-side Steam Store API call (`http` module, matching the pattern `hltb-millennium-plugin`'s `steam.lua` uses) is kept only as a last-resort fallback, not the primary path.

### Impossible / dropped entirely
- **Python package ecosystem** (`pip install`) — no equivalent exists; every dependency must be hand-implemented in Lua or done without. Concretely: `howlongtobeatpy`, `aiosqlite`, `vdf` were already unused dead dependencies in the source, so nothing of substance is actually lost here — reinforces that a from-scratch Lua implementation loses no real functionality.
- **Decky's `_migration()` lifecycle hook** — no Millennium equivalent. If a future schema migration is needed, it must be hand-implemented as a version check inside `on_load` against a `schema_version` key in `millennium.config`.
- **Local VDF/`shortcuts.vdf` file parsing as the primary data path** — not impossible (the `fs`/`regex` Lua modules could reimplement it), but unnecessary and actively undesirable: it was a Linux-only, Steam-Deck-path-hardcoded fallback in the original, and Millennium's frontend-first approach (same Steam internals Decky used) covers the primary use case on both Windows and Linux desktop Steam without needing any filesystem path guessing. **Decision: not ported** — if a real gap is found in Phase 3 testing (e.g., a game whose data doesn't surface via `appStore`), a targeted, cross-platform fix will be added then rather than pre-emptively porting Linux-only path-guessing logic that Millennium's primary target (desktop Windows Steam) wouldn't even need.
- **`DECKY_PLUGIN_RUNTIME_DIR`-style plugin-scoped writable directory convention** — Millennium's `millennium.get_install_path()` / `fs` module gives an equivalent writable location; not impossible, just a different API, tracked under "needs redesign" for storage above.

---

## 6. Deliberate improvements over the source plugin

These aren't required for feature parity but are natural to make while rewriting from scratch, since Deck Progress Tracker's own code and CLAUDE.md flag them as known issues:
- Fix `cache_ttl` setting actually being wired into the HLTB cache TTL check (currently hardcoded, ignoring the setting).
- Drop the dead `mastered_multiplier` and unused `auto_tag_enabled` settings, or wire them up properly if kept.
- Build an actual settings-editing UI (thresholds, cache TTL, source toggles) — the original never rendered one despite having the backend RPC for it.
- Enable SSL certificate verification for HLTB requests.
- Consolidate the two parallel single-game-sync code paths into one.
- Adopt real-time achievement-unlock push (`SteamClient.GameSessions.RegisterForAchievementNotification`) instead of polling, where useful for immediate badge updates.
- Adopt HLTB endpoint self-healing (per `hltb-millennium-plugin`) instead of a single hardcoded endpoint that will silently break when HLTB rotates it.

---

## 7. Proposed folder structure

Targeting the v2 (`starlight`/`.star`) packaging convention:

```
library-tracker-for-millennium/
├─ millennium.toml                 # [plugin], [backend], [frontend], [dev], [compiler], [assets]
├─ README.md
├─ PORTING_PLAN.md                 # this file
├─ backend/
│  ├─ main.lua                     # entrypoint: on_load/on_frontend_loaded/on_unload + exposed RPC fns
│  ├─ tag_engine.lua                # pure tag-priority calculation logic (port of calculate_auto_tag)
│  ├─ storage.lua                   # JSON-file-backed game_tags/game_stats store (fs module), load/save/prune
│  ├─ hltb/
│  │  ├─ hltb_api.lua               # HTTP client, auth token handling
│  │  ├─ hltb_endpoint_discovery.lua# self-healing endpoint/build-id discovery
│  │  ├─ hltb_match.lua             # Levenshtein fuzzy matching + Steam-ID verification
│  │  ├─ hltb_utils.lua             # name sanitization, seconds->hours, similarity scoring
│  │  └─ cache.lua                  # HLTB result cache (stale-while-revalidate, TTL, pruning)
│  ├─ dropped_sweep.lua             # background 24h "dropped" games checker
│  └─ settings.lua                  # thin wrapper over millennium.config for plugin settings
├─ frontend/
│  ├─ index.tsx                     # definePlugin entrypoint, route-patch registration
│  ├─ lib/
│  │  ├─ patchLibraryApp.tsx        # routerHook.addPatch for game-detail badge injection
│  │  ├─ syncUtils.ts               # SteamClient/appStore data acquisition + sync orchestration
│  │  └─ achievementWatcher.ts      # route-based achievements-tab detection (redesigned from polling)
│  ├─ hooks/
│  │  └─ useGameTag.ts              # RPC-backed tag state hook
│  ├─ components/
│  │  ├─ Settings.tsx               # QAM panel: tag-grouped dashboard, sync controls, settings UI
│  │  ├─ GameTagBadge.tsx           # injected game-detail badge
│  │  ├─ GameTag.tsx                # presentational tag badge
│  │  ├─ TagIcon.tsx                # per-tag icon + color constants
│  │  └─ TagManager.tsx             # modal: stats, manual tag controls
│  └─ types.ts                      # GameTag, GameStats, HLTBData, TagStatistics, PluginSettings, etc.
├─ assets/                          # plugin icon, marketplace images
└─ tests/                           # Lua unit tests (busted), modeled on hltb-millennium-plugin's tests/
```

---

## 8. Implementation milestones (Phase 3, after approval)

Each milestone should build cleanly and be committed independently, per the development rules (small logical changes, build + fix before continuing).

1. **Scaffold** — `millennium.toml`, minimal `backend/main.lua` (on_load/on_unload only, `millennium.ready()`), minimal `frontend/index.tsx` (`definePlugin` returning a placeholder QAM panel). Verify it builds via `starlight pack` and loads in Millennium without errors.
2. **Settings & storage foundation** — `backend/settings.lua` over `millennium.config`; `backend/storage.lua` JSON-file game-tags/stats store with load/save/prune. Expose a trivial `get_settings`/`update_settings` RPC pair; verify frontend↔backend round-trip via `callable`.
3. **Tag engine** — port `calculate_auto_tag` priority logic into `backend/tag_engine.lua` with unit tests (busted). No UI yet — verify via direct RPC calls from a dev console.
4. **Frontend data acquisition** — `frontend/lib/syncUtils.ts` port (achievement/playtime/name reads from `SteamClient`/`appStore`), single-game sync RPC (`sync_single_game_with_data` equivalent) wired end-to-end.
5. **Game-detail badge** — `patchLibraryApp.tsx` route patch + `GameTagBadge`/`GameTag`/`TagIcon` components, manual TagManager modal with set/reset/remove actions.
6. **QAM dashboard** — `Settings.tsx` tag-grouped lists, backlog lazy-load, library-wide progressive sync button, sync-progress polling.
7. **HLTB integration** — `hltb/` Lua modules (api, endpoint discovery, matching, cache) ported/upgraded from `hltb-millennium-plugin`'s design; wire into tag engine's Completed-threshold calculation.
8. **Background dropped-games sweep** — `dropped_sweep.lua` periodic checker.
9. **Settings UI** — the settings-editing panel Deck Progress Tracker never actually shipped (thresholds, cache TTL, source toggles).
10. **Polish** — real-time achievement push notifications, error-handling/logging pass, README + user-facing docs, icon/marketplace assets.

---

## 9. Testing plan

- **Lua unit tests** (`busted`, matching `hltb-millennium-plugin`'s test setup) for pure-logic modules: `tag_engine.lua`, `hltb_match.lua`, `hltb_utils.lua`, `storage.lua` (with `fs` mocked/seamed the way `hltb-millennium-plugin` exposes `M._http = http` for test injection).
- **Manual in-Steam verification** at the end of each milestone: `starlight watch` for live-reload, exercising the actual feature against a real Steam library (a mix of installed/uninstalled, Steam and non-Steam games, games with/without achievements) rather than relying on unit tests alone for UI-facing behavior — per the project's UI-testing rule, type-checking and unit tests verify correctness, not feature correctness.
- **Cross-check against the priority-order tag algorithm** with constructed edge cases: a game with achievements but 0% unlocked and huge playtime (should not be Mastered, should be Completed/In Progress based on HLTB), a manually-tagged game (auto-calc must be skipped), a game with no HLTB match (Completed should never trigger), a non-Steam shortcut game (should sync via `appStore`/`collectionStore` without any local file parsing).
- **HLTB integration resilience test**: simulate an HLTB endpoint failure (e.g., temporarily point at a wrong URL) and confirm the self-healing retry-once-then-fail-soft behavior matches the design in §5/§6 (no crash, no infinite retry, graceful "not found" UI state).
- **Crash isolation check**: intentionally throw inside a backend RPC handler and confirm Millennium's per-plugin crash modal fires without affecting other plugins or requiring a Steam restart.
- **Settings live-sync check**: change a setting from the QAM panel and confirm `millennium.config.on_change` fires backend-side (and vice versa) without a manual refetch.

---

## 10. Open questions for approval

1. **Storage limits**: confirmed plan is a hand-rolled JSON store via `fs` for per-game tags/stats/HLTB-cache (not `millennium.config`, due to its 256-key cap) — please confirm this matches your expectations before Phase 3 storage work begins.
2. **HLTB endpoint self-healing scope**: adopting `hltb-millennium-plugin`'s more robust (and more complex) endpoint-discovery approach instead of Deck Progress Tracker's simpler hardcoded-endpoint approach — this is more implementation effort for materially better long-term reliability. Confirm this tradeoff is wanted, or whether a simpler hardcoded-endpoint MVP is preferred for v1 with self-healing as a later milestone.
3. **Webkit module**: Deck Progress Tracker has no store-page feature today, so no `webkit/` module is planned initially. Flag if a future store-page completion-time display (similar to `hltb-millennium-plugin`'s webkit module) is wanted, since it changes the folder structure and build config now versus later.
4. **v1 vs v2 packaging**: this plan targets v2 (`.star`/`starlight`) exclusively. Confirm there's no requirement to also support v1/legacy Millennium installs.

---

*This plan is based on full-source research of the live repositories: `maroun2/deck-progress-tracker`, `SteamClientHomebrew/Millennium`, `BossSloth/SteamHunter-plugin`, `jcdoll/hltb-millennium-plugin`, and `luthor112/steam-librarian`, all cloned and read in full for this analysis.*
