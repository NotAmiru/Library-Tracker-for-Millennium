import { useState } from 'react';
import type { JSX } from 'react';
import { useGameTag } from '../hooks/useGameTag';
import { GameTag } from './GameTag';
import { TagManager } from './TagManager';

interface GameTagBadgeProps {
	appid: number;
}

/** Injected into the game-detail page header by lib/patchLibraryApp.tsx.
 * Syncs `appid` on mount, then renders its current tag (or an "add tag"
 * placeholder), opening TagManager for manual overrides on click. */
export function GameTagBadge({ appid }: GameTagBadgeProps): JSX.Element | null {
	const { record, loading, setTag, remove, resetToAuto } = useGameTag(appid);
	const [managerOpen, setManagerOpen] = useState(false);

	if (loading) {
		return null;
	}

	return (
		<div style={{ position: 'absolute', top: '50px', right: '20px', zIndex: 10 }}>
			{record?.tag ? (
				<GameTag tag={record.tag} isManual={record.is_manual} onClick={() => setManagerOpen(true)} />
			) : (
				<div
					onClick={() => setManagerOpen(true)}
					style={{
						padding: '4px 10px',
						borderRadius: '999px',
						border: '1px dashed #888',
						color: '#888',
						fontSize: '13px',
						cursor: 'pointer',
					}}
				>
					+ Add Tag
				</div>
			)}
			{managerOpen && (
				<TagManager
					record={record}
					onClose={() => setManagerOpen(false)}
					onSetTag={(tag) => {
						void setTag(tag);
					}}
					onRemove={() => {
						void remove().then(() => setManagerOpen(false));
					}}
					onResetToAuto={() => {
						void resetToAuto();
					}}
				/>
			)}
		</div>
	);
}
