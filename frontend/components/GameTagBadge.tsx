import { useState } from 'react';
import type { JSX } from 'react';
import { useGameTag } from '../hooks/useGameTag';
import { GameTag } from './GameTag';
import { TagManager } from './TagManager';

interface GameTagBadgeProps {
	appid: number;
}

/** Mounted directly into Steam's game-detail page icon row by
 * lib/patchLibraryApp.tsx (a real DOM node, not a React-Router-rendered
 * child), so it renders inline alongside the native icons rather than as
 * an absolutely-positioned overlay. Syncs `appid` on mount, then renders
 * its current tag (or an "add tag" placeholder), opening TagManager for
 * manual overrides on click. */
export function GameTagBadge({ appid }: GameTagBadgeProps): JSX.Element | null {
	const { record, loading, setTag, remove, resetToAuto } = useGameTag(appid);
	const [managerOpen, setManagerOpen] = useState(false);

	if (loading) {
		return null;
	}

	return (
		<div style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
			{record?.tag ? (
				<GameTag tag={record.tag} isManual={record.is_manual} onClick={() => setManagerOpen(true)} />
			) : (
				<div
					onClick={() => setManagerOpen(true)}
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
			{managerOpen && (
				<TagManager
					appid={appid}
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
