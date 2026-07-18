import { getAllOwnedAppIdsWithRetry } from './libraryEnumeration';
import { syncGame } from './sync';
import { clearSyncQueue, getSyncQueue, popSyncQueue, startSyncQueue } from './syncQueue';
import { logInfo } from './log';

export interface LibrarySyncProgress {
	current: number;
	total: number;
	newTags: number;
	errors: number;
	resumed: boolean;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// See sync_queue.lua for the full story: Millennium's own native host
// has crashed outright (EXCEPTION_ACCESS_VIOLATION at an identical
// faulting instruction, four times on one real device) partway through
// a full-library sync, unaffected by request pacing, appid-range
// filtering, or app-type filtering -- a deterministic bug in
// Millennium's own code that this plugin has no way to fix or prevent.
// What IS within reach: making a crash cost as little progress as
// possible. The backend persists the pending-appid queue to disk and
// pops one off after every single game, so even a crash between two RPC
// calls only loses whatever game was actually in flight -- the next
// sync run resumes from the queue instead of starting the whole library
// over.
//
// Processing in fixed-size batches with a longer pause between them (on
// top of the existing per-game SYNC_PACING_MS) is an *additional*,
// unconfirmed measure: if the native bug is triggered by cumulative call
// volume within one continuous run rather than pure count, periodic
// idle gaps might avoid it outright rather than merely surviving it.
const BATCH_SIZE = 50;
const SYNC_PACING_MS = 200;
const BATCH_PAUSE_MS = 5000;

/**
 * Syncs every owned game, resuming a previous run's leftover queue if
 * one exists instead of starting over, and persisting progress after
 * every game so a crash mid-sync only costs whatever game was in
 * flight. Reports progress after each game so the caller can update a
 * UI without waiting for the whole library. A single failed game
 * doesn't abort the rest of the sync.
 */
export async function syncLibraryProgressive(onProgress?: (progress: LibrarySyncProgress) => void): Promise<LibrarySyncProgress> {
	const existingQueue = await getSyncQueue();
	const resumed = Boolean(existingQueue && existingQueue.pending.length > 0);

	let pending: (number | string)[];
	let total: number;
	if (resumed && existingQueue) {
		pending = existingQueue.pending;
		total = existingQueue.total;
		logInfo(`resuming full-library sync: ${pending.length}/${total} game(s) remaining`);
	} else {
		const appIds = await getAllOwnedAppIdsWithRetry();
		await startSyncQueue(appIds);
		pending = appIds;
		total = appIds.length;
	}

	const progress: LibrarySyncProgress = { current: total - pending.length, total, newTags: 0, errors: 0, resumed };
	onProgress?.({ ...progress });

	let sinceLastPause = 0;
	while (pending.length > 0) {
		const appid = Number(pending[0]);
		try {
			const result = await syncGame(appid);
			if (result.tag_changed) {
				progress.newTags += 1;
			}
		} catch {
			progress.errors += 1;
		}

		await popSyncQueue(appid);
		pending = pending.slice(1);
		progress.current += 1;
		onProgress?.({ ...progress });

		await sleep(SYNC_PACING_MS);

		sinceLastPause += 1;
		if (sinceLastPause >= BATCH_SIZE && pending.length > 0) {
			sinceLastPause = 0;
			await sleep(BATCH_PAUSE_MS);
		}
	}

	await clearSyncQueue();
	return progress;
}
