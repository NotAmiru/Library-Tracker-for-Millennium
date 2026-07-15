local mock = require("mock_natives")

local DAY = 86400
local NOW = 2000000000

return function()
	mock.install()
	local storage = require("storage")
	local dropped_sweep = require("dropped_sweep")

	-- Stub os.time() so the sweep's "now" matches what these fixtures were
	-- built against, without needing calculate_tag's now_unix param
	-- threaded all the way through here too.
	local real_time = os.time
	os.time = function()
		return NOW
	end

	storage.upsert(1, { playtime_minutes = 50, rt_last_time_played = NOW - (400 * DAY) }) -- should become dropped
	storage.upsert(2, { playtime_minutes = 50, rt_last_time_played = NOW - (10 * DAY) }) -- recently played, stays
	storage.upsert(3, { playtime_minutes = 50, rt_last_time_played = NOW - (400 * DAY), is_manual = true }) -- manual, untouched
	storage.upsert(4, { playtime_minutes = 999, total_achievements = 10, unlocked_achievements = 10, tag = "mastered", rt_last_time_played = NOW - (400 * DAY) }) -- already settled, untouched
	storage.upsert(5, { playtime_minutes = 0 }) -- never played, not dropped

	local newly_dropped = dropped_sweep.check_dropped_games()
	os.time = real_time

	assert(newly_dropped == 1, "expected exactly one game to be newly tagged dropped")
	assert(storage.get(1).tag == "dropped", "a stale, non-manual game should be tagged dropped")
	assert(storage.get(2).tag ~= "dropped", "a recently-played game should not be dropped")
	assert(storage.get(3).tag == nil, "a manually-tagged game must never be touched by the sweep")
	assert(storage.get(4).tag == "mastered", "an already-settled (mastered) game must not be downgraded to dropped")
	assert(storage.get(5).tag ~= "dropped", "a never-played game should not be dropped")

	print("dropped_sweep_spec: OK")
end
