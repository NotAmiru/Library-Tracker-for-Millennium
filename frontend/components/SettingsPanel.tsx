import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { PanelSection, PanelSectionRow, SliderField } from 'millennium';
import { getSettings, updateSettings } from '../lib/settingsApi';
import { logError } from '../lib/log';
import type { PluginSettings } from '../types';

interface FieldConfig {
	key: keyof PluginSettings;
	label: string;
	min: number;
	max: number;
	step: number;
	suffix: string;
}

const FIELDS: FieldConfig[] = [
	{ key: 'mastered_achievement_percent', label: 'Mastered threshold', min: 50, max: 100, step: 5, suffix: '%' },
	{ key: 'in_progress_threshold_minutes', label: 'In Progress threshold', min: 5, max: 120, step: 5, suffix: ' min' },
	{ key: 'dropped_days_threshold', label: 'Dropped after', min: 30, max: 730, step: 30, suffix: ' days' },
	{ key: 'hltb_cache_soft_ttl_hours', label: 'HLTB cache refresh', min: 1, max: 72, step: 1, suffix: ' hr' },
	{ key: 'hltb_cache_hard_ttl_days', label: 'HLTB cache expiry', min: 7, max: 180, step: 7, suffix: ' days' },
];

/** The settings-editing panel Deck Progress Tracker never actually
 * shipped: an update_settings RPC existed there, but nothing in its UI
 * called it. Every field writes through immediately on change (no
 * separate "Save" step), since millennium.config already auto-persists
 * and auto-syncs across the frontend/backend boundary. */
export function SettingsPanel(): JSX.Element {
	const [settings, setSettings] = useState<PluginSettings | null>(null);

	useEffect(() => {
		getSettings()
			.then(setSettings)
			.catch((error: unknown) => logError('loading settings failed', error));
	}, []);

	const handleChange = useCallback((key: keyof PluginSettings, value: number) => {
		setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
		updateSettings({ [key]: value }).catch((error: unknown) => logError(`updating setting '${key}' failed`, error));
	}, []);

	if (!settings) {
		return (
			<PanelSection title="Settings">
				<PanelSectionRow>Loading...</PanelSectionRow>
			</PanelSection>
		);
	}

	return (
		<PanelSection title="Settings">
			{FIELDS.map((field) => (
				<PanelSectionRow key={field.key}>
					<SliderField
						label={field.label}
						value={settings[field.key]}
						min={field.min}
						max={field.max}
						step={field.step}
						valueSuffix={field.suffix}
						showValue
						editableValue
						onChange={(value) => handleChange(field.key, value)}
					/>
				</PanelSectionRow>
			))}
		</PanelSection>
	);
}
