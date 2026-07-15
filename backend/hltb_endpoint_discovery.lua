--- Scrapes HowLongToBeat's NextJS website to find its current (undocumented,
--- unversioned, historically-rotating: search -> finder -> find -> bleed ->
--- ...) search API endpoint. Ported from hltb-millennium-plugin's
--- hltb_endpoint_discovery.lua. There is deliberately no hardcoded
--- fallback endpoint name -- guessing wrong would silently break search,
--- whereas dynamic discovery follows rotations without a code change.
--- Callers invalidate() and retry once on request failure so a mid-session
--- rotation recovers without a Steam restart.
local http = require("http")
local logger = require("logger")

local M = {}

M.BASE_URL = "https://howlongtobeat.com/"
M.REFERER_HEADER = M.BASE_URL
M.TIMEOUT = 60
M.USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

-- Exposed for testing; defaults to the real http module.
M._http = http

-- Known non-search API endpoints to skip while scanning.
local SKIP_ENDPOINTS = {
	finder = true,
	error = true,
	user = true,
	logout = true,
}

local cached_homepage = nil
local cached_search_url = nil
local cached_build_id = nil

local function get_homepage()
	if cached_homepage then
		return cached_homepage
	end

	logger:info("Fetching HLTB homepage...")
	local response = M._http.get(M.BASE_URL, {
		headers = { ["User-Agent"] = M.USER_AGENT, ["referer"] = M.REFERER_HEADER },
		timeout = M.TIMEOUT,
	})

	if not response or response.status ~= 200 then
		logger:info("Failed to fetch HLTB homepage")
		return nil
	end

	cached_homepage = response.body
	return cached_homepage
end

-- Scans every NextJS chunk script linked from the homepage for a POST
-- fetch() call to /api/<name>, skipping known non-search endpoints.
local function extract_search_url()
	logger:info("Extracting search endpoint from HLTB website...")

	local homepage = get_homepage()
	if not homepage then
		return nil
	end

	local headers = { ["User-Agent"] = M.USER_AGENT, ["referer"] = M.REFERER_HEADER }

	local script_urls = {}
	for src in homepage:gmatch('["\'](/_next/static/chunks/[^"\']+%.js)["\']') do
		table.insert(script_urls, src)
	end
	logger:info("Found " .. #script_urls .. " chunk script(s)")

	local endpoints_found = {}
	for _, script_src in ipairs(script_urls) do
		local script_url = M.BASE_URL .. script_src:sub(2)
		local script_resp = M._http.get(script_url, { headers = headers, timeout = M.TIMEOUT })

		if script_resp and script_resp.status == 200 and script_resp.body then
			local content = script_resp.body
			for api_path in content:gmatch('["\'](/api/[a-zA-Z0-9_]+)["\']') do
				local endpoint = api_path:match("/api/([a-zA-Z0-9_]+)")
				if endpoint and not endpoints_found[endpoint] then
					endpoints_found[endpoint] = true
					if not SKIP_ENDPOINTS[endpoint] then
						local pattern = 'fetch%s*%(%s*["\']'
							.. api_path:gsub("/", "%%/")
							.. '["\']%s*,%s*{[^}]-method%s*:%s*["\']POST["\']'
						if content:find(pattern) then
							logger:info("Found search endpoint: /api/" .. endpoint)
							return "api/" .. endpoint
						end
					end
				end
			end
		end
	end

	logger:info("No valid search endpoint found in " .. #script_urls .. " script(s)")
	return nil
end

--- Returns the full search URL, discovering and caching it on first call.
--- Returns nil if discovery fails -- callers should surface this as an
--- error rather than silently proceeding with a stale/guessed endpoint.
function M.get_search_url()
	if cached_search_url then
		return cached_search_url
	end

	local search_url = extract_search_url()
	if not search_url then
		return nil
	end

	cached_search_url = M.BASE_URL .. search_url
	logger:info("Search URL: " .. cached_search_url)
	return cached_search_url
end

--- Auth token init URL, derived from the search URL. Assumes the init
--- endpoint always lives at {search_url}/init, which has held true across
--- every observed rotation so far.
function M.get_init_url()
	local search_url = M.get_search_url()
	if not search_url then
		return nil
	end
	return search_url .. "/init"
end

--- Extracts the current NextJS build ID from the homepage.
function M.get_build_id()
	if cached_build_id then
		return cached_build_id
	end

	local homepage = get_homepage()
	if not homepage then
		return nil
	end

	local build_id = homepage:match("/_next/static/([^/]+)/_ssgManifest%.js")
		or homepage:match("/_next/static/([^/]+)/_buildManifest%.js")

	if build_id then
		cached_build_id = build_id
		return build_id
	end

	logger:info("Could not find NextJS build ID")
	return nil
end

--- Clears every cached discovery result, forcing a fresh scrape on the
--- next call. Callers invoke this after a failed request in case HLTB
--- rotated the endpoint mid-session.
function M.invalidate()
	cached_homepage = nil
	cached_search_url = nil
	cached_build_id = nil
end

return M
