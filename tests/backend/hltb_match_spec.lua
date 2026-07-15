-- hltb_client/hltb_match still need logger/http to exist to load at all,
-- even though this spec only ever exercises the monkey-patched
-- client.search below, never the real http-backed path.
require("mock_natives").install()

local client = require("hltb_client")

local function result(game_id, game_name, comp_all_count, comp_main)
	return { game_id = game_id, game_name = game_name, comp_all_count = comp_all_count, comp_main = comp_main }
end

return function()
	client.search = function(query)
		if query:find("Portal 2", 1, true) or query:find("Portol 2", 1, true) then
			return {
				data = {
					result(1, "Portal", 500, 10800),
					result(2, "Portal 2", 900, 32400),
					result(3, "Portal Stories: Mel", 50, 18000),
				},
			}
		elseif query == "Some Game GOTY Edition" then
			-- No good match for the un-simplified name; forces a retry
			-- with the simplified name below.
			return { data = { result(9, "Completely Unrelated Title", 5, 1000) } }
		elseif query == "Some Game" then
			return { data = { result(10, "Some Game", 300, 7200) } }
		elseif query == "Nothing Matches This" then
			return { data = {} }
		end
		return { data = {} }
	end

	local match = require("hltb_match")

	-- Exact match wins outright, even with decoys present.
	local exact = match.search_best_match("Portal 2")
	assert(exact ~= nil and exact.game_name == "Portal 2", "expected an exact match to win over decoys")

	-- A close typo still finds the right game via Levenshtein distance.
	local typo = match.search_best_match("Portol 2")
	assert(typo ~= nil and typo.game_name == "Portal 2", "expected a small typo to still match via edit distance")

	-- A poor match on the full name triggers a retry with the
	-- edition-suffix-stripped name, which succeeds.
	local retried = match.search_best_match("Some Game GOTY Edition")
	assert(retried ~= nil and retried.game_name == "Some Game", "expected the simplified-name retry to find a match")

	-- No results at all -> no match, not an error.
	local none = match.search_best_match("Nothing Matches This")
	assert(none == nil, "expected nil when HLTB has no results at all")

	print("hltb_match_spec: OK")
end
