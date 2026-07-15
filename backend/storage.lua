local fs = require("fs")
local json = require("json")
local logger = require("logger")
local utils = require("utils")
local paths = require("paths")

--- Persistent store for per-game data (sync stats + progress tag), one
--- JSON file on disk. A Steam library can hold thousands of games, well
--- past millennium.config's 256-key limit, so this can't live in
--- settings.lua's config store the way small global settings do.
---
--- All appid keys are coerced through tostring() before being used as
--- table keys, since a Lua table keyed purely by small sequential
--- integers can be misencoded as a JSON array by the JSON library instead
--- of an object.
local SCHEMA_VERSION = 1
local FILE_NAME = "games.json"

local M = {}

-- Loaded lazily and kept in memory for the life of the backend process.
-- The backend is the only writer, so no external cache invalidation is
-- needed.
local state = nil

local function file_path()
	return fs.join(paths.data_dir(), FILE_NAME)
end

local function empty_state()
	return { schema_version = SCHEMA_VERSION, games = {} }
end

local function load()
	if state ~= nil then
		return state
	end

	local path = file_path()
	if not fs.exists(path) then
		state = empty_state()
		return state
	end

	local content, read_err = utils.read_file(path)
	if content == nil then
		logger:warn("storage: failed to read " .. path .. ": " .. tostring(read_err))
		state = empty_state()
		return state
	end

	local ok, decoded = pcall(json.decode, content)
	if not ok or type(decoded) ~= "table" or type(decoded.games) ~= "table" then
		logger:warn("storage: " .. path .. " is corrupt or unreadable, starting fresh")
		state = empty_state()
		return state
	end

	decoded.schema_version = decoded.schema_version or SCHEMA_VERSION
	state = decoded
	return state
end

local function save()
	if state == nil then
		return
	end

	local ok, encoded = pcall(json.encode, state)
	if not ok then
		logger:error("storage: failed to encode game data: " .. tostring(encoded))
		return
	end

	local success, write_err = utils.write_file(file_path(), encoded)
	if not success then
		logger:error("storage: failed to write " .. file_path() .. ": " .. tostring(write_err))
	end
end

--- Get the stored record for one game, or nil if it has never been synced.
function M.get(appid)
	return load().games[tostring(appid)]
end

--- Get every stored game record, keyed by appid string.
function M.get_all()
	return load().games
end

--- Shallow-merge `fields` into the stored record for `appid` (creating it
--- if absent), persist to disk, and return the merged record.
function M.upsert(appid, fields)
	local games = load().games
	local key = tostring(appid)
	local record = games[key] or {}
	for field, value in pairs(fields) do
		record[field] = value
	end
	games[key] = record
	save()
	return record
end

--- Remove a game's stored record entirely. Returns true if a record existed.
function M.delete(appid)
	local games = load().games
	local key = tostring(appid)
	local existed = games[key] ~= nil
	if existed then
		games[key] = nil
		save()
	end
	return existed
end

return M
