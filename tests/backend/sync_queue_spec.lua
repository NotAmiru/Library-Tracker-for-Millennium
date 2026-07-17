-- Unlike most specs, sync_queue.lua's own on-disk format depends on real
-- string-based JSON semantics (encode_queue() builds JSON text by hand,
-- the same way main.lua's get_tagged_games/get_backlog_games do) -- see
-- json_regression_spec.lua for why mock_natives' identity-function
-- json.encode/decode can't stand in for that. Swaps in real lua-cjson
-- the same way.
local ok, cjson = pcall(require, "cjson")
if not ok then
	return function()
		print("sync_queue_spec: SKIPPED (lua-cjson not installed)")
	end
end

local mock = require("mock_natives")

return function()
	mock.install()
	package.preload["json"] = function()
		return { encode = cjson.encode, decode = cjson.decode }
	end
	package.loaded["json"] = nil

	local sync_queue = require("sync_queue")

	-- No queue has been started yet.
	assert(sync_queue.get() == nil, "expected no queue before start()")

	-- start() persists the full pending list and total.
	sync_queue.start({ 730, 440, 620 })
	local queue = sync_queue.get()
	assert(queue ~= nil, "expected a queue after start()")
	assert(queue.total == 3)
	assert(#queue.pending == 3)

	-- pop() removes the given appid (wherever it is in the list, not just
	-- the front) and persists immediately.
	local after_pop = sync_queue.pop(440)
	assert(#after_pop.pending == 2, "expected one appid removed")
	for _, id in ipairs(after_pop.pending) do
		assert(tostring(id) ~= "440", "popped appid should no longer be pending")
	end

	-- The change is visible to a fresh get() call too, not just the
	-- returned value -- confirms it was actually persisted, not just
	-- mutated in memory.
	local reloaded = sync_queue.get()
	assert(#reloaded.pending == 2)

	-- Popping every remaining appid leaves an empty (not missing) pending
	-- list -- real lua-cjson encodes an empty Lua table as "{}" (an
	-- object) unless explicitly forced to "[]", the same bug
	-- encode_array() fixes in main.lua. encode_queue() needs the same
	-- treatment, which this exercises directly.
	sync_queue.pop(730)
	local almost_empty = sync_queue.pop(620)
	assert(#almost_empty.pending == 0, "expected an empty pending list, not nil, once everything is popped")
	assert(sync_queue.get() ~= nil, "a fully-drained queue should still be a queue, not treated as absent")

	-- clear() removes the queue file entirely.
	sync_queue.clear()
	assert(sync_queue.get() == nil, "expected no queue after clear()")

	-- pop() against a nonexistent queue is a safe no-op, not an error.
	assert(sync_queue.pop(730) == nil, "popping with no active queue should return nil")

	print("sync_queue_spec: OK")
end
