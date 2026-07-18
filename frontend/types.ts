export type TagName = 'mastered' | 'completed' | 'dropped' | 'in_progress';

export interface PluginSettings {
	mastered_achievement_percent: number;
	in_progress_threshold_minutes: number;
	dropped_days_threshold: number;
	hltb_cache_soft_ttl_hours: number;
	hltb_cache_hard_ttl_days: number;
}

export interface GameRecord {
	game_name: string;
	playtime_minutes: number;
	total_achievements: number;
	unlocked_achievements: number;
	rt_last_time_played: number | null;
	last_sync: number;
	tag: TagName | null;
	is_manual: boolean;
}

export interface SyncResult {
	success: boolean;
	appid: string;
	tag: TagName | null;
	tag_changed: boolean;
	record: GameRecord;
	error?: string;
}

export interface GetSettingsResult {
	success: boolean;
	settings: PluginSettings;
}

export interface GetGameRecordResult {
	success: boolean;
	record: GameRecord | null;
}

export interface HltbData {
	game_name: string;
	matched_name?: string;
	similarity?: number;
	main_story?: number;
	main_extra?: number;
	completionist?: number;
	cached_at: number;
}

export interface GetHltbDataResult {
	success: boolean;
	hltb: HltbData | null;
}

export interface SyncQueue {
	pending: (number | string)[];
	total: number;
}

export interface StartSyncQueueResult {
	success: boolean;
	total: number;
}

export interface GetSyncQueueResult {
	success: boolean;
	queue?: SyncQueue;
}

export interface PopSyncQueueResult {
	success: boolean;
	remaining: number;
}

export interface ClearSyncQueueResult {
	success: boolean;
}
