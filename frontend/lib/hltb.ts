import { jsonRpc } from './rpc';
import type { GetHltbDataResult, HltbData } from '../types';

const getHltbDataRpc = jsonRpc<GetHltbDataResult>('get_hltb_data');

/** Whatever HLTB match has been cached for this game so far (regardless
 * of staleness), or null if it's never been looked up yet -- e.g. the
 * game hasn't synced, or the lookup is still in flight from a sync
 * that started moments ago. */
export async function getHltbData(appid: number): Promise<HltbData | null> {
	const result = await getHltbDataRpc({ appid });
	return result.hltb;
}
