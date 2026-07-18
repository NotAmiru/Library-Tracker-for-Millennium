import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, JSX, MouseEvent, ReactNode } from 'react';
import { useGameTag } from '../hooks/useGameTag';
import { TAG_COLORS, TAG_LABELS } from './TagIcon';
import { getHltbData } from '../lib/hltb';
import { logError } from '../lib/log';
import type { HltbData, TagName } from '../types';

interface TagManagerProps {
	appid: number;
	windowRef: Window;
	onClose: () => void;
}

const ALL_TAGS: TagName[] = ['mastered', 'completed', 'in_progress', 'dropped'];

function stopPropagation(event: MouseEvent): void {
	event.stopPropagation();
}

function formatPlaytime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours}h ${mins}m`;
}

function formatHours(hours: number | undefined): string {
	if (hours === undefined || hours <= 0) {
		return 'Unknown';
	}
	return `${hours.toFixed(1)} hrs`;
}

function StatRow({ name, label, value }: { name: string; label: string; value: string }): JSX.Element {
	return (
		<div
			className={`library-tracker-stat-row library-tracker-stat-row--${name}`}
			style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' }}
		>
			<span className="library-tracker-stat-row__label" style={{ color: '#8f98a0' }}>
				{label}
			</span>
			<span className="library-tracker-stat-row__value" style={{ color: '#fff', fontWeight: 500 }}>
				{value}
			</span>
		</div>
	);
}

function SectionHeader({ name, children }: { name: string; children: string }): JSX.Element {
	return (
		<div
			className={`library-tracker-section-header library-tracker-section-header--${name}`}
			style={{
				fontSize: '11px',
				fontWeight: 700,
				letterSpacing: '0.08em',
				color: '#8f98a0',
				textTransform: 'uppercase',
				marginBottom: '6px',
				paddingBottom: '4px',
				borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
			}}
		>
			{children}
		</div>
	);
}

/** Plain clickable div styled like a button, with a hover highlight --
 * NOT Millennium's DialogButton. DialogButton/Focusable are resolved via
 * webpack-string-matching against Steam's own minified bundle
 * (findModuleExport in @steambrew/client), which can silently come back
 * undefined on a given Steam build; every previous version of this dialog
 * wrapped its content in Focusable/DialogButton and rendered as an empty
 * box regardless of how the dialog itself was mounted, which is exactly
 * what you'd see if those components failed to resolve. GameTag's pill
 * and the "ADD TAG" placeholder are plain divs and are the only pieces of
 * this UI confirmed to actually render, so the dialog now matches that. */
function ActionButton({
	children,
	onClick,
	className,
	style,
}: {
	children: ReactNode;
	onClick: () => void;
	className?: string;
	style?: CSSProperties;
}): JSX.Element {
	const [hovered, setHovered] = useState(false);
	return (
		<div
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			className={`library-tracker-action-button${className ? ` ${className}` : ''}${hovered ? ' library-tracker-action-button--hovered' : ''}`}
			style={{
				textAlign: 'center',
				padding: '8px',
				borderRadius: '4px',
				cursor: 'pointer',
				fontSize: '13px',
				fontWeight: 700,
				userSelect: 'none',
				background: '#2a3f5a',
				color: '#fff',
				border: '2px solid transparent',
				filter: hovered ? 'brightness(1.15)' : undefined,
				...style,
			}}
		>
			{children}
		</div>
	);
}

/** Renders the tag/stats dialog by portaling straight into
 * `windowRef.document.body` instead of as a normal in-tree child of
 * GameTagBadge. The overlay itself (`position: fixed; inset: 0`) is
 * unchanged from what already rendered correctly once nested inline --
 * that bug was where it was nested: GameTagBadge's mount point is inside
 * Steam's hero-banner icon row, and that banner sets a CSS `transform`
 * for its parallax effect. Per spec, a `transform`d ancestor becomes the
 * containing block for any `position: fixed` descendant, so the overlay
 * was getting clipped to that banner's thin icon-row box instead of the
 * viewport. Portaling to `document.body` (the top of the tree, outside
 * any such ancestor) sidesteps that entirely.
 *
 * Content is built from plain styled divs (ActionButton above), not
 * Millennium's Focusable/DialogButton -- see ActionButton's comment for
 * why: those depend on a webpack-reflection lookup that can silently fail
 * per Steam build, and did produce the same empty-box symptom here
 * regardless of mounting strategy (inline overlay, Steam's own
 * showModal/ModalRoot, and this portal all showed it identically, and
 * Focusable/DialogButton was the one thing common to all three).
 *
 * Every element carries a `library-tracker-*` className alongside its
 * inline style (which stays as the default look) so Quick CSS themes can
 * target and override pieces individually -- see README.md's Theming
 * section for the full class list. */
export function TagManager({ appid, windowRef, onClose }: TagManagerProps): JSX.Element | null {
	const { record, setTag, remove, resetToAuto } = useGameTag(appid);
	const [hltb, setHltb] = useState<HltbData | null>(null);

	useEffect(() => {
		let cancelled = false;
		getHltbData(appid)
			.then((data) => {
				if (!cancelled) {
					setHltb(data);
				}
			})
			.catch((error: unknown) => logError(`getHltbData(${appid}) failed`, error));
		return () => {
			cancelled = true;
		};
	}, [appid]);

	const portalTarget = windowRef?.document?.body;
	if (!portalTarget) {
		logError('TagManager: windowRef.document.body unavailable, cannot open dialog', new Error('missing portal target'));
		return null;
	}

	const activeTag = record?.tag ?? null;
	const statusColor = activeTag ? TAG_COLORS[activeTag] : '#8f98a0';

	return createPortal(
		<div
			className="library-tracker-dialog-overlay"
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
			<div
				onClick={stopPropagation}
				className="library-tracker-dialog"
				style={{
					background: '#1b2838',
					borderRadius: '8px',
					padding: '20px',
					width: '360px',
					display: 'flex',
					flexDirection: 'column',
					gap: '14px',
				}}
			>
				<div
					className="library-tracker-dialog__header"
					style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}
				>
					<div className="library-tracker-dialog__title" style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
						{record?.game_name ?? 'Game'}
					</div>
					{activeTag && (
						<div
							className={`library-tracker-dialog__status library-tracker-dialog__status--${activeTag}`}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '5px',
								padding: '3px 8px',
								borderRadius: '4px',
								background: statusColor,
								color: '#fff',
								fontSize: '11px',
								fontWeight: 700,
								whiteSpace: 'nowrap',
								textTransform: 'uppercase',
							}}
						>
							<span className="library-tracker-dialog__status-icon">✓</span>
							<span className="library-tracker-dialog__status-label">
								{TAG_LABELS[activeTag]} {record?.is_manual ? '(Manual)' : '(Auto)'}
							</span>
						</div>
					)}
				</div>

				<div className="library-tracker-dialog__section library-tracker-dialog__section--statistics">
					<SectionHeader name="statistics">Statistics</SectionHeader>
					<StatRow name="playtime" label="Playtime" value={record ? formatPlaytime(record.playtime_minutes) : '0h 0m'} />
					<StatRow
						name="achievements"
						label="Achievements"
						value={record ? `${record.unlocked_achievements}/${record.total_achievements}` : '0/0'}
					/>
					<StatRow name="hltb-match" label="HLTB Match" value={hltb?.matched_name ?? 'Not found'} />
					<StatRow name="main-story" label="Main Story" value={formatHours(hltb?.main_story)} />
				</div>

				<div className="library-tracker-dialog__section library-tracker-dialog__section--set-tag">
					<SectionHeader name="set-tag">Set Tag</SectionHeader>
					<div className="library-tracker-tag-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
						{ALL_TAGS.map((tag) => {
							const isActive = activeTag === tag;
							return (
								<ActionButton
									key={tag}
									onClick={() => void setTag(tag)}
									className={`library-tracker-action-button--${tag}${isActive ? ' library-tracker-action-button--active' : ''}`}
									style={{
										background: TAG_COLORS[tag],
										border: isActive ? '2px solid #fff' : '2px solid transparent',
									}}
								>
									{TAG_LABELS[tag]}
								</ActionButton>
							);
						})}
					</div>
				</div>

				<div className="library-tracker-dialog__actions" style={{ display: 'flex', gap: '8px' }}>
					<ActionButton onClick={() => void resetToAuto()} className="library-tracker-action-button--reset" style={{ flex: 1 }}>
						Reset to Auto
					</ActionButton>
					<ActionButton
						onClick={() => void remove().then(onClose)}
						className="library-tracker-action-button--remove"
						style={{ flex: 1 }}
					>
						Remove
					</ActionButton>
				</div>

				<ActionButton onClick={onClose} className="library-tracker-action-button--close" style={{ width: '100%' }}>
					Close
				</ActionButton>
			</div>
		</div>,
		portalTarget,
	);
}
