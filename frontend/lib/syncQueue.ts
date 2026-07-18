import { jsonRpc } from './rpc';
import type { ClearSyncQueueResult, GetSyncQueueResult, PopSyncQueueResult, StartSyncQueueResult, SyncQueue } from '../types';

const startSyncQueueRpc = jsonRpc<StartSyncQueueResult>('start_sync_queue');
const getSyncQueueRpc = jsonRpc<GetSyncQueueResult>('get_sync_queue');
const popSyncQueueRpc = jsonRpc<PopSyncQueueResult>('pop_sync_queue');
const clearSyncQueueRpc = jsonRpc<ClearSyncQueueResult>('clear_sync_queue');

/** Starts a fresh full-library sync queue on the backend, discarding any
 * previous (e.g. crash-interrupted) one. */
export async function startSyncQueue(appids: number[]): Promise<void> {
	await startSyncQueueRpc({ appids });
}

/** Whatever sync queue is currently persisted on disk, or null if there
 * isn't one -- a non-null result with a non-empty `pending` array means
 * a previous sync was interrupted (most notably by the Millennium
 * native-host crash this exists to make recoverable from) and can be
 * resumed instead of starting the whole library over. */
export async function getSyncQueue(): Promise<SyncQueue | null> {
	const result = await getSyncQueueRpc();
	return result.queue ?? null;
}

/** Removes `appid` from the pending queue, persisted immediately. */
export async function popSyncQueue(appid: number): Promise<void> {
	await popSyncQueueRpc({ appid });
}

/** Clears the queue entirely (sync finished, or the caller wants to
 * restart fresh instead of resuming). */
export async function clearSyncQueue(): Promise<void> {
	await clearSyncQueueRpc();
}
