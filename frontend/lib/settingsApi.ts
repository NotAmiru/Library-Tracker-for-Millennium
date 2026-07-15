import { jsonRpc } from './rpc';
import type { GetSettingsResult, PluginSettings } from '../types';

const getSettingsRpc = jsonRpc<GetSettingsResult>('get_settings');
const updateSettingsRpc = jsonRpc<GetSettingsResult>('update_settings');

export async function getSettings(): Promise<PluginSettings> {
	const result = await getSettingsRpc();
	return result.settings;
}

export async function updateSettings(partial: Partial<PluginSettings>): Promise<PluginSettings> {
	const result = await updateSettingsRpc({ ...partial });
	return result.settings;
}
