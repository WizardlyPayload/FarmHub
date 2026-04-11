--[[
  HttpClient.lua — HTTP helpers for the dedicated-server bridge (direct HTTPS to the SaaS API).

  FS25 notes (from sdk/debugger/gameSource.zip):
  - Shipped Lua under dataS/scripts/ does not define Internet.lua / createHTTPRequest in text form;
    HTTP is provided by the engine on some builds (often dedicated server), not always on the game client.
  - POST (postJson) / GET (poll) use engine HTTP if present, else curl. Linux DS: temp JSON with io.open(..., "w") only (not "wb"); JSON under $TMPDIR, /tmp, or ~/.cache; no cmd/.bat read path.

  Curl output uses -w "\\n%{http_code}"; we parse the last line as status (handles CRLF from Windows curl).

  Prefer engine createHTTPRequest when present; curl runs synchronously (short calls only).
  If io.popen is unavailable (FS25 client), on Windows we fall back to cmd.exe + .bat + os.execute (reads curl .out).
--]]

AIFarmHttp = {}
AIFarmHttp._warnedNoHttp = false

--- Call every frame from your update() if `Internet` exists (some builds require it).
function AIFarmHttp.update(dt)
    if Internet ~= nil and Internet.update ~= nil then
        local ok, err = pcall(function()
            Internet:update(dt)
        end)
        if not ok and not AIFarmHttp._warnedNoHttp then
            AIFarmHttp._warnedNoHttp = true
        end
    end
end

local function notify(cb, httpCode, body, err)
    if cb ~= nil then
        cb(httpCode, body, err)
    end
end

--- FS25 client Lua often leaves `os` nil (e.g. inside network `packetReceived`); never index `os` blindly.
local function getenvSafe(key)
    if os ~= nil and type(os.getenv) == "function" then
        return os.getenv(key)
    end
    return nil
end

local function removeFileSafe(path)
    if os ~= nil and type(os.remove) == "function" then
        pcall(function()
            os.remove(path)
        end)
    end
end

--- True on typical Windows (batch + cmd fallback); false on Linux DS / G-Portal.
local function isWindowsHost()
    local w = getenvSafe("WINDIR")
    local o = getenvSafe("OS")
    return (w ~= nil and w ~= "") or o == "Windows_NT"
end

--- Temp directory: avoid "." + ".\\" on Linux (invalid-case / mixed-separator loads in game dir).
local function getTempDirNormalized()
    local t = getenvSafe("TEMP") or getenvSafe("TMP") or getenvSafe("TMPDIR")
    if t ~= nil and t ~= "" then
        return (string.gsub(t, "\\", "/"))
    end
    if isWindowsHost() then
        return "."
    end
    return "/tmp"
end

local function joinPath(dir, name)
    dir = string.gsub(dir or "", "[/\\]+$", "")
    if dir == "" then
        dir = "."
    end
    return dir .. "/" .. name
end

--- FS25 Linux dedicated often allows only "w" for io.open (rejects "wb") — match that first.
local function ioOpenForWrite(path)
    if path == nil or path == "" or io == nil or type(io.open) ~= "function" then
        return nil
    end
    local f = io.open(path, "w")
    if f == nil then
        f = io.open(path, "wb")
    end
    return f
end

--- Resolve engine createHTTPRequest if exposed as a method on Internet (some builds).
local function getCreateHTTPRequest()
    if type(createHTTPRequest) == "function" then
        return createHTTPRequest
    end
    if Internet ~= nil then
        if type(Internet.createHTTPRequest) == "function" then
            return function(...)
                return Internet:createHTTPRequest(...)
            end
        end
        if type(Internet.createHttpRequest) == "function" then
            return function(...)
                return Internet:createHttpRequest(...)
            end
        end
    end
    return nil
end

--- Split curl body + trailing http code (last line). Strips CR for Windows CRLF.
local function parseCurlHttpOutput(all)
    if all == nil or all == "" then
        return nil, nil
    end
    all = string.gsub(all, "\r", "")
    local lastNl = 0
    for i = 1, #all do
        if string.byte(all, i) == 10 then
            lastNl = i
        end
    end
    if lastNl == 0 then
        return nil, nil
    end
    local codeLine = string.sub(all, lastNl + 1)
    local code = tonumber(codeLine)
    if code == nil or code < 100 or code > 599 then
        return nil, nil
    end
    local body = string.sub(all, 1, lastNl - 1)
    return body, code
end

--- Run curl via io.popen; retry with System32 path if PATH does not include curl (common in embedded Lua).
local function runCurlRead(cmd)
    local function runOne(c)
        local ok, out = pcall(function()
            local h = io.popen(c, "r")
            if h == nil then
                return nil
            end
            local o = h:read("*a")
            h:close()
            return o
        end)
        if ok and out ~= nil then
            return true, out
        end
        return false, nil
    end
    local ok, out = runOne(cmd)
    if ok then
        return true, out
    end
    if string.sub(cmd, 1, 4) == "curl" then
        local win = '"C:\\Windows\\System32\\curl.exe"' .. string.sub(cmd, 5)
        ok, out = runOne(win)
        if ok then
            return true, out
        end
    end
    return false, nil
end

--- io.popen is often nil/disabled in FS25 client; run the same curl line via cmd + .bat + redirect file.
local function escapePercentForBatch(s)
    return (string.gsub(s, "%%", "%%%%"))
end

local function runCurlReadViaBatch(cmd)
    -- Linux DS: io.open often allows only "w"; reading .out after cmd breaks. Skip batch path.
    if not isWindowsHost() then
        return false, nil
    end
    if os == nil or type(os.execute) ~= "function" then
        return false, nil
    end
    local dir = getenvSafe("TEMP") or getenvSafe("TMP") or "."
    local id = tostring(math.random(100000, 999999))
    local outpath = joinPath(dir, "aifarm_http_" .. id .. ".out")
    local batpath = joinPath(dir, "aifarm_http_" .. id .. ".bat")
    local batCmd = escapePercentForBatch(cmd)
    local fh = ioOpenForWrite(batpath)
    if fh == nil then
        return false, nil
    end
    fh:write("@echo off\r\n")
    fh:write(batCmd .. " > \"" .. string.gsub(outpath, "/", "\\") .. "\" 2>&1\r\n")
    fh:close()
    local exe = 'cmd /c "' .. batpath .. '"'
    pcall(function()
        os.execute(exe)
    end)
    local rf = io.open(outpath, "rb")
    if rf == nil then
        removeFileSafe(batpath)
        return false, nil
    end
    local all = rf:read("*a")
    rf:close()
    removeFileSafe(batpath)
    removeFileSafe(outpath)
    if all == nil or all == "" then
        return false, nil
    end
    return true, all
end

--- Try popen first, then batch+os.execute (FS25 client).
local function runCurlReadAny(cmd)
    local ok, out = runCurlRead(cmd)
    if ok and out ~= nil then
        return true, out
    end
    return runCurlReadViaBatch(cmd)
end

--- Temp file for curl --data-binary @path (must not live under game/ — Linux DS loads paths there as assets).
local function makeTempJsonPathForCurl()
    if not isWindowsHost() then
        local td = getenvSafe("TMPDIR") or "/tmp"
        return joinPath(string.gsub(td, "\\", "/"), "aifarm_mgr_" .. tostring(math.random(100000, 999999)) .. ".json")
    end
    if os ~= nil and type(os.tmpname) == "function" then
        local base = os.tmpname()
        if base ~= nil and base ~= "" then
            return (base .. ".json")
        end
    end
    return joinPath(
        getTempDirNormalized(),
        "aifarm_mgr_" .. tostring(math.random(100000, 999999)) .. ".json"
    )
end

--- Write POST body to a file curl can read; returns path or nil (tries several dirs on Linux).
local function writeCurlPostBodyFile(jsonBody)
    local id = "aifarm_mgr_" .. tostring(math.random(100000, 999999)) .. ".json"
    local body = jsonBody or ""
    if isWindowsHost() then
        local p = makeTempJsonPathForCurl()
        local f = ioOpenForWrite(p)
        if f == nil then
            return nil
        end
        f:write(body)
        f:close()
        return p
    end
    local dirs = {}
    local td = getenvSafe("TMPDIR")
    if td ~= nil and td ~= "" then
        table.insert(dirs, string.gsub(td, "\\", "/"))
    end
    table.insert(dirs, "/tmp")
    local home = getenvSafe("HOME")
    if home ~= nil and home ~= "" then
        table.insert(dirs, joinPath(string.gsub(home, "\\", "/"), ".cache"))
    end
    for _, d in ipairs(dirs) do
        local p = joinPath(d, id)
        local f = ioOpenForWrite(p)
        if f ~= nil then
            f:write(body)
            f:close()
            return p
        end
    end
    return nil
end

--- Last-resort POST via curl (body via temp file outside game folder when possible).
local function postJsonViaCurl(url, jsonBody, callback)
    local tmpWin = writeCurlPostBodyFile(jsonBody)
    if tmpWin == nil then
        notify(callback, -1, nil, "curl_tmp_open_failed")
        return
    end
    local tmpCurl = string.gsub(tmpWin, "\\", "/")
    local quotedUrl = '"' .. string.gsub(tostring(url), '"', '\\"') .. '"'
    local cmd = string.format(
        'curl -s -S -X POST -H "Content-Type: application/json" --data-binary "@%s" -w "\\n%%{http_code}" %s',
        tmpCurl,
        quotedUrl
    )
    local okPop, all = runCurlReadAny(cmd)
    removeFileSafe(tmpWin)
    if not okPop or all == nil then
        notify(callback, -1, nil, "curl_transport_failed")
        return
    end
    local body, code = parseCurlHttpOutput(all)
    if code == nil then
        notify(callback, -1, all, "curl_parse_failed")
        return
    end
    notify(callback, code, body, nil)
end

--- GET via curl (same parser as POST).
local function getViaCurl(url, callback)
    local quotedUrl = '"' .. string.gsub(tostring(url), '"', '\\"') .. '"'
    local cmd = "curl -s -S -w \"\\n%{http_code}\" " .. quotedUrl
    local okPop, all = runCurlReadAny(cmd)
    if not okPop or all == nil then
        notify(callback, -1, nil, "curl_transport_failed")
        return
    end
    local body, code = parseCurlHttpOutput(all)
    if code == nil then
        notify(callback, -1, all, "curl_parse_failed")
        return
    end
    notify(callback, code, body, nil)
end

--- POST JSON body; callback(httpCode, responseText, errorString)
function AIFarmHttp.postJson(url, jsonBody, callback)
    local createHTTP = getCreateHTTPRequest()
    -- Pattern A: global createHTTPRequest (classic FS scripting helper)
    if createHTTP ~= nil then
        local target = {
            onHttpResponse = function(self, status, body, _, err)
                notify(callback, status or -1, body, err)
            end,
        }
        local ok, reqOrErr = pcall(function()
            return createHTTP(url, "POST", jsonBody, "onHttpResponse", target, false)
        end)
        if ok and reqOrErr ~= nil then
            local req = reqOrErr
            if req.setHeader ~= nil then
                pcall(function() req:setHeader("Content-Type", "application/json") end)
            elseif req.addHeader ~= nil then
                pcall(function() req:addHeader("Content-Type", "application/json") end)
            end
            if Internet ~= nil and Internet.addRequest ~= nil then
                pcall(function() Internet:addRequest(req) end)
                return
            elseif req.sendAsync ~= nil then
                pcall(function() req:sendAsync() end)
                return
            elseif req.send ~= nil then
                pcall(function() req:send(false) end)
                return
            end
            -- Engine gave a request object but no known send path — try curl.
        end
    end

    -- Pattern B: HTTPRequest table (some builds)
    if HTTPRequest ~= nil and HTTPRequest.createPost ~= nil then
        local ok, req = pcall(function()
            return HTTPRequest.createPost(url, jsonBody, "application/json")
        end)
        if ok and req ~= nil and req.sendAsync ~= nil then
            pcall(function()
                req:sendAsync(function(status, body)
                    notify(callback, status, body, nil)
                end)
            end)
            return
        end
    end

    postJsonViaCurl(url, jsonBody, callback)
end

--- GET url; callback(httpCode, responseText, errorString)
function AIFarmHttp.get(url, callback)
    local createHTTP = getCreateHTTPRequest()
    if createHTTP ~= nil then
        local target = {
            onHttpResponse = function(self, status, body, _, err)
                notify(callback, status or -1, body, err)
            end,
        }
        local ok, reqOrErr = pcall(function()
            return createHTTP(url, "GET", "", "onHttpResponse", target, false)
        end)
        if ok and reqOrErr ~= nil then
            local req = reqOrErr
            if Internet ~= nil and Internet.addRequest ~= nil then
                pcall(function() Internet:addRequest(req) end)
                return
            elseif req.sendAsync ~= nil then
                pcall(function() req:sendAsync() end)
                return
            elseif req.send ~= nil then
                pcall(function() req:send(false) end)
                return
            end
        end
    end

    getViaCurl(url, callback)
end
