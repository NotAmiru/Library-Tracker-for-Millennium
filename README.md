# Library Tracker for Millennium

A native [Millennium](https://github.com/SteamClientHomebrew/Millennium) plugin that automatically tags every game in your Steam library as **Mastered**, **Completed**, **In Progress**, or **Dropped**, based on your achievement completion percentage, playtime, last-played date, and [HowLongToBeat](https://howlongtobeat.com/) estimates. Manual overrides, configurable thresholds, and a library-wide dashboard are all built in.

This is a ground-up port of [Deck Progress Tracker](https://github.com/maroun2/deck-progress-tracker) (a Decky Loader plugin) to Millennium, rewritten from scratch against Millennium's own architecture rather than run through a compatibility layer. See [`PORTING_PLAN.md`](./PORTING_PLAN.md) for the full research and migration plan this implementation follows.

## Features

- **Automatic tags**, in priority order:
  1. **Mastered** — achievement completion ≥ a configurable percentage (default 85%)
  2. **Completed** — playtime ≥ HowLongToBeat's "main story" estimate for that game
  3. **Dropped** — not played in a configurable number of days (default 365)
  4. **In Progress** — playtime past a configurable minutes threshold (default 30)
  5. **Backlog** — none of the above (the default state; not a stored tag)
- **Manual overrides** — force any tag, or reset a game back to automatic calculation
- **HowLongToBeat integration** — fuzzy name matching with a two-step retry (exact name, then edition-suffix-stripped), disk-persisted caching with stale-while-revalidate TTLs
- **Library dashboard** — tag-grouped, expandable game lists with a one-click "Sync Entire Library" button and live progress
- **Settings UI** — every threshold is editable in-app, writes through immediately
- **Game-detail badge** — a tag badge injected into each game's library page, click to open the tag manager
- **Real-time achievement sync** — listens for Steam's own achievement-unlock notifications rather than polling
- **Dropped-games sweep** — re-checks stored games for the Dropped tag once per backend startup (see [Known limitations](#known-limitations) for why this isn't a standing background timer)

## Installation

This plugin isn't published to the Millennium plugin marketplace yet, and targets Millennium's established "loose files" plugin format (`plugin.json` + a `backend/` Lua directory + a built frontend bundle) rather than the newer `.star` packed format, which as of writing is unreleased dev-branch-only code not yet in any tagged Millennium release. To install it manually:

```bash
git clone https://github.com/NotAmiru/Library-Tracker-for-Millennium.git
cd Library-Tracker-for-Millennium
npm install
npm run build
```

`npm run build` compiles the frontend to `.millennium/Dist/index.js`. Copy the **entire repo folder** (containing `plugin.json`, `backend/`, and the built `.millennium/Dist/`) into your Millennium plugins directory, then enable it from Millennium's settings in Steam.

## Development

Requires Node.js 18+ and npm.

```bash
npm install            # installs @steambrew/client (types) and @steambrew/ttc (build tool)
npm run typecheck        # TypeScript, strict mode
npm run test:backend  # Lua backend unit tests (plain lua, or luajit if installed)
npm run test         # typecheck + backend tests
npm run build         # compiles frontend/index.tsx -> .millennium/Dist/index.js (dev build)
npm run build:release # minified release build
npm run watch          # rebuilds on file change (millennium-ttc --watch)
```

### Project layout

```
backend/          Lua backend (LuaJIT). See main.lua for the RPC surface.
  main.lua         Entry point: lifecycle hooks + RPC-callable functions
  storage.lua      Per-game data store (JSON file, keyed by appid)
  settings.lua     Plugin settings, backed by Millennium's built-in config store
  tag_engine.lua   Pure tag-priority calculation (no I/O)
  sync.lua         Orchestrates storage + settings + tag_engine + HLTB per sync
  queries.lua      Read-oriented aggregates (stats, tagged/backlog lists)
  dropped_sweep.lua  Startup-time Dropped-tag sweep
  hltb_*.lua       HowLongToBeat client: endpoint discovery, search, matching, caching
  paths.lua        Plugin data-directory resolution

frontend/          React/TypeScript frontend
  index.tsx          definePlugin entry point
  components/        UI: dashboard, game-detail badge, tag manager, settings panel
  hooks/useGameTag.ts  Per-game sync + tag state
  lib/                Steam data acquisition, RPC helpers, library enumeration/sync

tests/
  run.lua            Plain-Lua test runner (no Steam/Millennium instance required)
  support/mock_natives.lua  Fakes for Millennium's native modules (fs, http, json, ...)
  backend/*_spec.lua   Unit tests for each backend module
```

### Testing

The Lua backend is unit-tested against a set of hand-written mocks for Millennium's native modules (`json`, `fs`, `utils`, `http`, `logger`, `millennium`), so the full suite runs in a plain Lua interpreter with no Steam client or Millennium install required:

```bash
npm run test:backend
```

The frontend has no automated tests — it depends entirely on Steam's own internal client state (`window.SteamClient`, `window.appStore`) and Millennium's UI injection points, neither of which exist outside a running Steam client. Type-checking (`npm run typecheck`) is the only automated verification for that half of the codebase; see [Known limitations](#known-limitations).

## Settings

All configurable via the in-app Settings panel:

| Setting | Default | Effect |
|---|---|---|
| Mastered threshold | 85% | Achievement completion % required for Mastered |
| In Progress threshold | 30 min | Playtime required for In Progress |
| Dropped after | 365 days | Days since last played before Dropped applies |
| HLTB cache refresh | 12 hr | Soft TTL — a cached HLTB match older than this is treated as stale (but still served) |
| HLTB cache expiry | 90 days | Hard TTL — a cached HLTB match older than this is re-fetched |

## Theming

Every element of the plugin's own UI (the icon-row badge, the tag pill, the stats dialog, and the dashboard list in the Settings panel) carries a `library-tracker-*` class name alongside its default inline style, so a Millennium theme can override any piece of it via Quick CSS — inline styles win over an unscoped selector, so overrides need `!important`.

Steam-native components the plugin reuses as-is (`PanelSection`, `PanelSectionRow`, `SliderField`, `ButtonItem` in the Settings panel) aren't included below — they already carry Steam's own theme-able classes.

**Icon-row badge** (`GameTagBadge.tsx`, `GameTag.tsx`) — mounted into the game-detail page's icon row:

| Class | Targets |
|---|---|
| `library-tracker-badge` | Outer wrapper around the pill/placeholder |
| `library-tracker-badge__add-tag` | The "ADD TAG" placeholder shown when a game has no tag yet |
| `library-tracker-badge__add-tag-dot` | Dashed circle inside the placeholder |
| `library-tracker-badge__add-tag-label` | The "ADD TAG" text |
| `library-tracker-pill` | The colored tag pill shown once a game is tagged |
| `library-tracker-pill--mastered` / `--completed` / `--in_progress` / `--dropped` | Per-tag modifier on the pill (matches the tag name) |
| `library-tracker-pill--manual` | Added when the tag was set manually rather than auto-computed |
| `library-tracker-pill__dot` | The small colored dot inside the pill |
| `library-tracker-pill__label` | The tag's text label |
| `library-tracker-pill__manual-icon` | The ✎ icon shown for manually-set tags |

**Stats dialog** (`TagManager.tsx`) — opened by clicking the badge/pill:

| Class | Targets |
|---|---|
| `library-tracker-dialog-overlay` | Full-screen dark backdrop |
| `library-tracker-dialog` | The dialog card itself |
| `library-tracker-dialog__header` | Row containing the title and status pill |
| `library-tracker-dialog__title` | The game's name |
| `library-tracker-dialog__status` | The status pill (top-right) |
| `library-tracker-dialog__status--mastered` / `--completed` / `--in_progress` / `--dropped` | Per-tag modifier on the status pill |
| `library-tracker-dialog__status-icon` | The ✓ inside the status pill |
| `library-tracker-dialog__status-label` | The status pill's text |
| `library-tracker-dialog__section--statistics` / `--set-tag` | The two content sections |
| `library-tracker-section-header` | "STATISTICS" / "SET TAG" headers (also carries `--statistics` / `--set-tag`) |
| `library-tracker-stat-row` | One label/value row (also carries `--playtime`, `--achievements`, `--hltb-match`, or `--main-story`) |
| `library-tracker-stat-row__label` / `__value` | The two halves of a stat row |
| `library-tracker-tag-grid` | The 2×2 grid of tag-select buttons |
| `library-tracker-action-button` | Every button in the dialog (tag-select, Reset to Auto, Remove, Close) |
| `library-tracker-action-button--mastered` / `--completed` / `--in_progress` / `--dropped` | Per-tag modifier on the 4 tag-select buttons |
| `library-tracker-action-button--active` | Added to whichever tag-select button matches the current tag |
| `library-tracker-action-button--hovered` | Added while a button is hovered (no `:hover` CSS support since these are Millennium-injected inline styles) |
| `library-tracker-action-button--reset` / `--remove` / `--close` | Identify the Reset to Auto / Remove / Close buttons specifically |
| `library-tracker-dialog__actions` | Row wrapping the Reset to Auto / Remove buttons |

**Dashboard list** (`GameListSection.tsx`) — in the Settings panel:

| Class | Targets |
|---|---|
| `library-tracker-list-section` | One tag-grouped section (also carries `--mastered`, `--completed`, `--in_progress`, `--dropped`, or `--backlog`) |
| `library-tracker-list-section__header` | The clickable header row |
| `library-tracker-list-section__label` | The tag icon + name + count |
| `library-tracker-list-section__arrow` | The ▾/▸ expand indicator |
| `library-tracker-list-section__games` | The expanded list of games |
| `library-tracker-list-section__game-row` | One clickable game row |
| `library-tracker-list-section__empty` | The "Loading..." / "No games" placeholder |

## Known limitations

This port was built and verified without access to a running Steam/Millennium instance or to the live HowLongToBeat API (both blocked by this development environment's network policy). Everything here has been verified at the level the environment allows — Lua unit tests against mocked native modules, strict TypeScript compilation against `@steambrew/client`'s real types, and a successful `millennium-ttc` build producing `.millennium/Dist/index.js` — but the following haven't been exercised against the real thing and should be the first things checked when testing in an actual Steam client:

- **Game-detail badge injection** (`frontend/lib/patchLibraryApp.tsx`) — the route-patch mechanism is implemented against `@steambrew/client`'s documented `RoutePatch` type, but whether it actually renders correctly inside Steam's real library UI is unconfirmed.
- **HowLongToBeat integration** (`backend/hltb_*.lua`) — the endpoint-discovery scraping and search request format are ported from a working reference plugin's source, but HLTB has no official API and its endpoint has rotated names before (`search` → `finder` → `find` → `bleed` → ...). If HLTB has rotated again since this was written, search will fail until the discovery logic (or, if the failure mode itself changed, `hltb_client.lua`) is updated.
- **Library enumeration** (`frontend/lib/libraryEnumeration.ts`) — reads several undocumented Steam client internals (`SteamClient.Apps.GetAllApps`, `collectionStore`, `appStore.allApps`/`m_mapApps`) with a fallback chain, none of which are part of Millennium's official typed SDK.
- **Dropped-games sweep runs once per backend startup, not on a 24-hour timer.** Millennium's Lua backend has no fire-and-forget sleep/interval primitive — the only async primitive exposed (`millennium.start_coroutine` + `yield_readable(fd)`) is for watching a file descriptor become readable, not for timers, and a literal multi-hour `utils.sleep()` would block the single-threaded Lua VM from answering any other RPC for its entire duration. Running the sweep at startup is a deliberate, documented alternative, not an oversight — see the comment in `backend/dropped_sweep.lua`.
- **`backendType: "lua"`** is set in `plugin.json` even though it isn't part of the documented plugin schema, because a dev-branch snapshot of Millennium's plugin loader was seen requiring it now that Python backend support has been removed. Whether the version you have installed needs it, ignores it, or (on an older release) requires something else entirely for a Lua backend to load is unconfirmed — if the backend never starts, this is the first thing to check.

**Packaging format note:** this plugin initially targeted Millennium's newer `.star` packed format (built with `starlight`), which turned out to be unreleased dev-branch code — merged roughly a day before this was written, not in any tagged release. It's now built as loose files with `@steambrew/ttc` instead, which has been the stable, established format for a long time. If you're on a very recent Millennium build that *does* support `.star`, that path is no longer wired up here, but the Lua backend and React frontend source are unaffected by which packaging format wraps them.

## Credits

- [Deck Progress Tracker](https://github.com/maroun2/deck-progress-tracker) by maroun2 (BSD-3-Clause) — the source plugin this is ported from. No code is directly reused from it, only its feature design and behavior.
- [Millennium](https://github.com/SteamClientHomebrew/Millennium) — the framework this plugin is built on.
- [hltb-millennium-plugin](https://github.com/jcdoll/hltb-millennium-plugin) by jcdoll (MIT) — `backend/hltb_*.lua`'s endpoint discovery, search client, and name-matching logic are substantially ported from this plugin's design, not written from scratch.
- [SteamHunter-plugin](https://github.com/BossSloth/SteamHunter-plugin) by BossSloth (MIT) — informed the game-detail badge injection approach in `frontend/lib/patchLibraryApp.tsx`.
- [steam-librarian](https://github.com/luthor112/steam-librarian) — studied for general library-page UI patterns during research; no code reused.

## License

MIT — see [`LICENSE`](./LICENSE), which also credits the specific files ported from other MIT-licensed Millennium plugins.
