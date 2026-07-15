local millennium = require("millennium")
local logger = require("logger")

--- Plugin-wide settings, backed by Millennium's built-in per-plugin config
--- store (millennium.config). Writes here are auto-persisted and pushed
--- live to the frontend and any other backend listener, so no manual
--- file I/O or explicit RPC round-trip is needed for settings specifically
--- (contrast with backend/storage.lua, which handles per-game data that
--- would blow past millennium.config's 256-key limit).
--- Note: the source plugin (Deck Progress Tracker) had source_installed/
--- source_non_steam/source_all_owned settings controlling its backend's
--- local-file-based (VDF) library-discovery fallback. This port's library
--- enumeration is entirely frontend-driven (frontend/lib/libraryEnumeration.ts,
--- reading Steam's own client state) with no backend fallback discovery
--- to speak of, so those three settings would do nothing here -- omitted
--- rather than shipped as dead toggles, the same standard PORTING_PLAN.md
--- applied to the source plugin's own dead settings (mastered_multiplier,
--- auto_tag_enabled).
local DEFAULTS = {
	mastered_achievement_percent = 85,
	in_progress_threshold_minutes = 30,
	dropped_days_threshold = 365,
	hltb_cache_soft_ttl_hours = 12,
	hltb_cache_hard_ttl_days = 90,
}

local M = {}

--- Get a single setting, falling back to its default if unset.
function M.get(key)
	local value, err = millennium.config.get(key)
	if err ~= nil or value == nil then
		return DEFAULTS[key]
	end
	return value
end

--- Get every known setting, filling in defaults for anything unset.
function M.get_all()
	local stored, err = millennium.config.get_all()
	if err ~= nil or type(stored) ~= "table" then
		stored = {}
	end

	local merged = {}
	for key, default_value in pairs(DEFAULTS) do
		if stored[key] == nil then
			merged[key] = default_value
		else
			merged[key] = stored[key]
		end
	end
	return merged
end

--- Set one or more settings from a table of key/value pairs. Keys not
--- present in DEFAULTS are rejected so a typo can't silently create a
--- permanent, unused config entry. Returns the merged settings table.
function M.update(values)
	for key, value in pairs(values) do
		if DEFAULTS[key] == nil then
			logger:warn("settings.update: ignoring unknown key '" .. tostring(key) .. "'")
		else
			local ok, err = millennium.config.set(key, value)
			if not ok then
				logger:error("settings.update: failed to set '" .. key .. "': " .. tostring(err))
			end
		end
	end
	return M.get_all()
end

function M.defaults()
	return DEFAULTS
end

return M
