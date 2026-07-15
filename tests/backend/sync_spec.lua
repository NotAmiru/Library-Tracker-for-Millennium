local mock = require("mock_natives")

return function()
	mock.install()
	local sync = require("sync")
	local storage = require("storage")

	-- First sync of a new game creates a record and computes an auto tag.
	local result = sync.sync_game({
		appid = 730,
		game_name = "Counter-Strike 2",
		playtime_minutes = 45,
		total_achievements = 0,
		unlocked_achievements = 0,
	})
	assert(result.appid == "730")
	assert(result.tag == "in_progress", "expected in_progress at 45 minutes with default thresholds")
	assert(result.tag_changed == true, "first sync should report a tag change from nil")
	assert(result.record.game_name == "Counter-Strike 2")

	-- Re-syncing with the same data recomputes the same tag and reports no change.
	local result2 = sync.sync_game({ appid = 730, playtime_minutes = 45 })
	assert(result2.tag == "in_progress")
	assert(result2.tag_changed == false, "unchanged data should not report a tag change")

	-- A manually-tagged game's auto tag is never recalculated by sync.
	storage.upsert(730, { tag = "mastered", is_manual = true })
	local result3 = sync.sync_game({ appid = 730, playtime_minutes = 999999 })
	assert(result3.tag == "mastered", "manual tag must survive a sync with data that would otherwise change it")
	assert(result3.record.is_manual == true)

	-- Partial syncs (only some fields present) merge onto the existing
	-- record instead of zeroing out fields the caller didn't mention.
	storage.upsert(440, { game_name = "Team Fortress 2", total_achievements = 10, unlocked_achievements = 5 })
	local result4 = sync.sync_game({ appid = 440, playtime_minutes = 20 })
	assert(result4.record.total_achievements == 10, "achievement counts should be preserved when a sync omits them")
	assert(result4.record.game_name == "Team Fortress 2", "game name should be preserved when a sync omits it")

	print("sync_spec: OK")
end
