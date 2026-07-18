import { useState } from 'react';
import type { JSX } from 'react';
import { TAG_COLORS, TAG_LABELS } from './TagIcon';
import type { TagName } from '../types';

interface GameTagProps {
	tag: TagName;
	isManual: boolean;
	onClick: () => void;
}

/** Compact "● LABEL" tag, styled to sit inline alongside Steam's own
 * game-detail icon row (gear/controller/info/heart) rather than as a
 * bulky standalone pill -- matches the reference mockup. */
export function GameTag({ tag, isManual, onClick }: GameTagProps): JSX.Element {
	const [hovered, setHovered] = useState(false);
	const color = TAG_COLORS[tag];
	return (
		<div
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			title={isManual ? `${TAG_LABELS[tag]} (manually set)` : TAG_LABELS[tag]}
			className={`library-tracker-pill library-tracker-pill--${tag}${isManual ? ' library-tracker-pill--manual' : ''}`}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: '6px',
				padding: '4px 8px',
				borderRadius: '4px',
				background: hovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
				cursor: 'pointer',
				lineHeight: 1,
			}}
		>
			<span
				className="library-tracker-pill__dot"
				style={{
					width: '8px',
					height: '8px',
					borderRadius: '50%',
					background: color,
					flexShrink: 0,
				}}
			/>
			<span
				className="library-tracker-pill__label"
				style={{ color, fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}
			>
				{TAG_LABELS[tag]}
			</span>
			{isManual && (
				<span className="library-tracker-pill__manual-icon" style={{ color: '#8f98a0', fontSize: '11px' }} title="Manually set">
					✎
				</span>
			)}
		</div>
	);
}
