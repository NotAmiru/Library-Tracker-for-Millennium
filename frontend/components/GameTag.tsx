import type { JSX } from 'react';
import { TAG_COLORS, TAG_LABELS, TagIcon } from './TagIcon';
import type { TagName } from '../types';

interface GameTagProps {
	tag: TagName;
	isManual: boolean;
	onClick: () => void;
}

export function GameTag({ tag, isManual, onClick }: GameTagProps): JSX.Element {
	const color = TAG_COLORS[tag];
	return (
		<div
			onClick={onClick}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '6px',
				padding: '4px 10px',
				borderRadius: '999px',
				background: `${color}33`,
				border: `1px solid ${color}`,
				color,
				fontSize: '13px',
				fontWeight: 600,
				cursor: 'pointer',
			}}
		>
			<TagIcon tag={tag} />
			<span>{TAG_LABELS[tag]}</span>
			{isManual && <span title="Manually set">✎</span>}
		</div>
	);
}
