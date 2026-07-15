local storage = require("storage")
local settings = require("settings")
local tag_engine = require("tag_engine")

--- Sync orchestration: merge a fresh data snapshot for one game into
--- storage and recompute its tag, unless it's been manually overridden.
--- Kept separate from main.lua's RPC wrapper so it's unit-testable
--- without going through the JSON-string RPC envelope.
local M = {}

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
		-- HLTB integration lands in a later milestone; existing.hltb is
		-- always nil until then, matching "no HLTB match" behavior, so
		-- Completed can only trigger once that's wired in.
		local hltb = existing.hltb
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

return M
