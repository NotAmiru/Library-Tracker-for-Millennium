# Library Tracker for Millennium

A native [Millennium](https://github.com/SteamClientHomebrew/Millennium) plugin that automatically tags every game in your Steam library as **Mastered**, **Completed**, **In Progress**, or **Dropped**, based on your achievement completion percentage, playtime, last-played date, and [HowLongToBeat](https://howlongtobeat.com/) estimates.

This is a port of [Deck Progress Tracker](https://github.com/maroun2/deck-progress-tracker) (a Decky Loader plugin) to Millennium. 

## Images

Game Page:
<img width="2560" height="1400" alt="Library Tracker Game Page" src="https://github.com/user-attachments/assets/c5518fd9-12bb-4835-8589-d139713059af" />
Settings:
<img width="2560" height="1400" alt="Library Tracker Settings" src="https://github.com/user-attachments/assets/adb4f429-8ad0-4135-a44a-5df324586762" />

## Features

- **Automatic tags**, in priority order:
  - **Mastered** — achievement completion ≥ a configurable percentage (default 85%)
  - **Completed** — playtime ≥ HowLongToBeat's "main story" estimate for that game
  - **Dropped** — not played in a configurable number of days (default 365)
  - **In Progress** — playtime past a configurable minutes threshold (default 30)
  - **Backlog** — none of the above (the default state; not a stored tag)
- **Manual overrides** — force any tag, or reset a game back to automatic calculation
- **HowLongToBeat integration** — fuzzy name matching with a two-step retry (exact name, then edition-suffix-stripped), disk-persisted caching with stale-while-revalidate TTLs
- **Library dashboard** — tag-grouped, expandable game lists with a one-click "Sync Entire Library" button and live progress
- **Settings UI** — every threshold is editable in-app, writes through immediately
- **Game-detail badge** — a tag badge injected into each game's library page, click to open the tag manager
- **Real-time achievement sync** — listens for Steam's own achievement-unlock notifications rather than polling
- **Dropped-games sweep** — re-checks stored games for the Dropped tag once per backend startup (see [Known limitations](#known-limitations) for why this isn't a standing background timer)

## Installation

This plugin isn't published to the Millennium plugin marketplace yet, and targets Millennium's established "loose files" plugin format (`plugin.json` + a `backend/` Lua directory + a built frontend bundle) rather than the newer `.star` packed format, which as of writing is unreleased dev-branch-only code not yet in any tagged Millennium release.

### Option A: download a release (no build tools needed)

1. Grab the latest `library-tracker-vX.Y.Z.zip` from the [Releases page](https://github.com/NotAmiru/Library-Tracker-for-Millennium/releases).
2. Unzip it — you'll get a `library-tracker/` folder containing `plugin.json`, `backend/`, and `.millennium/Dist/`.
3. If you're updating an existing install, **delete the old `library-tracker` folder first** rather than extracting over it — some unzip tools silently skip files that already exist, which can leave a stale build in place.
4. Move the `library-tracker/` folder into your Millennium plugins directory.
5. Fully restart Steam, then enable the plugin from Millennium's settings.

### Option B: build from source

```bash
git clone https://github.com/NotAmiru/Library-Tracker-for-Millennium.git
cd Library-Tracker-for-Millennium
npm install
npm run build
```

`npm run build` compiles the frontend to `.millennium/Dist/index.js`. Copy the **entire repo folder** (containing `plugin.json`, `backend/`, and the built `.millennium/Dist/`) into your Millennium plugins directory, then enable it from Millennium's settings in Steam.

## Known Issues

- Known to crash during library sync. Requires a plugin or steam restart and will continue syncing from where it crashed.

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


## Credits

- [Deck Progress Tracker](https://github.com/maroun2/deck-progress-tracker) by maroun2 (BSD-3-Clause) — the source plugin this is ported from. No code is directly reused from it, only its feature design and behavior.
- [Millennium](https://github.com/SteamClientHomebrew/Millennium) — the framework this plugin is built on.
- [hltb-millennium-plugin](https://github.com/jcdoll/hltb-millennium-plugin) by jcdoll (MIT) — `backend/hltb_*.lua`'s endpoint discovery, search client, and name-matching logic are substantially ported from this plugin's design, not written from scratch.

## License

MIT — see [`LICENSE`](./LICENSE), which also credits the specific files ported from other MIT-licensed Millennium plugins.
