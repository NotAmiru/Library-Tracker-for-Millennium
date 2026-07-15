local tag_engine = require("tag_engine")

local DEFAULT_THRESHOLDS = {
	mastered_achievement_percent = 85,
	in_progress_threshold_minutes = 30,
	dropped_days_threshold = 365,
}

local DAY = 86400
local NOW = 1000000000

return function()
	-- Backlog: no achievements, no playtime, never played -> no tag.
	assert(tag_engine.calculate_tag({}, nil, DEFAULT_THRESHOLDS, NOW) == nil, "expected backlog for an empty record")

	-- In Progress: playtime past the threshold, nothing else triggers.
	assert(
		tag_engine.calculate_tag({ playtime_minutes = 30 }, nil, DEFAULT_THRESHOLDS, NOW) == "in_progress",
		"expected in_progress at the threshold"
	)
	assert(
		tag_engine.calculate_tag({ playtime_minutes = 29 }, nil, DEFAULT_THRESHOLDS, NOW) == nil,
		"expected backlog just under the in_progress threshold"
	)

	-- Completed: playtime >= HLTB main story hours * 60.
	local hltb = { main_story = 10 }
	assert(
		tag_engine.calculate_tag({ playtime_minutes = 600 }, hltb, DEFAULT_THRESHOLDS, NOW) == "completed",
		"expected completed at exactly main_story hours"
	)
	assert(
		tag_engine.calculate_tag({ playtime_minutes = 599 }, hltb, DEFAULT_THRESHOLDS, NOW) == "in_progress",
		"one minute under HLTB's main story time should still be in_progress, not completed"
	)
	assert(
		tag_engine.calculate_tag({ playtime_minutes = 600 }, nil, DEFAULT_THRESHOLDS, NOW) == "in_progress",
		"completed should never trigger without an HLTB match"
	)

	-- Mastered: achievement percent >= threshold, and it outranks Completed.
	local mastered_game = {
		playtime_minutes = 5,
		total_achievements = 20,
		unlocked_achievements = 17, -- 85%
	}
	assert(
		tag_engine.calculate_tag(mastered_game, hltb, DEFAULT_THRESHOLDS, NOW) == "mastered",
		"expected mastered at exactly the achievement percent threshold, overriding completed/in_progress"
	)
	local almost_mastered_game = {
		total_achievements = 20,
		unlocked_achievements = 16, -- 80%
	}
	assert(
		tag_engine.calculate_tag(almost_mastered_game, nil, DEFAULT_THRESHOLDS, NOW) == nil,
		"80% achievements should not trigger mastered at an 85% threshold"
	)

	-- A game with zero achievements can never be mastered, even at 0/0.
	local zero_achievements_game = { total_achievements = 0, unlocked_achievements = 0, playtime_minutes = 1000 }
	assert(
		tag_engine.calculate_tag(zero_achievements_game, nil, DEFAULT_THRESHOLDS, NOW) ~= "mastered",
		"a game with no achievements at all must never be mastered"
	)

	-- Dropped: not played in dropped_days_threshold+ days, and only
	-- evaluated when Mastered/Completed don't already apply.
	local long_ago = NOW - (400 * DAY)
	local dropped_game = { playtime_minutes = 50, rt_last_time_played = long_ago }
	assert(
		tag_engine.calculate_tag(dropped_game, nil, DEFAULT_THRESHOLDS, NOW) == "dropped",
		"expected dropped after 400 days of inactivity, overriding in_progress"
	)
	local recently_played_game = { playtime_minutes = 50, rt_last_time_played = NOW - (10 * DAY) }
	assert(
		tag_engine.calculate_tag(recently_played_game, nil, DEFAULT_THRESHOLDS, NOW) == "in_progress",
		"a game played 10 days ago should not be dropped"
	)

	-- Dropped must not override Mastered or Completed even if both would
	-- otherwise apply (priority: mastered > completed > dropped).
	local mastered_but_stale = {
		total_achievements = 10,
		unlocked_achievements = 10,
		rt_last_time_played = long_ago,
	}
	assert(
		tag_engine.calculate_tag(mastered_but_stale, nil, DEFAULT_THRESHOLDS, NOW) == "mastered",
		"mastered must win over dropped even when both conditions are true"
	)
	local completed_but_stale = { playtime_minutes = 600, rt_last_time_played = long_ago }
	assert(
		tag_engine.calculate_tag(completed_but_stale, hltb, DEFAULT_THRESHOLDS, NOW) == "completed",
		"completed must win over dropped even when both conditions are true"
	)

	-- A game that has never been played (no rt_last_time_played) is never dropped.
	local never_played = { playtime_minutes = 0 }
	assert(
		tag_engine.calculate_tag(never_played, nil, DEFAULT_THRESHOLDS, NOW) == nil,
		"a never-played game should be backlog, not dropped"
	)

	-- Custom thresholds are honored.
	local custom_thresholds = {
		mastered_achievement_percent = 50,
		in_progress_threshold_minutes = 5,
		dropped_days_threshold = 30,
	}
	assert(
		tag_engine.calculate_tag({ playtime_minutes = 5 }, nil, custom_thresholds, NOW) == "in_progress",
		"custom in_progress_threshold_minutes should be honored"
	)

	print("tag_engine_spec: OK")
end
