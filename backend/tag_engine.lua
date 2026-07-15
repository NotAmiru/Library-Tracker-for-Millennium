--- Pure tag-priority calculation, no I/O. Ported from Deck Progress
--- Tracker's calculate_auto_tag, with `now_unix` injected instead of read
--- from os.time() directly so this is deterministically testable.
---
--- Priority order (highest wins): mastered > completed > dropped >
--- in_progress > backlog (nil, not a stored tag at all).
local SECONDS_PER_DAY = 86400

local M = {}

M.TAGS = { "mastered", "completed", "dropped", "in_progress" }

local function is_mastered(game, thresholds)
	local total = game.total_achievements or 0
	if total <= 0 then
		return false
	end
	local unlocked = game.unlocked_achievements or 0
	local percent = (unlocked / total) * 100
	return percent >= (thresholds.mastered_achievement_percent or 85)
end

local function is_completed(game, hltb)
	if hltb == nil or hltb.main_story == nil or hltb.main_story <= 0 then
		return false
	end
	local playtime = game.playtime_minutes or 0
	return playtime >= (hltb.main_story * 60)
end

local function is_dropped(game, thresholds, now_unix)
	local last_played = game.rt_last_time_played
	if last_played == nil or last_played <= 0 then
		return false
	end
	local days_threshold = thresholds.dropped_days_threshold or 365
	local elapsed_days = (now_unix - last_played) / SECONDS_PER_DAY
	return elapsed_days >= days_threshold
end

local function is_in_progress(game, thresholds)
	local playtime = game.playtime_minutes or 0
	return playtime >= (thresholds.in_progress_threshold_minutes or 30)
end

--- @param game table: { playtime_minutes, total_achievements, unlocked_achievements, rt_last_time_played }
--- @param hltb table|nil: { main_story } (hours), or nil if there's no HLTB match
--- @param thresholds table: { mastered_achievement_percent, in_progress_threshold_minutes, dropped_days_threshold }
--- @param now_unix number|nil: current unix timestamp; defaults to os.time()
--- @return string|nil tag: one of M.TAGS, or nil for backlog (no tag)
function M.calculate_tag(game, hltb, thresholds, now_unix)
	game = game or {}
	thresholds = thresholds or {}
	now_unix = now_unix or os.time()

	if is_mastered(game, thresholds) then
		return "mastered"
	end
	if is_completed(game, hltb) then
		return "completed"
	end
	if is_dropped(game, thresholds, now_unix) then
		return "dropped"
	end
	if is_in_progress(game, thresholds) then
		return "in_progress"
	end
	return nil
end

return M
