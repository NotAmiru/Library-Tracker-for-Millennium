local logger = require("logger")
local millennium = require("millennium")
local json = require("json")
local settings = require("settings")

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

return {
	on_load = on_load,
	on_frontend_loaded = on_frontend_loaded,
	on_unload = on_unload,
	get_settings = get_settings,
	update_settings = update_settings,
}
