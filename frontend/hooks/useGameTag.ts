import { useCallback, useEffect, useState } from 'react';
import { getGameRecord, syncGame } from '../lib/sync';
import { removeTag, resetToAutoTag, setManualTag } from '../lib/tagActions';
import { logError } from '../lib/log';
import type { GameRecord, TagName } from '../types';

const SYNC_TIMEOUT_MS = 8000;

/** A hung syncGame() call (e.g. SteamClient.Apps.GetMyAchievementsForApp
 * never resolving for a game Steam hasn't loaded achievement data for
 * this session) must not block the badge from ever showing anything --
 * without this, `loading` would never flip to `false` and the whole
 * badge stays invisible indefinitely rather than falling back to
 * whatever's already stored. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}

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
			// A failed or hung sync attempt must not prevent showing
			// whatever's already correctly stored from a previous sync --
			// these two steps used to be one try block, so a syncGame()
			// failure (throw or hang) meant getGameRecord() never even ran,
			// leaving the badge stuck on "+ Add Tag" (or blank entirely)
			// regardless of the real, already-tagged state in storage.
			try {
				await withTimeout(syncGame(appid), SYNC_TIMEOUT_MS);
			} catch (error) {
				logError(`initial sync for appid ${appid} failed`, error);
			}
			try {
				const result = await getGameRecord(appid);
				if (!cancelled) {
					setRecord(result.record);
				}
			} catch (error) {
				logError(`getGameRecord(${appid}) failed`, error);
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
