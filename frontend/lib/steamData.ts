import type { SteamAppOverview } from '@steambrew/client';
import { getAppOverviewMap } from './libraryEnumeration';
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

let cachedApps: Map<number, SteamAppOverview> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

/**
 * SteamClient.Apps.GetAllApps() (this function's original data source)
 * turned out to be the wrong assumption entirely: a real-device full-
 * library sync had every single per-game lookup through it fail,
 * including for appid 730 (Counter-Strike 2, definitely owned), even
 * though enumeration itself succeeded (real appids, just no names) --
 * meaning whichever candidate actually powers enumeration in this
 * session isn't SteamClient.Apps.GetAllApps() at all. Rather than guess
 * again, this now goes through libraryEnumeration.ts's
 * getAppOverviewMap(), which tries the exact same fallback chain
 * enumeration itself uses (and logs which one wins) -- so per-game
 * lookups and enumeration are guaranteed to agree on data source instead
 * of drifting apart. Still cached (30s TTL, forced refresh only on an
 * actual miss) rather than re-resolved on every call, since the earlier
 * per-game-in-a-tight-loop version of this cache fix is still valid
 * regardless of which underlying source it wraps.
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

function refreshAppsCache(): Map<number, SteamAppOverview> {
	const map = getAppOverviewMap();
	cachedApps = map;
	cachedAt = Date.now();
	return map;
}

/**
 * window.appStore.GetAppOverviewByAppID(appid) (an even earlier
 * implementation of this function) turned out to be unreachable:
 * Millennium's own loader log confirmed it runs each plugin in a Chrome
 * DevTools Protocol "isolated world" ("Created isolated CDP world for
 * plugin 'library-tracker'") -- the same mechanism browser extension
 * content scripts use, sharing the real page's DOM but deliberately
 * *not* sharing page-defined JS globals like window.appStore, which
 * only exists in the real page's own main-world script realm. See
 * findOverview() above for the (second) fix on top of that.
 */
export async function readGameSnapshot(appid: number): Promise<GameSnapshot> {
	const overview = findOverview(appid);
	if (!overview) {
		logError(`readGameSnapshot(${appid}): appid not found in any app overview source`, new Error('overview not found'));
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
