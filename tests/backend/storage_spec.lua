local mock = require("mock_natives")

return function()
	mock.install()
	local storage = require("storage")

	-- Unknown appid has no record.
	assert(storage.get(730) == nil, "expected no record for unsynced appid")

	-- upsert creates a new record and returns it.
	local record = storage.upsert(730, { game_name = "Counter-Strike 2", playtime_minutes = 120 })
	assert(record.game_name == "Counter-Strike 2")
	assert(record.playtime_minutes == 120)

	-- get() retrieves what was just stored, keyed by string appid even
	-- though we upserted with a number (appids must round-trip through
	-- JSON object keys, which are always strings).
	local fetched = storage.get("730")
	assert(fetched ~= nil, "expected record to be retrievable by string appid")
	assert(fetched.game_name == "Counter-Strike 2")

	-- upsert merges fields into the existing record rather than replacing it.
	storage.upsert(730, { tag = "in_progress" })
	local merged = storage.get(730)
	assert(merged.tag == "in_progress", "tag was not merged in")
	assert(merged.game_name == "Counter-Strike 2", "existing fields were dropped on merge")

	-- get_all() reflects every stored record.
	storage.upsert(440, { game_name = "Team Fortress 2" })
	local all = storage.get_all()
	assert(all["730"] ~= nil and all["440"] ~= nil, "expected both games in get_all()")

	-- delete() removes a record and reports whether one existed.
	assert(storage.delete(440) == true, "delete should report the record existed")
	assert(storage.get(440) == nil, "record should be gone after delete")
	assert(storage.delete(440) == false, "deleting again should report nothing existed")

	print("storage_spec: OK")
end
