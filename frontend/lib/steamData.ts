import type { SteamAppOverview } from '@steambrew/client';
import { logError } from './log';

export interface GameSnapshot {
	appid: number;
	gameName: string;
	playtimeMinutes: number;
	/** null means "never played", not "unknown" -- Steam reports 0 for that case too, and both are treated the same by the tag engine. */
	rtLastTimePlayed: number | null;
	totalAchievements: number;
	unlockedAchievements: number;
}

type GetAllAppsFn = () => SteamAppOverview[];

function getAllAppsBinding(): GetAllAppsFn | null {
	const client = window as unknown as { SteamClient?: { Apps?: { GetAllApps?: GetAllAppsFn } } };
	return client.SteamClient?.Apps?.GetAllApps ?? null;
}

let cachedApps: Map<number, SteamAppOverview> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

function refreshAppsCache(): Map<number, SteamAppOverview> {
	const apps = getAllAppsBinding()?.() ?? [];
	const map = new Map<number, SteamAppOverview>();
	for (const app of apps) {
		map.set(app.appid, app);
	}
	cachedApps = map;
	cachedAt = Date.now();
	return map;
}

/**
 * SteamClient.Apps.GetAllApps() reliably returns every owned app when
 * called once (it's what library enumeration already relies on for all
 * 388+ appids), but calling it fresh for *every single game* in a tight
 * loop -- as the original version of readGameSnapshot() did, once per
 * game during a full-library sync -- returned an incomplete result for
 * most of them: a real-device full sync came back with only 4 out of
 * 389 games correctly named, the rest falling back to "Unknown Game
 * (appid)" with 0 playtime. Caching one snapshot and reusing it (falling
 * back to a single forced refresh only on a genuine cache miss, e.g. a
 * shortcut added after the cache was built) avoids hammering that API
 * while still self-healing for anything actually new. A 30s TTL keeps
 * interactive single-page visits (not part of a tight loop) reasonably
 * fresh without needing to refresh on every lookup.
 */
function findOverview(appid: number): SteamAppOverview | null {
	const isStale = cachedApps === null || Date.now() - cachedAt > CACHE_TTL_MS;
	let map = isStale ? refreshAppsCache() : (cachedApps as Map<number, SteamAppOverview>);
	let overview = map.get(appid) ?? null;
	if (!overview && !isStale) {
		map = refreshAppsCache();
		overview = map.get(appid) ?? null;
	}
	return overview;
}

/**
 * window.appStore.GetAppOverviewByAppID(appid) (this function's original
 * implementation) turned out to be unreachable: Millennium's own loader
 * log confirmed it runs each plugin in a Chrome DevTools Protocol
 * "isolated world" ("Created isolated CDP world for plugin
 * 'library-tracker'") -- the same mechanism browser extension content
 * scripts use, sharing the real page's DOM but deliberately *not*
 * sharing page-defined JS globals like window.appStore, which only
 * exists in the real page's own main-world script realm.
 *
 * SteamClient.Apps.GetAllApps() is a native CEF binding rather than a
 * page-JS singleton, so it crosses the isolated-world boundary fine --
 * see findOverview() above for why it's cached rather than called fresh
 * per game.
 */
export async function readGameSnapshot(appid: number): Promise<GameSnapshot> {
	const overview = findOverview(appid);
	if (!overview) {
		logError(`readGameSnapshot(${appid}): appid not found in SteamClient.Apps.GetAllApps()`, new Error('overview not found'));
	}

	const gameName = overview?.display_name ?? `Unknown Game (${appid})`;
	const playtimeMinutes = overview?.minutes_playtime_forever ?? 0;
	const rtLastTimePlayed = overview && overview.rt_last_time_played > 0 ? overview.rt_last_time_played : null;

	let totalAchievements = 0;
	let unlockedAchievements = 0;
	try {
		const response = await SteamClient.Apps.GetMyAchievementsForApp(String(appid));
		const achievements = response?.data?.rgAchievements ?? [];
		totalAchievements = achievements.length;
		unlockedAchievements = achievements.filter((achievement) => achievement.bAchieved).length;
	} catch {
		// Games with no achievements (or where Steam hasn't loaded
		// achievement data for this session yet) simply report zero --
		// this is an expected, common case, not an error.
	}

	return { appid, gameName, playtimeMinutes, rtLastTimePlayed, totalAchievements, unlockedAchievements };
}
