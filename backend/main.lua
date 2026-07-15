local logger = require("logger")
local millennium = require("millennium")
local json = require("json")
local settings = require("settings")
local tag_engine = require("tag_engine")
local storage = require("storage")
local sync = require("sync")
local queries = require("queries")
local dropped_sweep = require("dropped_sweep")

-- RPC-callable functions are defined as plain globals (not locals) and
-- also listed in the table returned below, matching the convention used
-- by Millennium's own reference plugins.

--- json.encode() can't tell an empty Lua table apart from an empty JSON
--- object -- {} comes out as `{}`, not `[]`, since Lua has no separate
--- array type to signal intent with (confirmed against the real
--- lua-cjson library, which this "json" module is almost certainly
--- built on given its API shape). That silently breaks any frontend
--- code expecting an array (Array.prototype.filter/map throw on a plain
--- object) the moment a list-returning endpoint has zero results, e.g.
--- a fresh, never-synced library. Non-empty lists encode correctly
--- (cjson detects the sequential-integer-key pattern), so this only
--- needs to special-case the empty case.
local function encode_array(list)
	if list == nil or #list == 0 then
		return "[]"
	end
	return json.encode(list)
end

--- Every RPC-callable function below takes exactly one argument, `data`
--- -- a JSON-encoded string of the real params object -- and decodes it
--- itself, rather than declaring named table fields as separate
--- parameters. See frontend/lib/rpc.ts's jsonRpc() for why: a real
--- Millennium install was observed spreading a multi-key JS object
--- argument into positional Lua arguments sorted alphabetically by key,
--- not delivering it as a single Lua table, so a function declared as
--- e.g. `function sync_game(params)` silently received just the
--- alphabetically-first field's raw value instead of the whole table.
local function decode_params(data)
	if type(data) ~= "string" or data == "" then
		return {}
	end
	local ok, decoded = pcall(json.decode, data)
	if not ok or type(decoded) ~= "table" then
		return {}
	end
	return decoded
end

function on_load()
	logger:info("Library Tracker backend loaded")
	-- See dropped_sweep.lua for why this runs once at startup rather than
	-- on a standing 24-hour timer.
	local ok, newly_dropped = pcall(dropped_sweep.check_dropped_games)
	if ok then
		logger:info("Startup dropped-games sweep tagged " .. newly_dropped .. " game(s)")
	else
		logger:error("Startup dropped-games sweep failed: " .. tostring(newly_dropped))
	end
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

--- data: JSON-encoded object of setting key/value pairs to change in one call.
--- Returns the merged settings table as a JSON string: { success, settings }.
function update_settings(data)
	local params = decode_params(data)
	local ok, result = pcall(settings.update, params)
	if not ok then
		logger:error("update_settings failed: " .. tostring(result))
		return json.encode({ success = false, error = tostring(result) })
	end
	return json.encode({ success = true, settings = result })
end

--- Dev-console helper: compute what tag a hypothetical game record would
--- get, without touching storage. data decodes to { game, hltb }, both
--- matching tag_engine.calculate_tag's expected shapes. Configured
--- thresholds are always read live from settings, not passed in, so
--- this reflects exactly what a real sync would decide.
--- Returns { success, tag } as a JSON string; tag is nil (JSON null) for backlog.
function calculate_tag_preview(data)
	local params = decode_params(data)
	local thresholds = settings.get_all()
	local tag = tag_engine.calculate_tag(params.game, params.hltb, thresholds)
	return json.encode({ success = true, tag = tag })
end

--- data decodes to { appid, game_name?, playtime_minutes?,
--- rt_last_time_played?, total_achievements?, unlocked_achievements? }.
--- Fields the caller doesn't know yet should be omitted, not set to
--- null/nil.
--- Returns { success, appid, tag, tag_changed, record } as JSON.
function sync_game(data)
	local params = decode_params(data)
	local ok, result = pcall(sync.sync_game, params)
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

--- data decodes to { appid }. Returns the stored record for one game, or
--- null if it has never been synced. Returns { success, record } as JSON.
function get_game_record(data)
	local params = decode_params(data)
	local ok, record = pcall(storage.get, params.appid)
	if not ok then
		logger:error("get_game_record failed: " .. tostring(record))
		return json.encode({ success = false, error = tostring(record) })
	end
	return json.encode({ success = true, record = record })
end

--- data decodes to { appid, tag }. tag must be one of tag_engine.TAGS.
--- Returns { success, record } as JSON, or { success = false, error } if
--- tag is invalid.
function set_manual_tag(data)
	local params = decode_params(data)
	local ok, result = pcall(sync.set_manual_tag, params.appid, params.tag)
	if not ok then
		logger:error("set_manual_tag failed: " .. tostring(result))
		return json.encode({ success = false, error = tostring(result) })
	end
	return json.encode({ success = true, record = result })
end

--- data decodes to { appid }. Deletes the game's stored record entirely,
--- reverting it to backlog. Returns { success, existed } as JSON.
function remove_tag(data)
	local params = decode_params(data)
	local ok, existed = pcall(sync.remove_tag, params.appid)
	if not ok then
		logger:error("remove_tag failed: " .. tostring(existed))
		return json.encode({ success = false, error = tostring(existed) })
	end
	return json.encode({ success = true, existed = existed })
end

--- data decodes to { appid }. Clears any manual override and
--- immediately recomputes the tag from the game's current stored stats.
--- Returns { success, record } as JSON.
function reset_to_auto_tag(data)
	local params = decode_params(data)
	local ok, record = pcall(sync.reset_to_auto_tag, params.appid)
	if not ok then
		logger:error("reset_to_auto_tag failed: " .. tostring(record))
		return json.encode({ success = false, error = tostring(record) })
	end
	return json.encode({ success = true, record = record })
end

--- Returns { success, stats } as JSON: per-tag counts, backlog, and total.
function get_tag_statistics()
	local ok, stats = pcall(queries.get_tag_statistics)
	if not ok then
		logger:error("get_tag_statistics failed: " .. tostring(stats))
		return json.encode({ success = false, error = tostring(stats) })
	end
	return json.encode({ success = true, stats = stats })
end

--- Returns { success, games } as JSON: every tagged game, sorted by name.
function get_tagged_games()
	local ok, games = pcall(queries.get_tagged_games)
	if not ok then
		logger:error("get_tagged_games failed: " .. tostring(games))
		return json.encode({ success = false, error = tostring(games) })
	end
	return '{"success":true,"games":' .. encode_array(games) .. "}"
end

--- Returns { success, games } as JSON: every synced-but-untagged
--- (backlog) game, sorted by name.
function get_backlog_games()
	local ok, games = pcall(queries.get_backlog_games)
	if not ok then
		logger:error("get_backlog_games failed: " .. tostring(games))
		return json.encode({ success = false, error = tostring(games) })
	end
	return '{"success":true,"games":' .. encode_array(games) .. "}"
end

--- Manual/dev-console trigger for the same sweep on_load runs
--- automatically. Returns { success, newly_dropped } as JSON.
function check_dropped_games()
	local ok, newly_dropped = pcall(dropped_sweep.check_dropped_games)
	if not ok then
		return json.encode({ success = false, error = tostring(newly_dropped) })
	end
	return json.encode({ success = true, newly_dropped = newly_dropped })
end

--- data decodes to { level, message }. Pipes a frontend log line into
--- this same backend logger/Logs panel -- CEF DevTools console access
--- varies a lot by Millennium setup, but everyone testing this plugin
--- has already found the Logs panel, so debugging output goes there
--- too instead of only to console.log/console.error. Returns { success }.
function log_frontend(data)
	local params = decode_params(data)
	local level = params.level or "info"
	local message = tostring(params.message or "")
	if level == "error" then
		logger:error("[frontend] " .. message)
	elseif level == "warn" then
		logger:warn("[frontend] " .. message)
	else
		logger:info("[frontend] " .. message)
	end
	return json.encode({ success = true })
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
	check_dropped_games = check_dropped_games,
	log_frontend = log_frontend,
}
