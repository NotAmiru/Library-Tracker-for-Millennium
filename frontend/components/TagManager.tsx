import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { DialogButton, Focusable, ModalRoot, showModal } from '@steambrew/client';
import { FaCheck } from 'react-icons/fa';
import { useGameTag } from '../hooks/useGameTag';
import { TAG_COLORS, TAG_LABELS } from './TagIcon';
import { getHltbData } from '../lib/hltb';
import { logError } from '../lib/log';
import type { HltbData, TagName } from '../types';

interface TagManagerContentProps {
	appid: number;
	onClose: () => void;
}

const ALL_TAGS: TagName[] = ['mastered', 'completed', 'in_progress', 'dropped'];

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

function StatRow({ label, value }: { label: string; value: string }): JSX.Element {
	return (
		<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' }}>
			<span style={{ color: '#8f98a0' }}>{label}</span>
			<span style={{ color: '#fff', fontWeight: 500 }}>{value}</span>
		</div>
	);
}

function SectionHeader({ children }: { children: string }): JSX.Element {
	return (
		<div
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

/** The dialog's actual content, rendered inside Steam's own ModalRoot (via
 * showModal below) rather than our own DOM tree -- see openTagManagerModal
 * for why. Self-contained: subscribes to useGameTag itself instead of
 * receiving state as props, since showModal's tree is detached from
 * GameTagBadge's, so props passed in at call time can't stay live. */
function TagManagerContent({ appid, onClose }: TagManagerContentProps): JSX.Element {
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

	const activeTag = record?.tag ?? null;
	const statusColor = activeTag ? TAG_COLORS[activeTag] : '#8f98a0';

	return (
		<ModalRoot closeModal={onClose} onCancel={onClose}>
			<Focusable flow-children="down" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
				<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
					<div style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>{record?.game_name ?? 'Game'}</div>
					{activeTag && (
						<div
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
							<FaCheck size={10} />
							<span>
								{TAG_LABELS[activeTag]} {record?.is_manual ? '(Manual)' : '(Auto)'}
							</span>
						</div>
					)}
				</div>

				<div>
					<SectionHeader>Statistics</SectionHeader>
					<StatRow label="Playtime" value={record ? formatPlaytime(record.playtime_minutes) : '0h 0m'} />
					<StatRow
						label="Achievements"
						value={record ? `${record.unlocked_achievements}/${record.total_achievements}` : '0/0'}
					/>
					<StatRow label="HLTB Match" value={hltb?.matched_name ?? 'Not found'} />
					<StatRow label="Main Story" value={formatHours(hltb?.main_story)} />
				</div>

				<div>
					<SectionHeader>Set Tag</SectionHeader>
					<Focusable flow-children="horizontal" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
						{ALL_TAGS.map((tag) => {
							const isActive = activeTag === tag;
							return (
								<DialogButton
									key={tag}
									onClick={() => void setTag(tag)}
									style={{
										background: TAG_COLORS[tag],
										color: '#fff',
										fontWeight: 700,
										border: isActive ? '2px solid #fff' : '2px solid transparent',
										padding: '8px',
									}}
								>
									{TAG_LABELS[tag]}
								</DialogButton>
							);
						})}
					</Focusable>
				</div>

				<Focusable flow-children="horizontal" style={{ display: 'flex', gap: '8px' }}>
					<DialogButton onClick={() => void resetToAuto()} style={{ flex: 1 }}>
						Reset to Auto
					</DialogButton>
					<DialogButton
						onClick={() => {
							void remove().then(onClose);
						}}
						style={{ flex: 1 }}
					>
						Remove
					</DialogButton>
				</Focusable>

				<DialogButton onClick={onClose} style={{ width: '100%' }}>
					Close
				</DialogButton>
			</Focusable>
		</ModalRoot>
	);
}

/** Opens the tag/stats dialog via Steam's own modal system (the same
 * showModal/ModalRoot pair steam-easygrid uses successfully) instead of a
 * homemade `position: fixed` overlay rendered inside the page's own DOM.
 * That homemade overlay broke in practice: `position: fixed` is scoped to
 * the nearest ancestor with a `transform` (not necessarily the viewport --
 * see MDN's "containing block" rules), and Steam's hero-banner ancestor
 * of the icon row sets one for its parallax effect, so the overlay ended
 * up clipped to that banner's thin icon-row box instead of covering the
 * screen -- just a small dark rectangle with no room to show the card.
 * showModal renders into Steam's own top-level modal layer instead,
 * sidestepping the whole ancestor chain. */
export function openTagManagerModal(appid: number, windowRef: Window, gameName: string): void {
	const holder: { close?: () => void } = {};
	const onClose = () => holder.close?.();
	const result = showModal(<TagManagerContent appid={appid} onClose={onClose} />, windowRef, {
		strTitle: gameName,
		bHideMainWindowForPopouts: false,
	});
	holder.close = result.Close;
}
