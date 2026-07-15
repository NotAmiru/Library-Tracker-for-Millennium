local storage = require("storage")
local settings = require("settings")
local tag_engine = require("tag_engine")
local logger = require("logger")

--- Re-evaluates every stored, non-manual game for the Dropped tag based on
--- elapsed time since it was last played.
---
--- Deck Progress Tracker's Decky/Python version ran this as a background
--- asyncio task on a 24-hour timer. Millennium's Lua backend has no
--- equivalent fire-and-forget sleep/interval primitive -- the only async
--- primitive exposed (millennium.start_coroutine + yield_readable) is for
--- watching a file descriptor become readable, not for timers, and a
--- literal utils.sleep(24 * 3600 * 1000) would block the single Lua VM
--- for a full day, unable to answer any other RPC the whole time. Rather
--- than force that broken translation, this runs once per backend
--- startup (main.lua's on_load) instead of on a standing timer -- Steam
--- being open is already a precondition for either design to matter, and
--- most games get re-checked for real anyway on their next individual
--- sync (calculate_tag runs the same is_dropped check there). This sweep
--- only matters for games that cross the threshold purely from elapsed
--- time, without the user ever revisiting them.
local M = {}

--- @return integer: number of games newly tagged dropped
function M.check_dropped_games()
	local thresholds = settings.get_all()
	local now = os.time()
	local newly_dropped = 0

	for appid, record in pairs(storage.get_all()) do
		local is_manual = record.is_manual == true
		local already_settled = record.tag == "dropped" or record.tag == "mastered" or record.tag == "completed"

		if not is_manual and not already_settled then
			-- hltb is intentionally nil here: a full-library HLTB sweep on
			-- every backend startup would be slow and network-heavy for a
			-- check that's purely about elapsed time, and Completed
			-- already can't apply to any game reaching this branch (those
			-- are excluded by already_settled above once they're synced).
			local tag = tag_engine.calculate_tag(record, nil, thresholds, now)
			if tag == "dropped" then
				storage.upsert(appid, { tag = "dropped" })
				newly_dropped = newly_dropped + 1
			end
		end
	end

	if newly_dropped > 0 then
		logger:info("dropped_sweep: tagged " .. newly_dropped .. " game(s) as dropped")
	end

	return newly_dropped
end

return M
