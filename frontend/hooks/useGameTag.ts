import { useCallback, useEffect, useState } from 'react';
import { getGameRecord, syncGame } from '../lib/sync';
import { removeTag, resetToAutoTag, setManualTag } from '../lib/tagActions';
import type { GameRecord, TagName } from '../types';

interface UseGameTagResult {
	record: GameRecord | null;
	loading: boolean;
	refetch: () => Promise<void>;
	setTag: (tag: TagName) => Promise<void>;
	remove: () => Promise<void>;
	resetToAuto: () => Promise<void>;
}

/** Syncs `appid` against Steam's live data on mount, then exposes its
 * stored tag record plus the manual-override actions. */
export function useGameTag(appid: number): UseGameTagResult {
	const [record, setRecord] = useState<GameRecord | null>(null);
	const [loading, setLoading] = useState(true);

	const refetch = useCallback(async () => {
		const result = await getGameRecord(appid);
		setRecord(result.record);
	}, [appid]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		void (async () => {
			await syncGame(appid);
			const result = await getGameRecord(appid);
			if (!cancelled) {
				setRecord(result.record);
				setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [appid]);

	const setTag = useCallback(
		async (tag: TagName) => {
			await setManualTag(appid, tag);
			await refetch();
		},
		[appid, refetch],
	);

	const remove = useCallback(async () => {
		await removeTag(appid);
		await refetch();
	}, [appid, refetch]);

	const resetToAuto = useCallback(async () => {
		await resetToAutoTag(appid);
		await refetch();
	}, [appid, refetch]);

	return { record, loading, refetch, setTag, remove, resetToAuto };
}
