import { jsonRpc } from './rpc';
import type { TagName } from '../types';

export interface TagStatistics {
	mastered: number;
	completed: number;
	in_progress: number;
	dropped: number;
	backlog: number;
	total: number;
}

export interface TaggedGame {
	appid: string;
	game_name: string;
	tag: TagName;
	is_manual: boolean;
}

export interface BacklogGame {
	appid: string;
	game_name: string;
}

const getTagStatisticsRpc = jsonRpc<{ success: boolean; stats: TagStatistics }>('get_tag_statistics');
const getTaggedGamesRpc = jsonRpc<{ success: boolean; games: TaggedGame[] }>('get_tagged_games');
const getBacklogGamesRpc = jsonRpc<{ success: boolean; games: BacklogGame[] }>('get_backlog_games');

export async function getTagStatistics(): Promise<TagStatistics> {
	const result = await getTagStatisticsRpc();
	return result.stats;
}

export async function getTaggedGames(): Promise<TaggedGame[]> {
	const result = await getTaggedGamesRpc();
	return result.games;
}

export async function getBacklogGames(): Promise<BacklogGame[]> {
	const result = await getBacklogGamesRpc();
	return result.games;
}
