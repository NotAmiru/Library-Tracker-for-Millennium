local logger = require("logger")
local millennium = require("millennium")

local plugin = {}

function plugin.on_load()
	logger:info("Library Tracker backend loaded")
	millennium.ready()
end

function plugin.on_frontend_loaded()
	logger:info("Library Tracker frontend loaded")
end

function plugin.on_unload()
	logger:info("Library Tracker backend unloading")
end

return plugin
