local fs = require("fs")
local json = require("json")
local utils = require("utils")
local paths = require("paths")

--- Persists the in-progress full-library sync queue to disk, one appid
--- popped off at a time as each game's sync completes. Millennium's own
--- native host has been observed crashing outright partway through a
--- full-library sync on this install (EXCEPTION_ACCESS_VIOLATION at an
--- identical faulting instruction across four separate real-device
--- crashes, unaffected by request pacing, appid-range filtering, or
--- app-type filtering -- a deterministic bug in Millennium's own code,
--- not something fixable from here). Persisting progress after every
--- single game means a crash can only cost whatever game was in flight
--- at the time, not the whole sync -- the next "Sync Entire Library"
--- run picks the queue back up instead of starting over from scratch.
local FILE_NAME = "sync_queue.json"

local M = {}

local function file_path()
	return fs.join(paths.data_dir(), FILE_NAME)
end

--- json.encode() can't distinguish an empty Lua table from an empty JSON
--- object -- see main.lua's encode_array() for the full explanation and
--- the real-device bug it was added to fix. `pending` reaching empty is
--- the expected end state of a completed sync, so this needs the same
--- treatment.
local function encode_queue(queue)
	local pending_json
	if queue.pending == nil or #queue.pending == 0 then
		pending_json = "[]"
	else
		local ok, encoded = pcall(json.encode, queue.pending)
		if not ok then
			return nil
		end
		pending_json = encoded
	end
	return '{"pending":' .. pending_json .. ',"total":' .. tostring(queue.total or 0) .. "}"
end

--- Starts a fresh queue, overwriting any previous one.
--- @param appids table: array of appids (numbers or strings) to sync
function M.start(appids)
	local queue = { pending = appids, total = #appids }
	local encoded = encode_queue(queue)
	if encoded then
		utils.write_file(file_path(), encoded)
	end
end

--- Returns { pending = {...}, total = N }, or nil if there's no queue
--- (never started, corrupt, or already cleared).
function M.get()
	local path = file_path()
	if not fs.exists(path) then
		return nil
	end
	local content = utils.read_file(path)
	if content == nil then
		return nil
	end
	local ok, decoded = pcall(json.decode, content)
	if not ok or type(decoded) ~= "table" or type(decoded.pending) ~= "table" then
		return nil
	end
	return decoded
end

--- Removes `appid` from the pending list (wherever it is, defensively --
--- not just the front) and persists immediately.
--- @return table|nil the updated queue, or nil if there wasn't one
function M.pop(appid)
	local queue = M.get()
	if not queue then
		return nil
	end
	local remaining = {}
	local target = tostring(appid)
	for _, id in ipairs(queue.pending) do
		if tostring(id) ~= target then
			table.insert(remaining, id)
		end
	end
	queue.pending = remaining
	local encoded = encode_queue(queue)
	if encoded then
		utils.write_file(file_path(), encoded)
	end
	return queue
end

--- Clears the queue (sync finished, or a fresh one is about to start).
function M.clear()
	local path = file_path()
	if fs.exists(path) then
		fs.remove(path)
	end
end

return M
