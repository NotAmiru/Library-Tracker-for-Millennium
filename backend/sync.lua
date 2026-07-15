local storage = require("storage")
local settings = require("settings")
local tag_engine = require("tag_engine")
local hltb_cache = require("hltb_cache")
local hltb_match = require("hltb_match")
local hltb_utils = require("hltb_utils")

--- Sync orchestration: merge a fresh data snapshot for one game into
--- storage and recompute its tag, unless it's been manually overridden.
--- Kept separate from main.lua's RPC wrapper so it's unit-testable
--- without going through the JSON-string RPC envelope.
local M = {}

--- Returns cached/fetched HLTB data for `appid`/`game_name`, or nil if
--- there's no match (or the lookup was skipped entirely). A hard-expired
--- or missing cache entry triggers a live HLTB search; a soft-expired
--- ("stale") entry is returned immediately without a network call --
--- stale-while-revalidate in spirit, though the "revalidate" half is a
--- synchronous fetch-on-next-hard-expiry rather than a background
--- refresh, since Millennium's Lua backend has no simple fire-and-forget
--- async primitive to do that with.
local function get_hltb_data(appid, game_name, thresholds)
	local soft_ttl = (thresholds.hltb_cache_soft_ttl_hours or 12) * 3600
	local hard_ttl = (thresholds.hltb_cache_hard_ttl_days or 90) * 86400

	local cached = hltb_cache.get(appid, soft_ttl, hard_ttl)
	if cached ~= nil then
		return cached
	end

	if hltb_utils.should_skip_lookup(game_name) then
		return nil
	end

	local match = hltb_match.search_best_match(game_name)
	if match == nil then
		-- Cache the miss too (no completion-time fields), so a game with
		-- no HLTB entry isn't re-searched on every single sync.
		return hltb_cache.set(appid, { game_name = game_name })
	end

	return hltb_cache.set(appid, {
		game_name = game_name,
		matched_name = match.game_name,
		similarity = hltb_utils.calculate_similarity(game_name, match.game_name),
		main_story = hltb_utils.seconds_to_hours(match.comp_main),
		main_extra = hltb_utils.seconds_to_hours(match.comp_plus),
		completionist = hltb_utils.seconds_to_hours(match.comp_100),
	})
end

--- @param snapshot table: { appid, game_name?, playtime_minutes?, rt_last_time_played?, total_achievements?, unlocked_achievements? }
---   Optional fields are only expected to be *absent* when unknown, never
---   explicitly nil/null -- see frontend/lib/sync.ts for why.
--- @return table: { appid, tag, tag_changed, record }
function M.sync_game(snapshot)
	local appid = tostring(snapshot.appid)
	local existing = storage.get(appid) or {}
	local is_manual = existing.is_manual == true

	local fields = {
		game_name = snapshot.game_name or existing.game_name,
		playtime_minutes = snapshot.playtime_minutes or existing.playtime_minutes or 0,
		total_achievements = snapshot.total_achievements or existing.total_achievements or 0,
		unlocked_achievements = snapshot.unlocked_achievements or existing.unlocked_achievements or 0,
		rt_last_time_played = snapshot.rt_last_time_played or existing.rt_last_time_played,
		last_sync = os.time(),
		is_manual = is_manual,
	}

	local previous_tag = existing.tag
	local new_tag = previous_tag

	if not is_manual then
		local thresholds = settings.get_all()
		local hltb = get_hltb_data(appid, fields.game_name, thresholds)
		new_tag = tag_engine.calculate_tag(fields, hltb, thresholds)
	end

	fields.tag = new_tag

	local record = storage.upsert(appid, fields)

	return {
		appid = appid,
		tag = new_tag,
		tag_changed = new_tag ~= previous_tag,
		record = record,
	}
end

local function is_valid_tag(tag)
	for _, candidate in ipairs(tag_engine.TAGS) do
		if candidate == tag then
			return true
		end
	end
	return false
end

--- Force a tag for a game, overriding auto-calculation until
--- reset_to_auto_tag() is called for it again.
--- @return table record
function M.set_manual_tag(appid, tag)
	if not is_valid_tag(tag) then
		error("invalid tag: " .. tostring(tag))
	end
	return storage.upsert(appid, { tag = tag, is_manual = true })
end

--- Delete a game's stored record entirely, reverting it to backlog.
--- @return boolean existed
function M.remove_tag(appid)
	return storage.delete(appid)
end

--- Clear a manual override and immediately recompute the tag from the
--- game's current stored stats.
--- @return table record
function M.reset_to_auto_tag(appid)
	local existing = storage.get(appid) or {}
	local thresholds = settings.get_all()
	local hltb = get_hltb_data(appid, existing.game_name, thresholds)
	local tag = tag_engine.calculate_tag(existing, hltb, thresholds)
	return storage.upsert(appid, { tag = tag, is_manual = false })
end

return M
