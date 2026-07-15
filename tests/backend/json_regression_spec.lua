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
	local storage = require("storage")

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

	-- A non-empty list still round-trips correctly as an array.
	storage.upsert(730, { game_name = "Counter-Strike 2", tag = "in_progress" })
	local populated = main.get_tagged_games()
	local decoded = cjson.decode(populated)
	assert(type(decoded.games) == "table", "expected games field to decode to a table")
	assert(decoded.games[1].game_name == "Counter-Strike 2")

	print("json_regression_spec: OK")
end
