import { callable } from '@steambrew/client';

/** Matches @steambrew/client's own IPCType -- callable() can only carry
 * flat string/number/boolean values across the JS<->Lua bridge, not
 * nested objects/arrays, per its actual type signature. */
export type RpcParams = Record<string, string | number | boolean>;

/**
 * Wraps a Millennium `callable` RPC route for this plugin's Lua backend
 * convention: every route takes exactly one argument, `data`, a
 * JSON-encoded string of the real params object, and returns a
 * JSON-encoded string, which this parses.
 *
 * This single-string-argument wrapping is load-bearing, not stylistic:
 * confirmed against a real Millennium install (v3.3.1) that multi-key
 * object arguments to callable() get spread into positional Lua
 * function arguments sorted alphabetically by key -- not delivered as a
 * single Lua table the way @steambrew/client's TypeScript types suggest.
 * A Lua function declared as `function f(params)` then silently receives
 * only the alphabetically-first field's raw value instead of the whole
 * params table (observed directly: sync_game's Lua side received the
 * bare `appid` number, since "appid" sorts first among its params).
 * Wrapping everything in a single `{ data: "<json>" }` object sidesteps
 * this entirely -- one key can't be reordered relative to itself -- at
 * the cost of every backend RPC function needing to json.decode(data)
 * itself instead of receiving an already-decoded table.
 *
 * Convention: never put an explicit `null` inside the encoded params.
 * cjson decodes JSON `null` to a sentinel value, not Lua's own `nil`,
 * which silently breaks the `value or default` fallback idiom used
 * throughout the backend. Omit a key entirely instead of setting it to
 * null/undefined.
 */
export function jsonRpc<Return>(route: string) {
	const invoke = callable<[params: { data: string }], string>(route);
	return async (params: RpcParams = {}): Promise<Return> => {
		const raw = await invoke({ data: JSON.stringify(params) });
		return JSON.parse(raw) as Return;
	};
}
