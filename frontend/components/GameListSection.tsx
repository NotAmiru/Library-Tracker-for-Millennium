import { useState } from 'react';
import type { JSX } from 'react';
import { Focusable, Navigation } from 'millennium';
import { TAG_COLORS, TAG_LABELS, TagIcon } from './TagIcon';
import type { TagName } from '../types';

interface GameRow {
	appid: string;
	game_name: string;
}

interface GameListSectionProps {
	tag: TagName | 'backlog';
	count: number;
	games: GameRow[] | null;
	onExpand?: () => void;
}

function openGame(appid: string): void {
	Navigation.Navigate(`/library/app/${appid}`);
	Navigation.CloseSideMenus();
}

/** One expandable, tag-grouped section of the library dashboard.
 * `games` is `null` while lazily-loaded content (the backlog section) is
 * still in flight. */
export function GameListSection({ tag, count, games, onExpand }: GameListSectionProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);

	const label = tag === 'backlog' ? 'Backlog' : TAG_LABELS[tag];
	const color = tag === 'backlog' ? '#888' : TAG_COLORS[tag];

	return (
		<div style={{ marginBottom: '8px' }}>
			<div
				onClick={() => {
					const next = !expanded;
					setExpanded(next);
					if (next) {
						onExpand?.();
					}
				}}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					cursor: 'pointer',
					padding: '6px 4px',
					color,
					fontWeight: 600,
				}}
			>
				<span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
					{tag !== 'backlog' && <TagIcon tag={tag} />}
					{label} ({count})
				</span>
				<span>{expanded ? '▾' : '▸'}</span>
			</div>
			{expanded && (
				<Focusable flow-children="down" style={{ display: 'flex', flexDirection: 'column' }}>
					{games === null ? (
						<div style={{ padding: '4px 12px', fontSize: '12px', color: '#8f98a0' }}>Loading...</div>
					) : games.length === 0 ? (
						<div style={{ padding: '4px 12px', fontSize: '12px', color: '#8f98a0' }}>No games</div>
					) : (
						games.map((game) => (
							<div
								key={game.appid}
								onClick={() => openGame(game.appid)}
								style={{ padding: '4px 12px', fontSize: '13px', cursor: 'pointer' }}
							>
								{game.game_name}
							</div>
						))
					)}
				</Focusable>
			)}
		</div>
	);
}
