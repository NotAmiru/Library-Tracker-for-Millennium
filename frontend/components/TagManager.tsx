import { useEffect, useState } from 'react';
import type { JSX, MouseEvent } from 'react';
import { DialogButton, Focusable } from '@steambrew/client';
import { FaCheck } from 'react-icons/fa';
import { TAG_COLORS, TAG_LABELS } from './TagIcon';
import { getHltbData } from '../lib/hltb';
import { logError } from '../lib/log';
import type { GameRecord, HltbData, TagName } from '../types';

interface TagManagerProps {
	appid: number;
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
				marginBottom: '4px',
			}}
		>
			{children}
		</div>
	);
}

export function TagManager({ appid, record, onClose, onSetTag, onRemove, onResetToAuto }: TagManagerProps): JSX.Element {
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
					width: '360px',
					display: 'flex',
					flexDirection: 'column',
					gap: '14px',
				}}
			>
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
									onClick={() => onSetTag(tag)}
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
					<DialogButton onClick={onResetToAuto} style={{ flex: 1 }}>
						Reset to Auto
					</DialogButton>
					<DialogButton onClick={onRemove} style={{ flex: 1 }}>
						Remove
					</DialogButton>
				</Focusable>

				<DialogButton onClick={onClose} style={{ width: '100%' }}>
					Close
				</DialogButton>
			</Focusable>
		</div>
	);
}
