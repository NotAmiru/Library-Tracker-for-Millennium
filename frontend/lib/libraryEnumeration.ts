import type { SteamAppOverview } from '@steambrew/client';
import { logInfo } from './log';

interface CandidateWindow {
	SteamClient?: { Apps?: { GetAllApps?: () => SteamAppOverview[] } };
	collectionStore?: {
		allAppsCollection?: { allApps?: SteamAppOverview[] };
		allGamesCollection?: { allApps?: SteamAppOverview[] };
	};
	appStore?: { allApps?: SteamAppOverview[]; m_mapApps?: Map<number, SteamAppOverview> };
}

let loggedSources = false;

/**
 * Tries the same set of undocumented candidates as before, in the same
 * order, but now logs the size of *every* candidate (not just whichever
 * one wins) the first time this runs -- SteamClient.Apps.GetAllApps()
 * was assumed to be the one powering successful enumeration (steamData.ts
 * was built entirely around it), but a real-device full-library sync
 * came back with every single readGameSnapshot() lookup through that API
 * failing, including for appid 730 (Counter-Strike 2, definitely owned).
 * Since enumeration itself was working (it found real appids, just no
 * names), the working source has to be one of the *other* four
 * candidates -- this diagnostic settles which one directly instead of
 * guessing again.
 */
function resolveAppOverviews(): { overviews: SteamAppOverview[]; source: string } {
	const w = window as unknown as CandidateWindow;

	const fromSteamClient = w.SteamClient?.Apps?.GetAllApps?.();
	const fromCollectionAll = w.collectionStore?.allAppsCollection?.allApps;
	const fromCollectionGames = w.collectionStore?.allGamesCollection?.allApps;
	const fromAppStoreAll = w.appStore?.allApps;
	const fromAppStoreMap = w.appStore?.m_mapApps;

	if (!loggedSources) {
		loggedSources = true;
		logInfo(
			`app overview source diagnostic: SteamClient.Apps.GetAllApps=${fromSteamClient?.length ?? 'unavailable'}, ` +
				`collectionStore.allAppsCollection=${fromCollectionAll?.length ?? 'unavailable'}, ` +
				`collectionStore.allGamesCollection=${fromCollectionGames?.length ?? 'unavailable'}, ` +
				`appStore.allApps=${fromAppStoreAll?.length ?? 'unavailable'}, ` +
				`appStore.m_mapApps=${fromAppStoreMap?.size ?? 'unavailable'}`,
		);
	}

	if (fromSteamClient && fromSteamClient.length > 0) {
		return { overviews: fromSteamClient, source: 'SteamClient.Apps.GetAllApps' };
	}
	if (fromCollectionAll && fromCollectionAll.length > 0) {
		return { overviews: fromCollectionAll, source: 'collectionStore.allAppsCollection' };
	}
	if (fromCollectionGames && fromCollectionGames.length > 0) {
		return { overviews: fromCollectionGames, source: 'collectionStore.allGamesCollection' };
	}
	if (fromAppStoreAll && fromAppStoreAll.length > 0) {
		return { overviews: fromAppStoreAll, source: 'appStore.allApps' };
	}
	if (fromAppStoreMap && fromAppStoreMap.size > 0) {
		return { overviews: Array.from(fromAppStoreMap.values()), source: 'appStore.m_mapApps' };
	}
	return { overviews: [], source: 'none' };
}

/**
 * Best-effort enumeration of every appid the current user owns (installed
 * or not, Steam or non-Steam shortcuts), read from whichever of Steam's
 * several internal, undocumented app collections happens to be populated.
 *
 * None of these are part of Millennium's official SDK types -- the
 * fallback chain is confirmed via source reading of published Millennium
 * reference plugins (SteamHunter-plugin, hltb-millennium-plugin), which
 * rely on the same set of candidates because no single one is reliably
 * present across every Steam client version / UI mode.
 */
export function getAllOwnedAppIds(): number[] {
	return dedupeAppIds(resolveAppOverviews().overviews);
}

// Real Steam appids are sequential-ish and, as of 2026, nowhere near this
// high -- comfortably generous headroom for real future growth. Added
// after a real-device sync log showed entries like 2404564240, 3529522633,
// and 2793264736 mixed in with real appids: multi-billion-range garbage
// from one of the fallback enumeration sources (likely a non-game
// collection entry or similar, not an actual owned app), coinciding with
// two Millennium native-host crashes (EXCEPTION_ACCESS_VIOLATION at the
// identical instruction address both times -- a deterministic bug, not a
// timing issue) during a full-library sync. Filtering these out before
// they ever reach a backend RPC call is a defensive measure on our end
// regardless of whatever exactly Millennium's native code does with an
// out-of-range value.
const MAX_PLAUSIBLE_APP_ID = 10_000_000;

function isPlausibleAppId(appid: number): boolean {
	return Number.isInteger(appid) && appid > 0 && appid <= MAX_PLAUSIBLE_APP_ID;
}

/**
 * Same resolution as getAllOwnedAppIds(), but keyed by appid for
 * per-game lookups (name, playtime, etc.) -- steamData.ts's
 * readGameSnapshot() uses this instead of calling
 * SteamClient.Apps.GetAllApps() directly, so both enumeration and
 * per-game reads always agree on which underlying source actually has
 * data in this session.
 */
export function getAppOverviewMap(): Map<number, SteamAppOverview> {
	const map = new Map<number, SteamAppOverview>();
	for (const overview of resolveAppOverviews().overviews) {
		if (isPlausibleAppId(overview.appid)) {
			map.set(overview.appid, overview);
		}
	}
	return map;
}

function dedupeAppIds(overviews: SteamAppOverview[]): number[] {
	const ids = new Set<number>();
	let filteredOut = 0;
	for (const overview of overviews) {
		if (isPlausibleAppId(overview.appid)) {
			ids.add(overview.appid);
		} else if (overview.appid > 0) {
			filteredOut += 1;
		}
	}
	if (filteredOut > 0) {
		logInfo(`getAllOwnedAppIds: filtered out ${filteredOut} implausible appid(s) (> ${MAX_PLAUSIBLE_APP_ID})`);
	}
	return Array.from(ids);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * getAllOwnedAppIds() can return an empty list if called before Steam's
 * own frontend data has finished loading (observed at plugin-load time
 * in Deck Progress Tracker's Decky version too). Retries with increasing
 * delay before giving up.
 */
export async function getAllOwnedAppIdsWithRetry(maxAttempts = 5): Promise<number[]> {
	const delaysMs = [500, 1000, 2000, 3000, 5000];
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const ids = getAllOwnedAppIds();
		if (ids.length > 0) {
			return ids;
		}
		await sleep(delaysMs[Math.min(attempt, delaysMs.length - 1)]);
	}
	return getAllOwnedAppIds();
}
