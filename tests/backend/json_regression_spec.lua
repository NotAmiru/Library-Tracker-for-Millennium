-- Regression test for a real bug found during live testing: mock_natives'
-- json.encode/decode are identity functions (see its own comment for
-- why), which means every other spec is blind to actual JSON text
-- serialization bugs. This is the one place that matters, so it swaps in
-- the REAL lua-cjson library (available via luarocks in this dev
-- environment), which Millennium's "json" module is almost certainly
-- built on given its API shape (encode/decode/encode_sparse_array/
-- encode_max_depth/...). Confirmed directly: real lua-cjson encodes an
-- empty Lua table as "{}" (an object), not "[]" (an array) -- Lua has no
-- separate array type, so an empty table is genuinely ambiguous, and
-- lua-cjson's default resolves it the way that silently broke every
-- Array.prototype method the frontend called on an empty games list.
-- (dkjson, a pure-Lua alternative also available here, was tried first
-- and turned out to default empty tables to "[]" already -- not
-- representative of lua-cjson's behavior, so it doesn't reproduce this
-- bug and was swapped out.) See main.lua's encode_array().
local ok, cjson = pcall(require, "cjson")
if not ok then
	return function()
		print("json_regression_spec: SKIPPED (lua-cjson not installed)")
	end
end

local mock = require("mock_natives")

return function()
	mock.install()

	package.preload["json"] = function()
		return { encode = cjson.encode, decode = cjson.decode }
	end
	package.loaded["json"] = nil

	local main = require("main")

	local empty_tagged = main.get_tagged_games()
	assert(
		empty_tagged:find('"games":%[%]', 1, false) ~= nil,
		"expected an empty tagged-games list to encode as a JSON array, got: " .. empty_tagged
	)

	local empty_backlog = main.get_backlog_games()
	assert(
		empty_backlog:find('"games":%[%]', 1, false) ~= nil,
		"expected an empty backlog list to encode as a JSON array, got: " .. empty_backlog
	)

	-- Second real-device bug this same "use a real JSON library" approach
	-- caught: a real Millennium install (v3.3.1) spreads a multi-key
	-- object argument to callable() into positional Lua arguments sorted
	-- alphabetically by key, rather than delivering a single Lua table --
	-- frontend/lib/rpc.ts's jsonRpc() now wraps every call's params in a
	-- single-key { data: "<json>" } object specifically to sidestep this,
	-- so every RPC function must decode a raw JSON *string* argument, not
	-- receive an already-decoded table. Exercise that exact shape here:
	-- sync_game(data) where data is the plain JSON text, matching what
	-- the real bridge delivers.
	local sync_payload = cjson.encode({
		appid = 730,
		game_name = "Counter-Strike 2",
		playtime_minutes = 45,
		total_achievements = 0,
		unlocked_achievements = 0,
	})
	local sync_response = main.sync_game(sync_payload)
	local decoded_sync = cjson.decode(sync_response)
	assert(decoded_sync.success == true, "expected sync_game to succeed given a raw JSON string argument")
	assert(decoded_sync.tag == "in_progress", "expected in_progress from the synced data, got: " .. tostring(decoded_sync.tag))

	-- A non-empty list still round-trips correctly as an array, using the
	-- record sync_game just created above.
	local populated = main.get_tagged_games()
	local decoded = cjson.decode(populated)
	assert(type(decoded.games) == "table", "expected games field to decode to a table")
	assert(decoded.games[1].game_name == "Counter-Strike 2")

	print("json_regression_spec: OK")
end
