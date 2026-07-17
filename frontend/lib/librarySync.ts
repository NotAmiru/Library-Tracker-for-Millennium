import { getAllOwnedAppIdsWithRetry } from './libraryEnumeration';
import { syncGame } from './sync';

export interface LibrarySyncProgress {
	current: number;
	total: number;
	newTags: number;
	errors: number;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A real-device full-library sync (389 games) crashed Millennium's own
// native Lua VM host process outright (millennium.luavm64.exe, confirmed
// via the user's crash.dmp: EXCEPTION_ACCESS_VIOLATION, a null-pointer
// read at a small offset, inside Millennium's own code -- not this
// plugin's Lua, which pcall already wraps everywhere it can). A native
// crash in the host process can't be caught or prevented from this
// plugin's own code at all, so there's no real fix available here --
// this is a defensive pacing measure only, giving Millennium's backend
// bridge a fixed minimum gap between calls instead of firing the next
// RPC the instant the previous one resolves (which, for a game that
// skips its HLTB lookup entirely, can be near-instant, producing bursts
// far tighter than typical HLTB-network-latency-paced calls).
const SYNC_PACING_MS = 200;

/**
 * Syncs every owned game one at a time (mirroring Deck Progress
 * Tracker's "progressive" sync design), reporting progress after each
 * game so the caller can update a UI without waiting for the whole
 * library. A single failed game doesn't abort the rest of the sync.
 */
export async function syncLibraryProgressive(onProgress?: (progress: LibrarySyncProgress) => void): Promise<LibrarySyncProgress> {
	const appIds = await getAllOwnedAppIdsWithRetry();
	const progress: LibrarySyncProgress = { current: 0, total: appIds.length, newTags: 0, errors: 0 };
	onProgress?.(progress);

	for (const appid of appIds) {
		try {
			const result = await syncGame(appid);
			if (result.tag_changed) {
				progress.newTags += 1;
			}
		} catch {
			progress.errors += 1;
		}
		progress.current += 1;
		onProgress?.({ ...progress });
		await sleep(SYNC_PACING_MS);
	}

	return progress;
}
