import type { JSX, MouseEvent } from 'react';
import { DialogButton, Focusable } from '@steambrew/client';
import { TAG_LABELS } from './TagIcon';
import type { GameRecord, TagName } from '../types';

interface TagManagerProps {
	record: GameRecord | null;
	onClose: () => void;
	onSetTag: (tag: TagName) => void;
	onRemove: () => void;
	onResetToAuto: () => void;
}

const ALL_TAGS: TagName[] = ['mastered', 'completed', 'in_progress', 'dropped'];

function stopPropagation(event: MouseEvent): void {
	event.stopPropagation();
}

export function TagManager({ record, onClose, onSetTag, onRemove, onResetToAuto }: TagManagerProps): JSX.Element {
	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(0, 0, 0, 0.6)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 1000,
			}}
			onClick={onClose}
		>
			<Focusable
				flow-children="down"
				onClick={stopPropagation}
				style={{
					background: '#1b2838',
					borderRadius: '8px',
					padding: '20px',
					minWidth: '320px',
					display: 'flex',
					flexDirection: 'column',
					gap: '10px',
				}}
			>
				<div style={{ fontSize: '16px', fontWeight: 600 }}>Game Progress</div>

				{record && (
					<div style={{ fontSize: '13px', color: '#8f98a0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
						<div>
							Playtime: {Math.floor(record.playtime_minutes / 60)}h {record.playtime_minutes % 60}m
						</div>
						<div>
							Achievements: {record.unlocked_achievements}/{record.total_achievements}
						</div>
					</div>
				)}

				<Focusable flow-children="horizontal" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
					{ALL_TAGS.map((tag) => (
						<DialogButton key={tag} onClick={() => onSetTag(tag)}>
							{TAG_LABELS[tag]}
						</DialogButton>
					))}
				</Focusable>

				<Focusable flow-children="horizontal" style={{ display: 'flex', gap: '8px' }}>
					<DialogButton onClick={onResetToAuto}>Reset to Auto</DialogButton>
					<DialogButton onClick={onRemove}>Remove</DialogButton>
					<DialogButton onClick={onClose}>Close</DialogButton>
				</Focusable>
			</Focusable>
		</div>
	);
}
