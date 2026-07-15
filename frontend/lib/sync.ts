import { jsonRpc } from './rpc';
import { readGameSnapshot } from './steamData';
import type { GetGameRecordResult, SyncResult } from '../types';

const syncGameRpc = jsonRpc<SyncResult>('sync_game');
const getGameRecordRpc = jsonRpc<GetGameRecordResult>('get_game_record');

/** Reads an app's current Steam data and pushes it to the backend to
 * recompute its tag. Safe to call repeatedly (e.g. on every visit to a
 * game's page); a manually-tagged game's tag is never overwritten. */
export async function syncGame(appid: number): Promise<SyncResult> {
	const snapshot = await readGameSnapshot(appid);

	const params: Record<string, unknown> = {
		appid: snapshot.appid,
		game_name: snapshot.gameName,
		playtime_minutes: snapshot.playtimeMinutes,
		total_achievements: snapshot.totalAchievements,
		unlocked_achievements: snapshot.unlockedAchievements,
	};
	// Only ever included when known -- see rpc.ts for why null is never
	// sent explicitly.
	if (snapshot.rtLastTimePlayed !== null) {
		params.rt_last_time_played = snapshot.rtLastTimePlayed;
	}

	return syncGameRpc(params);
}

export async function getGameRecord(appid: number): Promise<GetGameRecordResult> {
	return getGameRecordRpc({ appid });
}
