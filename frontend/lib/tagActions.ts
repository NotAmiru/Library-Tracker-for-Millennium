import { jsonRpc } from './rpc';
import type { GameRecord, TagName } from '../types';

interface TagActionResult {
	success: boolean;
	record?: GameRecord | null;
	error?: string;
}

const setManualTagRpc = jsonRpc<TagActionResult>('set_manual_tag');
const removeTagRpc = jsonRpc<TagActionResult>('remove_tag');
const resetToAutoTagRpc = jsonRpc<TagActionResult>('reset_to_auto_tag');

export async function setManualTag(appid: number, tag: TagName): Promise<TagActionResult> {
	return setManualTagRpc({ appid, tag });
}

export async function removeTag(appid: number): Promise<TagActionResult> {
	return removeTagRpc({ appid });
}

export async function resetToAutoTag(appid: number): Promise<TagActionResult> {
	return resetToAutoTagRpc({ appid });
}
