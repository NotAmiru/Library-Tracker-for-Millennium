local mock = require("mock_natives")

return function()
	mock.install()
	local sync = require("sync")
	local storage = require("storage")
	local hltb_cache = require("hltb_cache")

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

	-- set_manual_tag rejects unknown tag names.
	local ok = pcall(sync.set_manual_tag, 730, "not_a_real_tag")
	assert(not ok, "set_manual_tag should reject an invalid tag name")

	-- set_manual_tag applies a tag and marks it manual.
	local manual_record = sync.set_manual_tag(730, "dropped")
	assert(manual_record.tag == "dropped")
	assert(manual_record.is_manual == true)

	-- reset_to_auto_tag clears the manual flag and recomputes from stored stats.
	storage.upsert(730, { playtime_minutes = 45, total_achievements = 0, unlocked_achievements = 0 })
	local reset_record = sync.reset_to_auto_tag(730)
	assert(reset_record.is_manual == false, "reset_to_auto_tag should clear the manual flag")
	assert(reset_record.tag == "in_progress", "reset_to_auto_tag should recompute from current stats")

	-- remove_tag deletes the record and reports whether one existed.
	assert(sync.remove_tag(730) == true, "remove_tag should report the record existed")
	assert(storage.get(730) == nil, "record should be gone after remove_tag")
	assert(sync.remove_tag(730) == false, "removing again should report nothing existed")

	-- HLTB wiring: with no cached/reachable HLTB data (mock_natives'
	-- http module always fails), Completed can never trigger -- CS2's
	-- sync above already implicitly covers this (result.tag ==
	-- "in_progress", not "completed", despite 45 minutes of playtime).
	-- With a pre-populated cache entry, though, Completed must trigger
	-- once playtime reaches main_story hours.
	hltb_cache.set(220, { game_name = "Half-Life 2", main_story = 1 }) -- 60 minutes
	local hltb_result = sync.sync_game({ appid = 220, game_name = "Half-Life 2", playtime_minutes = 60 })
	assert(hltb_result.tag == "completed", "expected completed once playtime reaches cached HLTB main_story hours")

	-- A game not yet in the HLTB cache falls back to a (mocked-failing)
	-- live search, caches the miss, and can't be Completed from that sync.
	local before_cache = sync.sync_game({ appid = 221, game_name = "Portal", playtime_minutes = 30 })
	assert(before_cache.tag == "in_progress", "no HLTB data yet should never produce completed")

	-- Once cached with a long main_story, the same playtime stays under
	-- threshold and correctly remains in_progress, not completed.
	hltb_cache.set(221, { game_name = "Portal", main_story = 5 })
	local after_cache = sync.sync_game({ appid = 221, playtime_minutes = 30 })
	assert(after_cache.tag == "in_progress", "30 minutes against a 5-hour main story should stay in_progress")

	print("sync_spec: OK")
end
