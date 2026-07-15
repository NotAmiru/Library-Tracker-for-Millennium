import { getAllOwnedAppIdsWithRetry } from './libraryEnumeration';
import { syncGame } from './sync';

export interface LibrarySyncProgress {
	current: number;
	total: number;
	newTags: number;
	errors: number;
}

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
	}

	return progress;
}
