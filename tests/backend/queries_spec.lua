local mock = require("mock_natives")

return function()
	mock.install()
	local storage = require("storage")
	local queries = require("queries")

	-- Empty library: everything zero.
	local empty_stats = queries.get_tag_statistics()
	assert(empty_stats.total == 0)
	assert(empty_stats.backlog == 0)
	assert(#queries.get_tagged_games() == 0)
	assert(#queries.get_backlog_games() == 0)

	storage.upsert(730, { game_name = "Counter-Strike 2", tag = "in_progress" })
	storage.upsert(440, { game_name = "Team Fortress 2", tag = "mastered" })
	storage.upsert(570, { game_name = "Dota 2", tag = "mastered" })
	storage.upsert(220, { game_name = "Half-Life 2" }) -- synced, no tag -> backlog

	local stats = queries.get_tag_statistics()
	assert(stats.total == 4, "expected 4 games total")
	assert(stats.mastered == 2, "expected 2 mastered games")
	assert(stats.in_progress == 1, "expected 1 in_progress game")
	assert(stats.backlog == 1, "expected 1 backlog game (synced, no tag)")
	assert(stats.completed == 0 and stats.dropped == 0)

	local tagged = queries.get_tagged_games()
	assert(#tagged == 3, "expected 3 tagged games (backlog excluded)")
	-- Sorted by name: Counter-Strike 2, Dota 2, Team Fortress 2
	assert(tagged[1].game_name == "Counter-Strike 2")
	assert(tagged[2].game_name == "Dota 2")
	assert(tagged[3].game_name == "Team Fortress 2")
	assert(tagged[1].tag == "in_progress")

	local backlog = queries.get_backlog_games()
	assert(#backlog == 1)
	assert(backlog[1].game_name == "Half-Life 2")

	print("queries_spec: OK")
end
