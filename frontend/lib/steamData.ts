import { logError } from './log';
import { resolveRealWindow } from './steamWindow';

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
 * Reads one app's playtime, display name, and achievement counts straight
 * out of Steam's own in-memory client state (appStore + SteamClient.Apps),
 * with no backend round-trip. These are the same internals Decky-era
 * plugins relied on; SteamAppOverview and GetMyAchievementsForApp are
 * both part of Millennium's typed SDK.
 *
 * window.appStore is a plain JS singleton Steam's own webpack app bundle
 * creates -- unlike SteamClient (a native binding Millennium exposes
 * uniformly everywhere), it only exists within the real page's own
 * script realm. This plugin's script runs in an isolated realm (see
 * steamWindow.ts), so the bare `window.appStore` global is undefined
 * here; goes through resolveRealWindow() instead, same as every DOM
 * lookup in patchLibraryApp.tsx.
 */
export async function readGameSnapshot(appid: number): Promise<GameSnapshot> {
	const realWindow = resolveRealWindow();
	if (!realWindow?.appStore) {
		logError(`readGameSnapshot(${appid}): appStore unreachable on resolved window`, new Error('no appStore'));
		return { appid, gameName: `Unknown Game (${appid})`, playtimeMinutes: 0, rtLastTimePlayed: null, totalAchievements: 0, unlockedAchievements: 0 };
	}
	const overview = realWindow.appStore.GetAppOverviewByAppID(appid);

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
