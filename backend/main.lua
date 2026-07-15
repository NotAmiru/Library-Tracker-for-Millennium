local logger = require("logger")
local millennium = require("millennium")
local json = require("json")
local settings = require("settings")
local tag_engine = require("tag_engine")
local storage = require("storage")
local sync = require("sync")
local queries = require("queries")

-- RPC-callable functions are defined as plain globals (not locals) and
-- also listed in the table returned below, matching the convention used
-- by Millennium's own reference plugins.

function on_load()
	logger:info("Library Tracker backend loaded")
	millennium.ready()
end

function on_frontend_loaded()
	logger:info("Library Tracker frontend loaded")
end

function on_unload()
	logger:info("Library Tracker backend unloading")
end

--- Returns the full settings table (stored values merged over defaults)
--- as a JSON string: { success, settings }.
function get_settings()
	return json.encode({ success = true, settings = settings.get_all() })
end

--- params: a table of setting key/value pairs to change in one call.
--- Returns the merged settings table as a JSON string: { success, settings }.
function update_settings(params)
	local ok, result = pcall(settings.update, params or {})
	if not ok then
		logger:error("update_settings failed: " .. tostring(result))
		return json.encode({ success = false, error = tostring(result) })
	end
	return json.encode({ success = true, settings = result })
end

--- Dev-console helper: compute what tag a hypothetical game record would
--- get, without touching storage. params: { game, hltb }, both matching
--- tag_engine.calculate_tag's expected shapes. Configured thresholds are
--- always read live from settings, not passed in, so this reflects
--- exactly what a real sync would decide.
--- Returns { success, tag } as a JSON string; tag is nil (JSON null) for backlog.
function calculate_tag_preview(params)
	params = params or {}
	local thresholds = settings.get_all()
	local tag = tag_engine.calculate_tag(params.game, params.hltb, thresholds)
	return json.encode({ success = true, tag = tag })
end

--- params: { appid, game_name?, playtime_minutes?, rt_last_time_played?,
---           total_achievements?, unlocked_achievements? }. Fields the
--- caller doesn't know yet should be omitted, not set to null/nil.
--- Returns { success, appid, tag, tag_changed, record } as JSON.
function sync_game(params)
	local ok, result = pcall(sync.sync_game, params or {})
	if not ok then
		logger:error("sync_game failed: " .. tostring(result))
		return json.encode({ success = false, error = tostring(result) })
	end
	return json.encode({
		success = true,
		appid = result.appid,
		tag = result.tag,
		tag_changed = result.tag_changed,
		record = result.record,
	})
end

--- params: { appid }. Returns the stored record for one game, or null if
--- it has never been synced. Returns { success, record } as JSON.
function get_game_record(params)
	params = params or {}
	local record = storage.get(params.appid)
	return json.encode({ success = true, record = record })
end

--- params: { appid, tag }. tag must be one of tag_engine.TAGS.
--- Returns { success, record } as JSON, or { success = false, error } if
--- tag is invalid.
function set_manual_tag(params)
	params = params or {}
	local ok, result = pcall(sync.set_manual_tag, params.appid, params.tag)
	if not ok then
		return json.encode({ success = false, error = tostring(result) })
	end
	return json.encode({ success = true, record = result })
end

--- params: { appid }. Deletes the game's stored record entirely,
--- reverting it to backlog. Returns { success, existed } as JSON.
function remove_tag(params)
	params = params or {}
	local existed = sync.remove_tag(params.appid)
	return json.encode({ success = true, existed = existed })
end

--- params: { appid }. Clears any manual override and immediately
--- recomputes the tag from the game's current stored stats.
--- Returns { success, record } as JSON.
function reset_to_auto_tag(params)
	params = params or {}
	local record = sync.reset_to_auto_tag(params.appid)
	return json.encode({ success = true, record = record })
end

--- Returns { success, stats } as JSON: per-tag counts, backlog, and total.
function get_tag_statistics()
	return json.encode({ success = true, stats = queries.get_tag_statistics() })
end

--- Returns { success, games } as JSON: every tagged game, sorted by name.
function get_tagged_games()
	return json.encode({ success = true, games = queries.get_tagged_games() })
end

--- Returns { success, games } as JSON: every synced-but-untagged
--- (backlog) game, sorted by name.
function get_backlog_games()
	return json.encode({ success = true, games = queries.get_backlog_games() })
end

return {
	on_load = on_load,
	on_frontend_loaded = on_frontend_loaded,
	on_unload = on_unload,
	get_settings = get_settings,
	update_settings = update_settings,
	calculate_tag_preview = calculate_tag_preview,
	sync_game = sync_game,
	get_game_record = get_game_record,
	set_manual_tag = set_manual_tag,
	remove_tag = remove_tag,
	reset_to_auto_tag = reset_to_auto_tag,
	get_tag_statistics = get_tag_statistics,
	get_tagged_games = get_tagged_games,
	get_backlog_games = get_backlog_games,
}
