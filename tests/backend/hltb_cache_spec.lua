local mock = require("mock_natives")

return function()
	mock.install()
	local cache = require("hltb_cache")

	-- Unknown appid has no entry.
	local missing, stale = cache.get(730, 3600, 86400)
	assert(missing == nil and stale == false)

	-- A fresh entry is not stale under generous TTLs.
	cache.set(730, { game_name = "Counter-Strike 2", main_story = 5.5 })
	local fresh, fresh_stale = cache.get(730, 3600, 86400)
	assert(fresh ~= nil and fresh.main_story == 5.5)
	assert(fresh_stale == false, "a just-written entry should not be stale under a generous soft TTL")

	-- A negative soft TTL forces the entry to read as stale (still
	-- returned -- stale-while-revalidate -- just flagged).
	local _, forced_stale = cache.get(730, -1, 86400)
	assert(forced_stale == true, "a soft TTL in the past should mark the entry stale")

	-- A negative hard TTL forces the entry to be treated as fully expired
	-- (absent), not merely stale.
	local hard_expired, hard_expired_stale = cache.get(730, 3600, -1)
	assert(hard_expired == nil, "an entry past its hard TTL should be treated as absent")
	assert(hard_expired_stale == false)

	-- set() merges onto the existing entry instead of overwriting it --
	-- a later set() that only knows about `game_name` (e.g. a search miss)
	-- must not erase a previously-cached main_story value.
	cache.set(730, { game_name = "Counter-Strike 2" })
	local merged = cache.get(730, 3600, 86400)
	assert(merged.main_story == 5.5, "a partial set() must not erase a previously-cached field")

	-- set() with a genuinely new value for a field overwrites it.
	cache.set(730, { main_story = 6.0 })
	local updated = cache.get(730, 3600, 86400)
	assert(updated.main_story == 6.0)
	assert(updated.game_name == "Counter-Strike 2", "unrelated fields survive an update to a different field")

	print("hltb_cache_spec: OK")
end
