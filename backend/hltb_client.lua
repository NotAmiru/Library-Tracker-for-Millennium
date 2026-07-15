--- HTTP client for HLTB's search API. Ported from hltb-millennium-plugin's
--- hltb_api.lua, scoped down to just search (this plugin looks games up by
--- name only -- no Steam-ID cross-verification or ID-cache/Steam-import
--- system, which hltb_match.lua's reference version uses those for).
local http = require("http")
local json = require("json")
local logger = require("logger")
local endpoints = require("hltb_endpoint_discovery")

local M = {}

M.TOKEN_TTL = 300
M.SEARCH_SIZE = 20

-- Exposed for testing; defaults to the real http module.
M._http = http

local cached_auth = nil
local auth_expires_at = 0

local function fetch_auth_once()
	local init_url = endpoints.get_init_url()
	if not init_url then
		return nil, "endpoint discovery failed"
	end

	local timestamp_ms = math.floor(os.time() * 1000)
	local response, err = M._http.get(init_url .. "?t=" .. timestamp_ms, {
		headers = { ["User-Agent"] = endpoints.USER_AGENT, ["referer"] = endpoints.REFERER_HEADER },
		timeout = endpoints.TIMEOUT,
	})

	if not response then
		return nil, "Request failed: " .. (err or "unknown")
	end
	if response.status ~= 200 then
		return nil, "HTTP " .. response.status
	end

	local ok, data = pcall(json.decode, response.body)
	if not ok or not data or not data.token then
		return nil, "Invalid or missing token in response"
	end

	return { token = data.token, key = data.hpKey, value = data.hpVal }, nil
end

--- Gets a cached auth token, refetching (and, on failure, re-detecting the
--- endpoint once) if expired or force_refresh is set.
function M.get_auth(force_refresh)
	local now = os.time()
	if not force_refresh and cached_auth and now < auth_expires_at then
		return cached_auth, nil
	end

	local auth, err = fetch_auth_once()
	if not auth then
		logger:info("Auth fetch failed (" .. tostring(err) .. "), re-detecting endpoint and retrying")
		endpoints.invalidate()
		auth, err = fetch_auth_once()
		if not auth then
			return nil, err
		end
	end

	cached_auth = auth
	auth_expires_at = now + M.TOKEN_TTL
	return cached_auth, nil
end

local function build_search_payload(game_name, page, auth)
	local search_terms = {}
	for word in game_name:gmatch("%S+") do
		table.insert(search_terms, word)
	end

	local payload = {
		searchType = "games",
		searchTerms = search_terms,
		searchPage = page or 1,
		size = M.SEARCH_SIZE,
		searchOptions = {
			games = {
				userId = 0,
				platform = "",
				sortCategory = "popular",
				rangeCategory = "main",
				rangeTime = { min = 0, max = 0 },
				gameplay = { perspective = "", flow = "", genre = "", difficulty = "" },
				rangeYear = { max = "", min = "" },
				modifier = "",
			},
			users = { sortCategory = "postcount" },
			lists = { sortCategory = "follows" },
			filter = "",
			sort = 0,
			randomizer = 0,
		},
		useCache = true,
	}

	if auth and auth.key and auth.value then
		payload[tostring(auth.key)] = auth.value
	end

	return json.encode(payload)
end

local function build_search_headers(auth)
	local headers = {
		["Content-Type"] = "application/json",
		["Origin"] = "https://howlongtobeat.com",
		["Referer"] = "https://howlongtobeat.com/",
		["Authority"] = "howlongtobeat.com",
		["User-Agent"] = endpoints.USER_AGENT,
	}
	if auth then
		headers["x-auth-token"] = auth.token
		if auth.key then
			headers["x-hp-key"] = tostring(auth.key)
		end
		if auth.value then
			headers["x-hp-val"] = tostring(auth.value)
		end
	end
	return headers
end

local function search_once(query)
	local auth, auth_err = M.get_auth()
	if not auth then
		return nil, "auth: " .. tostring(auth_err)
	end

	local search_url = endpoints.get_search_url()
	if not search_url then
		return nil, "endpoint discovery failed"
	end

	return M._http.request(search_url, {
		method = "POST",
		headers = build_search_headers(auth),
		data = build_search_payload(query, 1, auth),
		timeout = endpoints.TIMEOUT,
	})
end

local function validate_search_response(data)
	if type(data.data) ~= "table" then
		return false
	end
	for _, item in ipairs(data.data) do
		if type(item.game_id) ~= "number" or type(item.game_name) ~= "string" or type(item.comp_all_count) ~= "number" then
			return false
		end
	end
	return true
end

--- Searches HLTB by name. Retries once on a 403 (token expired
--- server-side -> clear auth) or any other failure (assume the endpoint
--- rotated -> invalidate discovery), never more than once per call, so a
--- persistent outage surfaces as nil rather than looping.
--- @return table|nil: the decoded response ({ data = [...] }), or nil on failure
function M.search(query)
	local response, err = search_once(query)

	if response and response.status == 403 then
		logger:info("HLTB search returned 403, clearing auth and retrying")
		M.clear_cache()
		response, err = search_once(query)
	elseif (not response) or response.status ~= 200 then
		local desc = response and ("HTTP " .. response.status) or tostring(err)
		logger:info("HLTB search failed (" .. desc .. "), re-detecting endpoint and retrying")
		endpoints.invalidate()
		M.clear_cache()
		response, err = search_once(query)
	end

	if not response or response.status ~= 200 then
		logger:info("HLTB search retry failed: " .. tostring(response and response.status or err))
		return nil
	end

	local ok, data = pcall(json.decode, response.body)
	if not ok or not data or not validate_search_response(data) then
		logger:info("HLTB search returned an unexpected response shape")
		return nil
	end

	return data
end

--- Clears the cached auth token (not the endpoint discovery cache).
function M.clear_cache()
	cached_auth = nil
	auth_expires_at = 0
end

return M
