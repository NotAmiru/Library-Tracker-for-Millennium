-- Plain-Lua test runner for backend/*.lua, using tests/support/mock_natives.lua
-- to fake Millennium's native modules (json, fs, utils, logger, millennium).
-- Run with: lua tests/run.lua
package.path = "backend/?.lua;tests/support/?.lua;" .. package.path

local RESET_MODULES = {
	"mock_natives",
	"main",
	"settings",
	"storage",
	"tag_engine",
	"sync",
	"queries",
	"hltb_cache",
	"hltb_client",
	"hltb_match",
	"hltb_utils",
	"hltb_endpoint_discovery",
	"dropped_sweep",
	"paths",
	"json",
	"fs",
	"utils",
	"logger",
	"millennium",
	"http",
}

local function reset_modules()
	for _, name in ipairs(RESET_MODULES) do
		package.loaded[name] = nil
		package.preload[name] = nil
	end
end

local specs = {
	"tests/backend/settings_spec",
	"tests/backend/storage_spec",
	"tests/backend/tag_engine_spec",
	"tests/backend/sync_spec",
	"tests/backend/queries_spec",
	"tests/backend/hltb_utils_spec",
	"tests/backend/hltb_cache_spec",
	"tests/backend/hltb_match_spec",
	"tests/backend/dropped_sweep_spec",
	"tests/backend/json_regression_spec",
}

local failures = 0
for _, spec_path in ipairs(specs) do
	reset_modules()
	local ok, err = pcall(function()
		local run = dofile(spec_path .. ".lua")
		run()
	end)
	if not ok then
		failures = failures + 1
		print("FAIL: " .. spec_path)
		print("  " .. tostring(err))
	end
end

if failures > 0 then
	print(failures .. " spec(s) failed")
	os.exit(1)
else
	print("All specs passed")
end
