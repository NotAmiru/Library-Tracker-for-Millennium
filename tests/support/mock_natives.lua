-- Minimal in-memory fakes for Millennium's native Lua modules (json, fs,
-- utils, logger, millennium), just enough behavior for backend/*.lua's
-- logic to run under a plain Lua interpreter and be asserted against.
-- Not a reimplementation of the real modules' semantics beyond that.
local M = {}

function M.install()
	local files = {}
	local dirs = {}

	package.preload["json"] = function()
		local json = {}
		-- Real cjson serializes to/from strings. These tests only care
		-- that storage.lua round-trips data through json.encode/decode
		-- correctly, not that the intermediate form is textual, so both
		-- are identity functions over plain Lua values here.
		function json.encode(value)
			return value
		end
		function json.decode(value)
			return value
		end
		return json
	end

	package.preload["fs"] = function()
		local fs = {}
		function fs.exists(path)
			return files[path] ~= nil or dirs[path] == true
		end
		function fs.create_directories(path)
			dirs[path] = true
			return true
		end
		function fs.parent_path(path)
			return (path:gsub("/[^/]+$", ""))
		end
		function fs.join(...)
			return table.concat({ ... }, "/")
		end
		return fs
	end

	package.preload["utils"] = function()
		local utils = {}
		function utils.get_backend_path()
			return "/plugin/backend/main.lua"
		end
		function utils.read_file(path)
			if files[path] == nil then
				return nil, "not found"
			end
			return files[path]
		end
		function utils.write_file(path, content)
			files[path] = content
			return true
		end
		return utils
	end

	package.preload["http"] = function()
		local http = {}
		-- No real network access in tests (and none available in this
		-- sandbox regardless) -- every call fails cleanly, exercising the
		-- same "request failed" path a real offline/blocked HLTB request
		-- would. Tests that need a successful HLTB match populate
		-- hltb_cache directly instead of going through this module.
		local function fail()
			return nil, "mocked: no network in tests"
		end
		http.get = fail
		http.post = fail
		http.put = fail
		http.delete = fail
		http.request = fail
		return http
	end

	package.preload["logger"] = function()
		local logger = {}
		function logger:info(_) end
		function logger:warn(_) end
		function logger:error(_) end
		return logger
	end

	local config_store = {}
	package.preload["millennium"] = function()
		local millennium = { config = {} }
		function millennium.ready()
			return true
		end
		function millennium.config.get(key)
			return config_store[key]
		end
		function millennium.config.set(key, value)
			config_store[key] = value
			return true
		end
		function millennium.config.get_all()
			return config_store
		end
		function millennium.config.delete(key)
			config_store[key] = nil
			return true
		end
		return millennium
	end

	return { files = files, dirs = dirs, config_store = config_store }
end

return M
