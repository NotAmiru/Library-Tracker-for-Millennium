local utils = require("hltb_utils")

return function()
	-- Levenshtein distance.
	assert(utils.levenshtein_distance("kitten", "sitting") == 3)
	assert(utils.levenshtein_distance("same", "same") == 0)
	assert(utils.levenshtein_distance("", "abc") == 3)

	-- sanitize_game_name strips TM/copyright marks and collapses whitespace.
	assert(utils.sanitize_game_name("Half-Life™") == "Half-Life")
	assert(utils.sanitize_game_name("Portal®  2") == "Portal 2")
	assert(utils.sanitize_game_name("  Trimmed  ") == "Trimmed")

	-- sanitize_game_name also strips mojibake TM/R/C marks: cases where the
	-- correct UTF-8 symbol was decoded as Latin-1/Windows-1252 and
	-- re-encoded, mangling one clean codepoint into 2-3 garbage ones
	-- (e.g. Steam sometimes reports "Battlefieldâ¢ 1" for "Battlefield™ 1").
	assert(utils.sanitize_game_name("Battlefield\xc3\xa2\xe2\x80\x9e\xc2\xa2 1") == "Battlefield 1")
	assert(utils.sanitize_game_name("Battlefield\xc3\xa2\xc2\x84\xc2\xa2 1") == "Battlefield 1")
	assert(utils.sanitize_game_name("Portal\xc3\x82\xc2\xae 2") == "Portal 2")
	assert(utils.sanitize_game_name("Some Game\xc3\x82\xc2\xa9") == "Some Game")

	-- simplify_game_name strips edition suffixes.
	assert(utils.simplify_game_name("Company of Heroes - Legacy Edition") == "Company of Heroes")
	assert(utils.simplify_game_name("Artifact Classic") == "Artifact")
	assert(utils.simplify_game_name("Half-Life 2") == "Half-Life 2", "a name with no edition suffix should be unchanged")
	-- Stacked suffixes are resolved by looping to a fixpoint.
	assert(utils.simplify_game_name("Some Game GOTY Edition Remastered") == "Some Game")

	-- calculate_similarity: identical names are 1.0, wildly different names are near 0.
	assert(utils.calculate_similarity("Portal 2", "Portal 2") == 1.0)
	assert(utils.calculate_similarity("", "Portal 2") == 0)
	local partial = utils.calculate_similarity("Portal 2", "Portal")
	assert(partial > 0.5 and partial < 1.0, "a close-but-not-exact match should score between 0.5 and 1.0")

	-- seconds_to_hours: nil for zero/missing, otherwise hours to 1 decimal.
	assert(utils.seconds_to_hours(0) == nil)
	assert(utils.seconds_to_hours(nil) == nil)
	assert(utils.seconds_to_hours(3600) == 1.0)
	assert(utils.seconds_to_hours(5400) == 1.5)

	print("hltb_utils_spec: OK")
end
