import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ButtonItem, PanelSection, PanelSectionRow } from '@steambrew/client';
import { GameListSection } from './GameListSection';
import { SettingsPanel } from './SettingsPanel';
import { getBacklogGames, getTagStatistics, getTaggedGames } from '../lib/queries';
import type { BacklogGame, TagStatistics, TaggedGame } from '../lib/queries';
import { syncLibraryProgressive } from '../lib/librarySync';
import { logError } from '../lib/log';
import type { TagName } from '../types';

const TAG_DISPLAY_ORDER: TagName[] = ['in_progress', 'completed', 'mastered', 'dropped'];

export function Settings(): JSX.Element {
	const [stats, setStats] = useState<TagStatistics | null>(null);
	const [taggedGames, setTaggedGames] = useState<TaggedGame[]>([]);
	const [backlogGames, setBacklogGames] = useState<BacklogGame[] | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const [nextStats, nextTagged] = await Promise.all([getTagStatistics(), getTaggedGames()]);
			setStats(nextStats);
			setTaggedGames(nextTagged);
		} catch (error) {
			logError('refreshing dashboard stats failed', error);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const gamesForTag = useCallback((tag: TagName) => taggedGames.filter((game) => game.tag === tag), [taggedGames]);

	const loadBacklog = useCallback(() => {
		if (backlogGames === null) {
			getBacklogGames()
				.then(setBacklogGames)
				.catch((error: unknown) => logError('loading backlog games failed', error));
		}
	}, [backlogGames]);

	const handleSync = useCallback(async () => {
		setSyncing(true);
		setMessage('Checking for games to sync...');
		try {
			const result = await syncLibraryProgressive((progress) => {
				const prefix = progress.resumed ? 'Resuming sync' : 'Syncing';
				setMessage(`${prefix} ${progress.current}/${progress.total}...`);
			});
			setMessage(`Synced ${result.total} games, ${result.newTags} tag changes, ${result.errors} error(s).`);
			await refresh();
			setBacklogGames(null);
		} catch (error) {
			logError('library sync failed', error);
			setMessage('Sync failed -- see console for details.');
		} finally {
			setSyncing(false);
		}
	}, [refresh]);

	return (
		<>
			<PanelSection title="Library Tracker">
				<PanelSectionRow>
					<ButtonItem layout="below" onClick={() => void handleSync()} disabled={syncing}>
						{syncing ? 'Syncing...' : 'Sync Entire Library'}
					</ButtonItem>
				</PanelSectionRow>

				{message && (
					<PanelSectionRow>
						<div style={{ fontSize: '12px', color: '#8f98a0' }}>{message}</div>
					</PanelSectionRow>
				)}

				<PanelSectionRow>
					<div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
						{TAG_DISPLAY_ORDER.map((tag) => (
							<GameListSection key={tag} tag={tag} count={stats ? stats[tag] : 0} games={gamesForTag(tag)} />
						))}
						<GameListSection
							tag="backlog"
							count={stats ? stats.backlog : 0}
							games={backlogGames}
							onExpand={loadBacklog}
						/>
					</div>
				</PanelSectionRow>
			</PanelSection>

			<SettingsPanel />
		</>
	);
}
