import { callable } from '@steambrew/client';

/** Matches @steambrew/client's own IPCType -- callable() can only carry
 * flat string/number/boolean values across the JS<->Lua bridge, not
 * nested objects/arrays, per its actual type signature. Every RPC in
 * this plugin already only ever needs flat params, so this isn't a real
 * constraint in practice, just one worth encoding in the type rather
 * than discovering it from a runtime failure. */
export type RpcParams = Record<string, string | number | boolean>;

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
	const invoke = callable<[params: RpcParams], string>(route);
	return async (params: RpcParams = {}): Promise<Return> => {
		const raw = await invoke(params);
		return JSON.parse(raw) as Return;
	};
}
