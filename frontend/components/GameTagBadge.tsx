import type { JSX } from 'react';
import { useGameTag } from '../hooks/useGameTag';
import { GameTag } from './GameTag';
import { openTagManagerModal } from './TagManager';

interface GameTagBadgeProps {
	appid: number;
	windowRef: Window;
}

/** Mounted directly into Steam's game-detail page icon row by
 * lib/patchLibraryApp.tsx (a real DOM node, not a React-Router-rendered
 * child), so it renders inline alongside the native icons rather than as
 * an absolutely-positioned overlay. Syncs `appid` on mount, then renders
 * its current tag (or an "add tag" placeholder); clicking either opens the
 * tag/stats dialog through Steam's own modal system (see
 * openTagManagerModal in TagManager.tsx) rather than an in-tree overlay. */
export function GameTagBadge({ appid, windowRef }: GameTagBadgeProps): JSX.Element | null {
	const { record, loading } = useGameTag(appid);

	if (loading) {
		return null;
	}

	const openModal = () => openTagManagerModal(appid, windowRef, record?.game_name ?? 'Game');

	return (
		<div style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
			{record?.tag ? (
				<GameTag tag={record.tag} isManual={record.is_manual} onClick={openModal} />
			) : (
				<div
					onClick={openModal}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '6px',
						padding: '4px 8px',
						borderRadius: '4px',
						color: '#8f98a0',
						fontSize: '13px',
						fontWeight: 600,
						cursor: 'pointer',
					}}
				>
					<span
						style={{
							width: '8px',
							height: '8px',
							borderRadius: '50%',
							border: '1px dashed #8f98a0',
							flexShrink: 0,
						}}
					/>
					<span>ADD TAG</span>
				</div>
			)}
		</div>
	);
}
