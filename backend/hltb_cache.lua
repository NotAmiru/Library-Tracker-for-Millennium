local fs = require("fs")
local json = require("json")
local logger = require("logger")
local utils = require("utils")
local paths = require("paths")

--- Disk-persisted cache of HLTB search results, keyed by appid. Modeled
--- on hltb-millennium-plugin's cache.lua design (stale-while-revalidate
--- via separate soft/hard TTLs, merge-on-write so a fetch that only
--- partially succeeds never erases previously-known-good fields, periodic
--- pruning by entry count) -- but stored under this plugin's own
--- namespaced data directory (paths.lua) rather than the shared
--- Millennium install directory the reference plugin writes to, which
--- risks colliding with any other plugin that also writes "cache.json"
--- there.
local M = {}

local FILE_NAME = "hltb_cache.json"
local MAX_ENTRIES = 2000
local PRUNE_INTERVAL = 50

local state = nil
local writes_since_prune = 0

local function file_path()
	return fs.join(paths.data_dir(), FILE_NAME)
end

local function load()
	if state ~= nil then
		return state
	end

	local path = file_path()
	if not fs.exists(path) then
		state = {}
		return state
	end

	local content = utils.read_file(path)
	if content == nil then
		state = {}
		return state
	end

	local ok, decoded = pcall(json.decode, content)
	if not ok or type(decoded) ~= "table" then
		logger:warn("hltb_cache: " .. path .. " is corrupt or unreadable, starting fresh")
		state = {}
		return state
	end

	state = decoded
	return state
end

local function save()
	if state == nil then
		return
	end
	local ok, encoded = pcall(json.encode, state)
	if not ok then
		logger:error("hltb_cache: failed to encode cache: " .. tostring(encoded))
		return
	end
	local success, err = utils.write_file(file_path(), encoded)
	if not success then
		logger:error("hltb_cache: failed to write " .. file_path() .. ": " .. tostring(err))
	end
end

local function prune()
	local entries = load()
	local count = 0
	for _ in pairs(entries) do
		count = count + 1
	end
	if count <= MAX_ENTRIES then
		return
	end

	local list = {}
	for appid, entry in pairs(entries) do
		list[#list + 1] = { appid = appid, cached_at = entry.cached_at or 0 }
	end
	table.sort(list, function(a, b)
		return a.cached_at > b.cached_at
	end)

	for i = MAX_ENTRIES + 1, #list do
		entries[list[i].appid] = nil
	end
end

--- @return table|nil entry, boolean is_stale
--- Entries older than hard_ttl_seconds are treated as absent entirely
--- (nil, false). Entries between soft_ttl_seconds and hard_ttl_seconds
--- are returned with is_stale = true, so a caller can serve them
--- immediately (stale-while-revalidate) while deciding whether to
--- refresh.
function M.get(appid, soft_ttl_seconds, hard_ttl_seconds)
	local entries = load()
	local entry = entries[tostring(appid)]
	if entry == nil then
		return nil, false
	end

	local age = os.time() - (entry.cached_at or 0)
	if age > hard_ttl_seconds then
		return nil, false
	end

	return entry, age > soft_ttl_seconds
end

--- Merges `fields` onto the existing cache entry for `appid` (creating
--- one if absent) rather than overwriting it wholesale -- a value of nil
--- in `fields` leaves any existing value for that field untouched, so a
--- fetch that only partially succeeds (e.g. a search miss with no
--- completion-time fields) never erases previously-known-good data.
--- Always refreshes cached_at to now. Returns the merged entry.
function M.set(appid, fields)
	local entries = load()
	local key = tostring(appid)
	local existing = entries[key] or {}

	local merged = {}
	for field, value in pairs(existing) do
		merged[field] = value
	end
	for field, value in pairs(fields) do
		if value ~= nil then
			merged[field] = value
		end
	end
	merged.cached_at = os.time()

	entries[key] = merged

	writes_since_prune = writes_since_prune + 1
	if writes_since_prune >= PRUNE_INTERVAL then
		writes_since_prune = 0
		prune()
	end

	save()
	return merged
end

return M
