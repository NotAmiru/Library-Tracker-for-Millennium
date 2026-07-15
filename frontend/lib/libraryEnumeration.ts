import type { SteamAppOverview } from 'millennium';

/**
 * Best-effort enumeration of every appid the current user owns (installed
 * or not, Steam or non-Steam shortcuts), read from whichever of Steam's
 * several internal, undocumented app collections happens to be populated.
 *
 * None of these are part of Millennium's official SDK types -- the
 * fallback chain is confirmed via source reading of published Millennium
 * reference plugins (SteamHunter-plugin, hltb-millennium-plugin), which
 * rely on the same set of candidates because no single one is reliably
 * present across every Steam client version / UI mode. Local `as`
 * casts are used instead of augmenting the global Window type, since the
 * SDK's own ambient `appStore` declaration can't be safely merged with
 * additional untyped properties.
 */
export function getAllOwnedAppIds(): number[] {
	const w = window as unknown as {
		SteamClient?: { Apps?: { GetAllApps?: () => SteamAppOverview[] } };
		collectionStore?: {
			allAppsCollection?: { allApps?: SteamAppOverview[] };
			allGamesCollection?: { allApps?: SteamAppOverview[] };
		};
		appStore?: { allApps?: SteamAppOverview[]; m_mapApps?: Map<number, SteamAppOverview> };
	};

	const fromSteamClient = w.SteamClient?.Apps?.GetAllApps?.();
	if (fromSteamClient && fromSteamClient.length > 0) {
		return dedupeAppIds(fromSteamClient);
	}

	const fromCollectionAll = w.collectionStore?.allAppsCollection?.allApps;
	if (fromCollectionAll && fromCollectionAll.length > 0) {
		return dedupeAppIds(fromCollectionAll);
	}

	const fromCollectionGames = w.collectionStore?.allGamesCollection?.allApps;
	if (fromCollectionGames && fromCollectionGames.length > 0) {
		return dedupeAppIds(fromCollectionGames);
	}

	const fromAppStoreAll = w.appStore?.allApps;
	if (fromAppStoreAll && fromAppStoreAll.length > 0) {
		return dedupeAppIds(fromAppStoreAll);
	}

	const fromAppStoreMap = w.appStore?.m_mapApps;
	if (fromAppStoreMap && fromAppStoreMap.size > 0) {
		return Array.from(fromAppStoreMap.keys()).filter((appid) => appid > 0);
	}

	return [];
}

function dedupeAppIds(overviews: SteamAppOverview[]): number[] {
	const ids = new Set<number>();
	for (const overview of overviews) {
		if (overview.appid > 0) {
			ids.add(overview.appid);
		}
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
