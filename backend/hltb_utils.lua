--- String utilities for HLTB name matching: sanitization, edition-suffix
--- stripping, Levenshtein distance, and unit conversion. Ported from
--- hltb-millennium-plugin's hltb_utils.lua (jcdoll/hltb-millennium-plugin),
--- a Millennium reference plugin -- this module is pure string logic with
--- no native module dependencies, so the port is close to verbatim.
local M = {}

--- Levenshtein edit distance between two strings.
function M.levenshtein_distance(s1, s2)
	local len1, len2 = #s1, #s2
	local matrix = {}

	for i = 0, len1 do
		matrix[i] = { [0] = i }
	end
	for j = 0, len2 do
		matrix[0][j] = j
	end

	for i = 1, len1 do
		for j = 1, len2 do
			local cost = (s1:sub(i, i) == s2:sub(j, j)) and 0 or 1
			matrix[i][j] = math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
		end
	end

	return matrix[len1][len2]
end

--- Strip trademark/copyright symbols and normalize whitespace for comparison.
function M.sanitize_game_name(name)
	name = name:gsub("™", "")
	name = name:gsub("®", "")
	name = name:gsub("©", "")
	name = name:gsub("\xe2\x80\x98", "'")
	name = name:gsub("\xe2\x80\x99", "'")
	name = name:gsub("%(TM%)", "")
	name = name:gsub("%(R%)", "")
	name = name:gsub("%s+", " ")
	name = name:match("^%s*(.-)%s*$") or name
	return name
end

--- Strip common edition/remaster/etc. suffixes for a fallback search when
--- the exact name doesn't match anything on HLTB. Looped until a fixpoint
--- to handle stacked suffixes ("Enhanced Edition Director's Cut"). Some
--- HLTB entries keep these suffixes and some don't -- see hltb_match.lua
--- for how the two-step search around this is structured.
function M.simplify_game_name(name)
	name = name:gsub("–", "-")
	name = name:gsub("—", "-")

	local prev
	repeat
		prev = name

		name = name:gsub("%s+%d+[snrt][tdh]%s+[Aa]nniversary%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Aa]nniversary%s+[Ee]dition$", "")
		name = name:gsub("%s+[Aa]nniversary%s+[Ee]dition$", "")

		name = name:gsub("%s+[-:]%s*[Ee]nhanced%s+[Ee]dition$", "")
		name = name:gsub("%s+[Ee]nhanced%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Cc]omplete%s+[Ee]dition$", "")
		name = name:gsub("%s+[Cc]omplete%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Dd]efinitive%s+[Ee]dition$", "")
		name = name:gsub("%s+[Dd]efinitive%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Uu]ltimate%s+[Ee]dition$", "")
		name = name:gsub("%s+[Uu]ltimate%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Ss]pecial%s+[Ee]dition$", "")
		name = name:gsub("%s+[Ss]pecial%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Ll]egacy%s+[Ee]dition$", "")
		name = name:gsub("%s+[Ll]egacy%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Mm]aximum%s+[Ee]dition$", "")
		name = name:gsub("%s+[Mm]aximum%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*GOTY%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*GOTY$", "")
		name = name:gsub("%s+GOTY%s+[Ee]dition$", "")
		name = name:gsub("%s+GOTY$", "")
		name = name:gsub("%s+[-:]%s*[Gg]ame%s+of%s+the%s+[Yy]ear%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Gg]ame%s+of%s+the%s+[Yy]ear$", "")
		name = name:gsub("%s+[Gg]ame%s+of%s+the%s+[Yy]ear%s+[Ee]dition$", "")
		name = name:gsub("%s+[Gg]ame%s+of%s+the%s+[Yy]ear$", "")
		name = name:gsub("%s+[-:]%s*[Dd]eluxe%s+[Ee]dition$", "")
		name = name:gsub("%s+[Dd]eluxe%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Pp]remium%s+[Oo]nline%s+[Ee]dition$", "")
		name = name:gsub("%s+[Pp]remium%s+[Oo]nline%s+[Ee]dition$", "")
		name = name:gsub("%s+[-:]%s*[Pp]remium%s+[Ee]dition$", "")
		name = name:gsub("%s+[Pp]remium%s+[Ee]dition$", "")
		name = name:gsub("%s+[Ss]team%s+[Ee]dition$", "")

		name = name:gsub("%s+[-:]%s*[Rr]emastered$", "")
		name = name:gsub("%s+[Rr]emastered$", "")
		name = name:gsub("%s+%([3Dd]+%s*[Rr]emake%)$", "")
		name = name:gsub("%s+[-:]%s*[Rr]emake$", "")
		name = name:gsub("%s+[Rr]emake$", "")

		name = name:gsub("%s+[-:]%s*[Dd]irector'?s?%s+[Cc]ut$", "")
		name = name:gsub("%s+[Dd]irector'?s?%s+[Cc]ut$", "")

		name = name:gsub("%s+[Cc]ollection$", "")

		name = name:gsub("%s+%([Ll]egacy%)$", "")
		name = name:gsub("%s+[-:]%s*[Cc]lassic$", "")
		name = name:gsub("%s+[Cc]lassic$", "")
		name = name:gsub("%s+%(CLASSIC%)$", "")
		name = name:gsub("%s+HD$", "")
		name = name:gsub("%s+[Ee]nhanced$", "")

		name = name:gsub("%s+[-:]%s*[Ss]ingle%s+[Pp]layer$", "")
		name = name:gsub("%s+[Ss]ingle%s+[Pp]layer$", "")

		name = name:gsub("%s+[-:]%s*[Ss]eason%s+%d+$", "")
		name = name:gsub("%s+[Ss]eason%s+%d+$", "")

		name = name:gsub("%s+[Oo]nline$", "")

		name = name:gsub("%s+%([12][09]%d%d%)$", "")

		name = name:gsub("%s*[-:]%s*$", "")
	until name == prev

	name = name:gsub("%s+", " ")
	name = name:match("^%s*(.-)%s*$") or name

	return name
end

--- 0.0-1.0 similarity between two names, after sanitization.
function M.calculate_similarity(s1, s2)
	local norm_s1 = M.sanitize_game_name(s1):lower()
	local norm_s2 = M.sanitize_game_name(s2):lower()

	if norm_s1 == "" or norm_s2 == "" then
		return 0
	end
	if norm_s1 == norm_s2 then
		return 1.0
	end

	local distance = M.levenshtein_distance(norm_s1, norm_s2)
	local max_len = math.max(#norm_s1, #norm_s2)
	return math.floor((1.0 - (distance / max_len)) * 100) / 100
end

--- HLTB reports completion times in seconds; we store hours to 1 decimal.
--- Returns nil for zero/missing (meaning "no data"), not 0.
function M.seconds_to_hours(seconds)
	if not seconds or seconds <= 0 then
		return nil
	end
	return math.floor((seconds / 3600) * 10 + 0.5) / 10
end

-- Non-game software Steam sometimes lists alongside real games (redist
-- packages, Proton/runtime components), ported from Deck Progress
-- Tracker's original skip-list -- an HLTB search for these would only
-- ever burn a request on a guaranteed miss.
local SKIP_KEYWORDS = {
	"proton",
	"steam linux runtime",
	"steamworks",
	"redistributable",
	"directx",
	"vcredist",
}

--- Whether an HLTB lookup for `game_name` should be skipped entirely
--- (empty/placeholder name, or a known non-game software title).
function M.should_skip_lookup(game_name)
	if game_name == nil or game_name == "" or game_name:match("^Unknown") then
		return true
	end
	local lower = game_name:lower()
	for _, keyword in ipairs(SKIP_KEYWORDS) do
		if lower:find(keyword, 1, true) then
			return true
		end
	end
	return false
end

return M
