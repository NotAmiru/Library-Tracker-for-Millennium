import { callable } from 'millennium';

/**
 * Wraps a Millennium `callable` RPC route for this plugin's Lua backend
 * convention: every route takes a single params object (never bare
 * positional args, sidestepping callable's alphabetical-by-key argument
 * ordering) and returns a JSON-encoded string, which this parses.
 *
 * Convention: never put an explicit `null` in `params`. cjson decodes
 * JSON `null` to a sentinel value, not Lua's own `nil`, which silently
 * breaks the `value or default` fallback idiom used throughout the
 * backend. Omit a key entirely instead of setting it to null/undefined.
 */
export function jsonRpc<Return>(route: string) {
	const invoke = callable<[params: Record<string, unknown>], string>(route);
	return async (params: Record<string, unknown> = {}): Promise<Return> => {
		const raw = await invoke(params);
		return JSON.parse(raw) as Return;
	};
}
