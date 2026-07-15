--- Finds the best-matching HLTB search result for a game name. Ported
--- from hltb-millennium-plugin's hltb_match.lua, dropping the Steam-ID
--- cross-verification step (which needs the ID-cache/Steam-import system
--- this plugin doesn't implement) -- matches are Levenshtein-distance-only,
--- same as Deck Progress Tracker's original difflib-based approach, but
--- with the more robust two-step simplified-name retry.
local logger = require("logger")
local client = require("hltb_client")
local utils = require("hltb_utils")

local M = {}

M.RETRY_DISTANCE_RATIO = 0.2
M.RETRY_DISTANCE_MIN = 5

local function should_retry_with_simplified(distance, name_length)
	local threshold = math.max(M.RETRY_DISTANCE_MIN, math.floor(name_length * M.RETRY_DISTANCE_RATIO))
	return distance > threshold
end

--- @return table|nil best_item, number|nil best_distance
local function find_best_match(query)
	local search_results = client.search(query)
	if not search_results or #search_results.data == 0 then
		return nil, nil
	end

	local sanitized_query = utils.sanitize_game_name(query):lower()

	for _, item in ipairs(search_results.data) do
		if utils.sanitize_game_name(item.game_name):lower() == sanitized_query then
			return item, 0
		end
	end

	local possible_choices = {}
	for _, item in ipairs(search_results.data) do
		local distance = utils.levenshtein_distance(sanitized_query, utils.sanitize_game_name(item.game_name):lower())
		table.insert(possible_choices, { distance = distance, comp_all_count = item.comp_all_count, item = item })
	end

	table.sort(possible_choices, function(a, b)
		if a.distance == b.distance then
			return a.comp_all_count > b.comp_all_count
		end
		return a.distance < b.distance
	end)

	if #possible_choices > 0 then
		return possible_choices[1].item, possible_choices[1].distance
	end
	return nil, nil
end

--- Searches HLTB for the best match for `app_name`, retrying with a
--- simplified (edition-suffix-stripped) name only if the first search
--- found nothing or matched poorly -- some HLTB entries keep edition
--- suffixes and some don't, so trying the original name first avoids
--- breaking the games that do keep them.
--- @return table|nil: the matched HLTB search-result item, or nil
function M.search_best_match(app_name)
	logger:info("Searching HLTB for: " .. app_name)

	local best_item, best_distance = find_best_match(app_name)

	local simplified_name = utils.simplify_game_name(app_name)
	local should_retry = simplified_name ~= app_name
		and (best_item == nil or should_retry_with_simplified(best_distance, #app_name))

	if should_retry then
		logger:info("Retrying HLTB search with simplified name: " .. simplified_name)
		local retry_item, retry_distance = find_best_match(simplified_name)
		if retry_item and (best_item == nil or retry_distance < best_distance) then
			best_item = retry_item
			best_distance = retry_distance
		end
	end

	if best_item then
		logger:info("Best HLTB match: " .. best_item.game_name .. " (distance: " .. tostring(best_distance) .. ")")
	else
		logger:info("No HLTB match found for: " .. app_name)
	end

	return best_item
end

return M
