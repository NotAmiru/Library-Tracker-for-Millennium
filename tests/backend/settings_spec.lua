local mock = require("mock_natives")

return function()
	local m = mock.install()
	local settings = require("settings")

	-- Unset settings fall back to documented defaults.
	local defaults = settings.get_all()
	assert(defaults.in_progress_threshold_minutes == 30, "expected default in_progress_threshold_minutes")
	assert(defaults.mastered_achievement_percent == 85, "expected default mastered_achievement_percent")

	-- update() persists known keys through millennium.config and is
	-- reflected immediately in get_all()/get().
	local merged = settings.update({ in_progress_threshold_minutes = 45 })
	assert(merged.in_progress_threshold_minutes == 45, "update did not apply")
	assert(settings.get("in_progress_threshold_minutes") == 45, "get() did not see updated value")
	assert(m.config_store.in_progress_threshold_minutes == 45, "value not written to millennium.config")

	-- Unrelated defaults are untouched by a partial update.
	assert(settings.get("mastered_achievement_percent") == 85, "unrelated setting was clobbered")

	-- Unknown keys are rejected, not silently persisted.
	settings.update({ not_a_real_setting = 1 })
	assert(m.config_store.not_a_real_setting == nil, "unknown key should not be persisted")

	print("settings_spec: OK")
end
