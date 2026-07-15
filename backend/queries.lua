local storage = require("storage")
local tag_engine = require("tag_engine")

--- Read-oriented aggregate/list operations over storage.lua's records.
--- Kept separate from storage.lua's raw CRUD so each stays focused.
local M = {}

local function by_game_name(a, b)
	return (a.game_name or "") < (b.game_name or "")
end

--- Counts of games per tag, plus backlog (synced games with no tag) and total.
function M.get_tag_statistics()
	local counts = { backlog = 0, total = 0 }
	for _, tag in ipairs(tag_engine.TAGS) do
		counts[tag] = 0
	end

	for _, record in pairs(storage.get_all()) do
		counts.total = counts.total + 1
		if record.tag ~= nil and counts[record.tag] ~= nil then
			counts[record.tag] = counts[record.tag] + 1
		else
			counts.backlog = counts.backlog + 1
		end
	end

	return counts
end

--- Every game with a tag set, sorted by name.
--- @return table[]: { appid, game_name, tag, is_manual }
function M.get_tagged_games()
	local list = {}
	for appid, record in pairs(storage.get_all()) do
		if record.tag ~= nil then
			list[#list + 1] = {
				appid = appid,
				game_name = record.game_name,
				tag = record.tag,
				is_manual = record.is_manual == true,
			}
		end
	end
	table.sort(list, by_game_name)
	return list
end

--- Every synced game with no tag (backlog), sorted by name.
--- @return table[]: { appid, game_name }
function M.get_backlog_games()
	local list = {}
	for appid, record in pairs(storage.get_all()) do
		if record.tag == nil then
			list[#list + 1] = { appid = appid, game_name = record.game_name }
		end
	end
	table.sort(list, by_game_name)
	return list
end

return M
