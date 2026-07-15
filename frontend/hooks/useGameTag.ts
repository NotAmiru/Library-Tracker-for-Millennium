import { useCallback, useEffect, useState } from 'react';
import { getGameRecord, syncGame } from '../lib/sync';
import { removeTag, resetToAutoTag, setManualTag } from '../lib/tagActions';
import { logError } from '../lib/log';
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
 * stored tag record plus the manual-override actions. Also listens for
 * real-time achievement unlocks for this appid (SteamClient.GameSessions'
 * push notification, rather than Deck Progress Tracker's original
 * polling-based achievement-cache watcher) and re-syncs immediately when
 * one arrives, so the badge reflects a fresh unlock without waiting for
 * the next full sync. */
export function useGameTag(appid: number): UseGameTagResult {
	const [record, setRecord] = useState<GameRecord | null>(null);
	const [loading, setLoading] = useState(true);

	const refetch = useCallback(async () => {
		try {
			const result = await getGameRecord(appid);
			setRecord(result.record);
		} catch (error) {
			logError(`getGameRecord(${appid}) failed`, error);
		}
	}, [appid]);

	useEffect(() => {
		let cancelled = false;

		const initialSync = async () => {
			setLoading(true);
			try {
				await syncGame(appid);
				const result = await getGameRecord(appid);
				if (!cancelled) {
					setRecord(result.record);
				}
			} catch (error) {
				logError(`initial sync for appid ${appid} failed`, error);
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};
		void initialSync();

		// Registration itself can throw synchronously (e.g. this API isn't
		// present on the installed Steam/Millennium version) -- since this
		// runs inside a route-injected component wrapped in an
		// ErrorBoundary, an uncaught throw here would silently blank out
		// the whole badge rather than just skip this one enhancement.
		let registration: ReturnType<typeof SteamClient.GameSessions.RegisterForAchievementNotification> | null = null;
		try {
			registration = SteamClient.GameSessions.RegisterForAchievementNotification((notification) => {
				if (notification.unAppID !== appid) {
					return;
				}
				syncGame(appid)
					.then(() => refetch())
					.catch((error: unknown) => logError(`achievement-triggered sync for appid ${appid} failed`, error));
			});
		} catch (error) {
			logError(`RegisterForAchievementNotification failed for appid ${appid}`, error);
		}

		return () => {
			cancelled = true;
			registration?.unregister();
		};
	}, [appid, refetch]);

	const setTag = useCallback(
		async (tag: TagName) => {
			try {
				await setManualTag(appid, tag);
				await refetch();
			} catch (error) {
				logError(`setManualTag(${appid}, ${tag}) failed`, error);
			}
		},
		[appid, refetch],
	);

	const remove = useCallback(async () => {
		try {
			await removeTag(appid);
			await refetch();
		} catch (error) {
			logError(`removeTag(${appid}) failed`, error);
		}
	}, [appid, refetch]);

	const resetToAuto = useCallback(async () => {
		try {
			await resetToAutoTag(appid);
			await refetch();
		} catch (error) {
			logError(`resetToAutoTag(${appid}) failed`, error);
		}
	}, [appid, refetch]);

	return { record, loading, refetch, setTag, remove, resetToAuto };
}
