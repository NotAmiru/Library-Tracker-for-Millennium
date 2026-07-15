local fs = require("fs")
local utils = require("utils")

--- Resolves filesystem locations for this plugin's own persistent data.
--- Kept separate from settings.lua, which uses Millennium's built-in
--- config store instead of the filesystem.
local M = {}

--- Base directory this plugin was installed into.
function M.plugin_dir()
	return fs.parent_path(utils.get_backend_path() or "")
end

--- Writable directory for this plugin's own data files, created on first use.
function M.data_dir()
	local dir = fs.join(M.plugin_dir(), "data")
	if not fs.exists(dir) then
		fs.create_directories(dir)
	end
	return dir
end

return M
