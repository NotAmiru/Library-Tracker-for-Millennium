import { callable } from '@steambrew/client';

/** callable()'s own IPCType constraint (string | number | boolean | void)
 * only applies to its *direct* argument -- the single-key { data: string }
 * object jsonRpc() always wraps params in below. Since `params` itself is
 * JSON.stringify()'d into that one string before ever reaching callable(),
 * it can safely be any JSON-serializable shape, not just flat scalars --
 * this only excludes `undefined`/functions/etc., which JSON.stringify
 * can't represent meaningfully anyway. */
export type RpcParams = Record<string, string | number | boolean | (string | number)[]>;

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
