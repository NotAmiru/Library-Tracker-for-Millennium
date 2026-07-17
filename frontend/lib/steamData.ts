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

/**
 * window.appStore.GetAppOverviewByAppID(appid) (this function's original
 * implementation) turned out to be unreachable: Millennium's own loader
 * log confirmed it runs each plugin in a Chrome DevTools Protocol
 * "isolated world" ("Created isolated CDP world for plugin
 * 'library-tracker'") -- the same mechanism browser extension content
 * scripts use, sharing the real page's DOM but deliberately *not*
 * sharing page-defined JS globals like window.appStore, which only
 * exists in the real page's own main-world script realm. Confirmed via
 * the Logs panel: routing the lookup through the resolved real window
 * (same trick that fixed DOM access) still failed with "appStore
 * unreachable" -- an isolated world's `window` reference to another
 * world's globals is fundamentally different from a DOM reference, which
 * is why the DOM-access fix didn't carry over here.
 *
 * SteamClient.Apps.GetAllApps() is a native CEF binding rather than a
 * page-JS singleton (same reasoning as GetMyAchievementsForApp below,
 * and already relied on successfully for library enumeration in
 * libraryEnumeration.ts), so it crosses the isolated-world boundary
 * fine. Not part of @steambrew/client's typed SDK, hence the untyped
 * cast -- matching the pattern libraryEnumeration.ts already uses for
 * the same API.
 */
export async function readGameSnapshot(appid: number): Promise<GameSnapshot> {
	const client = window as unknown as { SteamClient?: { Apps?: { GetAllApps?: () => SteamAppOverview[] } } };
	const allApps = client.SteamClient?.Apps?.GetAllApps?.() ?? [];
	const overview = allApps.find((app) => app.appid === appid) ?? null;
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
