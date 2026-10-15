-- FS25 FarmDashboard | FarmDashboardReplicaPairing.lua
-- Confirm-once multiplayer pairing for the client replica.
--
-- First join to a server: nothing is stored. The client writes one small pending record (fixed path, bounded
-- fields, checksum) from the live server connection; the desktop app asks "Link this server?". Approval publishes
-- replicaSources.xml (desktop owned) with this session's token; the client rebinds the live connection without a
-- restart and registers a random 32-byte key with the server over that approved connection.
--
-- Later joins (the join token changes): the client sends a fresh nonce plus the key IDs it holds; the server
-- answers HMAC-SHA256(key, "FDPAIR1|renew|" .. nonce .. "|" .. careerId). Only a valid proof for a key this PC
-- registered renews the link. Name, map, slot or career ID alone never do. Failure falls back to the prompt.
--
-- Keys and tokens never go to the log. Career ID is a continuity hint and is pinned per link; the replica folder
-- name is always the desktop-owned source ID, never a value taken from the stream.

FarmDashboardReplicaPairing = {}
local P = FarmDashboardReplicaPairing

P.PROTOCOL = "FDPAIR1"
P.PENDING_FILE = "replicaPending.xml"
P.TRUST_FILE = "replicaTrust.xml"
P.SERVER_FILE = "replicaClients.xml"
P.RECOVERY_REQUEST_FILE = "replicaRecoveryRequest.xml"
P.RECOVERY_PROOF_FILE = "replicaRecoveryProof.xml"
P.MAX_TRUST = 16
P.MAX_SERVER_KEYS = 64
-- Every retained link must be offered on each join, or links past the cap would prompt again.
P.MAX_CHALLENGE_IDS = P.MAX_TRUST
P.MAX_ID_LIST_BYTES = P.MAX_CHALLENGE_IDS * 17 - 1
P.MAX_LABEL_BYTES = 80
P.PROOF_TIMEOUT_MS = 15000
P.APPROVAL_POLL_MS = 2000
P.SERVER_RATE_MS = 3000

P._client = nil
P._serverRate = setmetatable({}, { __mode = "k" })

--------------------------------------------------------------------------------------------------------------------
-- SHA-256 / HMAC-SHA256 in plain Lua 5.1 arithmetic (no bit library). Inputs are short; one HMAC per join.
--------------------------------------------------------------------------------------------------------------------

-- Float arithmetic throughout: some Lua VMs use 32-bit integers for literals and products.
local MOD32 = 4294967296.0
local XOR4, AND4 = {}, {}
for a = 0, 15 do
    XOR4[a], AND4[a] = {}, {}
    for b = 0, 15 do
        local x, y, bit, rx, ra = a, b, 1, 0, 0
        for _ = 1, 4 do
            local xa, yb = x % 2, y % 2
            if xa ~= yb then rx = rx + bit end
            if xa == 1 and yb == 1 then ra = ra + bit end
            x, y, bit = (x - xa) / 2, (y - yb) / 2, bit * 2
        end
        XOR4[a][b], AND4[a][b] = rx, ra
    end
end

local function bitop(t, a, b)
    local r, m = 0, 1
    for _ = 1, 8 do
        local x, y = a % 16, b % 16
        r = r + t[x][y] * m
        a, b, m = (a - x) / 16, (b - y) / 16, m * 16
    end
    return r
end

local function bxor(a, b) return bitop(XOR4, a, b) end
local function band(a, b) return bitop(AND4, a, b) end
local function bnot(a) return MOD32 - 1 - a end
local function rshift(a, n) local p = 2 ^ n; return (a - a % p) / p end
local function rrot(a, n)
    local p = 2 ^ n
    local low = a % p
    return (a - low) / p + low * 2 ^ (32 - n)
end

local K256 = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

for i = 1, #K256 do K256[i] = K256[i] % MOD32 end

local function u32bytes(v)
    local b4 = v % 256; v = (v - b4) / 256
    local b3 = v % 256; v = (v - b3) / 256
    local b2 = v % 256; v = (v - b2) / 256
    return string.char(v % 256, b2, b3, b4)
end

function P.sha256(message)
    local H = { 1779033703.0, 3144134277.0, 1013904242.0, 2773480762.0, 1359893119.0, 2600822924.0, 528734635.0, 1541459225.0 }
    local bits = #message * 8
    local hi = (bits - bits % MOD32) / MOD32
    local msg = message .. "\128" .. string.rep("\0", (55 - #message) % 64) .. u32bytes(hi) .. u32bytes(bits % MOD32)
    local w = {}
    for chunk = 1, #msg, 64 do
        for i = 0, 15 do
            local b1, b2, b3, b4 = string.byte(msg, chunk + i * 4, chunk + i * 4 + 3)
            w[i] = b1 * 16777216.0 + b2 * 65536 + b3 * 256 + b4
        end
        for i = 16, 63 do
            local v15, v2 = w[i - 15], w[i - 2]
            local s0 = bxor(bxor(rrot(v15, 7), rrot(v15, 18)), rshift(v15, 3))
            local s1 = bxor(bxor(rrot(v2, 17), rrot(v2, 19)), rshift(v2, 10))
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) % MOD32
        end
        local a, b, c, d, e, f, g, h = H[1], H[2], H[3], H[4], H[5], H[6], H[7], H[8]
        for i = 0, 63 do
            local S1 = bxor(bxor(rrot(e, 6), rrot(e, 11)), rrot(e, 25))
            local ch = bxor(band(e, f), band(bnot(e), g))
            local t1 = (h + S1 + ch + K256[i + 1] + w[i]) % MOD32
            local S0 = bxor(bxor(rrot(a, 2), rrot(a, 13)), rrot(a, 22))
            local maj = bxor(bxor(band(a, b), band(a, c)), band(b, c))
            local t2 = (S0 + maj) % MOD32
            h, g, f, e, d, c, b, a = g, f, e, (d + t1) % MOD32, c, b, a, (t1 + t2) % MOD32
        end
        H[1] = (H[1] + a) % MOD32; H[2] = (H[2] + b) % MOD32; H[3] = (H[3] + c) % MOD32; H[4] = (H[4] + d) % MOD32
        H[5] = (H[5] + e) % MOD32; H[6] = (H[6] + f) % MOD32; H[7] = (H[7] + g) % MOD32; H[8] = (H[8] + h) % MOD32
    end
    local out = {}
    for i = 1, 8 do out[i] = u32bytes(H[i]) end
    return table.concat(out)
end

function P.toHex(bin)
    return (string.gsub(bin, ".", function(ch) return string.format("%02x", string.byte(ch)) end))
end

local function fromHex(hex)
    return (string.gsub(hex, "%x%x", function(pair) return string.char(tonumber(pair, 16)) end))
end

function P.hmacSha256Hex(keyHex, message)
    local key = fromHex(keyHex)
    if #key > 64 then key = P.sha256(key) end
    key = key .. string.rep("\0", 64 - #key)
    local ipad, opad = {}, {}
    for i = 1, 64 do
        local k = string.byte(key, i)
        ipad[i] = string.char(bxor(k, 0x36))
        opad[i] = string.char(bxor(k, 0x5c))
    end
    return P.toHex(P.sha256(table.concat(opad) .. P.sha256(table.concat(ipad) .. message)))
end

--------------------------------------------------------------------------------------------------------------------
-- Validation and helpers
--------------------------------------------------------------------------------------------------------------------

local function validId(value)
    if type(value) ~= "string" or value == "" or #value > 64 or string.find(value, "..", 1, true) then return false end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

local function validKey(value)
    if type(value) ~= "string" or value == "" or #value > 128 or string.find(value, "..", 1, true) then return false end
    return string.match(value, "^[A-Za-z0-9_%-]+$") ~= nil
end

local function hexOf(value, length)
    return type(value) == "string" and #value == length and string.match(value, "^[0-9a-f]+$") ~= nil
end
P.hexOf = hexOf

local function info(fmt, ...)
    if Logging ~= nil and type(Logging.info) == "function" then Logging.info(fmt, ...) end
end

-- Engine globals are inherited through the mod environment, so they are read with plain indexing, not rawget.
local function nowMs()
    local t = _G.g_time
    if type(t) == "number" then return t end
    local mission = _G.g_currentMission
    return type(mission) == "table" and tonumber(mission.time) or 0
end

local entropySerial = 0
local function randomHex(bytes)
    entropySerial = entropySerial + 1
    local parts = { P.PROTOCOL, tostring(entropySerial), tostring({}), tostring(nowMs()) }
    for _, name in ipairs({ "getDate", "getTime", "getTimeSec" }) do
        local fn = _G[name]
        if type(fn) == "function" then
            local ok, value = pcall(fn, "%Y%m%d%H%M%S")
            if ok and value ~= nil then parts[#parts + 1] = tostring(value) end
        end
    end
    for _ = 1, 8 do parts[#parts + 1] = tostring(math.random(0, 2147483646)) end
    local seed = table.concat(parts, "|")
    local out = ""
    while #out < bytes * 2 do out = out .. P.toHex(P.sha256(seed .. "|" .. #out)) end
    return string.sub(out, 1, bytes * 2)
end
P._randomHex = randomHex

local function adler32(text)
    local a, b = 1, 0
    for i = 1, #text do
        a = (a + string.byte(text, i)) % 65521
        b = (b + a) % 65521
    end
    return b * 65536.0 + a
end

--- Display label: printable UTF-8, no XML-special characters, cut on a character boundary.
local function label(value)
    if type(value) ~= "string" then return "" end
    local out, size = {}, 0
    for ch in string.gmatch(value, "[%z\1-\127\194-\244][\128-\191]*") do
        local byte = string.byte(ch)
        if byte >= 32 and byte ~= 127 and not string.find(ch, "[\"<>&]") then
            if size + #ch > P.MAX_LABEL_BYTES then break end
            out[#out + 1] = ch
            size = size + #ch
        end
    end
    return (string.gsub(table.concat(out), "^%s+", ""))
end
P._label = label

local function dashboardRoot()
    if type(getUserProfileAppPath) ~= "function" then return nil end
    return getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/"
end

local function ensureRoot(root)
    if type(createFolder) == "function" then
        pcall(createFolder, string.sub(root, 1, -2))
    end
end

local function readEntries(path, rootName, rowName, fields, maximum)
    local rows = {}
    if type(fileExists) ~= "function" or type(loadXMLFile) ~= "function" or not fileExists(path) then return rows end
    local okLoad, handle = pcall(loadXMLFile, "FarmDashPairing", path)
    if not okLoad or handle == nil or handle == 0 then return rows end
    pcall(function()
        for i = 0, maximum - 1 do
            local base = string.format("%s.%s(%d)", rootName, rowName, i)
            local row = {}
            for _, field in ipairs(fields) do row[field] = getXMLString(handle, base .. "#" .. field) end
            if row[fields[1]] == nil then break end
            rows[#rows + 1] = row
        end
    end)
    pcall(delete, handle)
    return rows
end

local function writeEntries(path, rootName, rowName, fields, rows)
    if type(createXMLFile) ~= "function" or type(saveXMLFile) ~= "function" then return false end
    local okCreate, handle = pcall(createXMLFile, "FarmDashPairing", path, rootName)
    if not okCreate or handle == nil or handle == 0 then return false end
    local saved = false
    pcall(function()
        for i, row in ipairs(rows) do
            local base = string.format("%s.%s(%d)", rootName, rowName, i - 1)
            for _, field in ipairs(fields) do setXMLString(handle, base .. "#" .. field, row[field]) end
        end
        saved = saveXMLFile(handle) == true
    end)
    pcall(delete, handle)
    return saved
end

local function sendTo(connection, event)
    if connection == nil or event == nil or type(connection.sendEvent) ~= "function" then return false end
    return pcall(function() connection:sendEvent(event) end)
end

local function newEvent(kind, a, b, c, d)
    local cls = rawget(_G, "FarmDashboardPairingEvent")
    if cls == nil or type(cls.new) ~= "function" then return nil end
    return cls.new(kind, a, b, c, d)
end

--------------------------------------------------------------------------------------------------------------------
-- Client: pending record (read by the desktop app), trust file (local keys for linked servers)
--------------------------------------------------------------------------------------------------------------------

local TRUST_FIELDS = { "sourceId", "careerId", "keyId", "key" }
local PENDING_ORDER = { "schema", "pendingId", "serverKey", "careerId", "sourceSlot", "mapTitle", "serverName", "check" }

function P.pendingCheck(fields)
    local text = table.concat({
        fields.schema, fields.pendingId, fields.serverKey, fields.careerId, fields.sourceSlot, fields.mapTitle, fields.serverName,
    }, "|")
    return string.format("%.0f", adler32(text))
end

function P:loadTrust()
    local root = dashboardRoot()
    if root == nil then return {} end
    local rows = readEntries(root .. P.TRUST_FILE, "farmDashboardReplicaTrust", "link", TRUST_FIELDS, P.MAX_TRUST)
    local valid = {}
    for _, row in ipairs(rows) do
        if validId(row.sourceId) and validId(row.careerId) and hexOf(row.keyId, 16) and hexOf(row.key, 64) then
            valid[#valid + 1] = row
        end
    end
    return valid
end

-- Source IDs still published in replicaSources.xml, or nil when the file cannot be read (keep everything then).
local function publishedSourceIds()
    local config = rawget(_G, "FarmDashboardReplicaConfig")
    if config == nil or type(config.load) ~= "function" then return nil end
    local ok, loaded = pcall(function() return config:load() end)
    if not ok or loaded ~= true or type(config._sources) ~= "table" then return nil end
    local ids = {}
    for _, source in ipairs(config._sources) do ids[source.sourceId] = true end
    return ids
end

--- Newest (or most recently renewed) first. Links removed in the desktop app are dropped before the
--- MAX_TRUST cap applies, so a still-published link is only evicted when more than MAX_TRUST exist.
function P:saveTrustEntry(entry)
    local root = dashboardRoot()
    if root == nil then return false end
    local published = publishedSourceIds()
    local rows = { entry }
    for _, row in ipairs(self:loadTrust()) do
        local live = published == nil or published[row.sourceId] == true
        if live and row.sourceId ~= entry.sourceId and row.keyId ~= entry.keyId and #rows < P.MAX_TRUST then
            rows[#rows + 1] = row
        end
    end
    ensureRoot(root)
    return writeEntries(root .. P.TRUST_FILE, "farmDashboardReplicaTrust", "link", TRUST_FIELDS, rows)
end

function P:deletePending()
    local root = dashboardRoot()
    if root == nil then return end
    local path = root .. P.PENDING_FILE
    if type(fileExists) == "function" and fileExists(path) and type(deleteFile) == "function" then
        pcall(deleteFile, path)
    end
end

function P:writePending(client, meta)
    local root = dashboardRoot()
    local serverKey = self:sessionKey()
    if root == nil or serverKey == nil then return false end
    local mission = _G.g_currentMission
    local missionInfo = type(mission) == "table" and mission.missionInfo or nil
    local dynamic = type(mission) == "table" and mission.missionDynamicInfo or nil
    local fields = {
        schema = "1",
        pendingId = randomHex(8),
        serverKey = serverKey,
        careerId = meta.careerId,
        sourceSlot = meta.sourceSlot,
        mapTitle = label(type(missionInfo) == "table" and missionInfo.mapTitle or ""),
        serverName = label(type(dynamic) == "table" and dynamic.serverName or ""),
    }
    fields.check = P.pendingCheck(fields)
    ensureRoot(root)
    if type(createXMLFile) ~= "function" or type(saveXMLFile) ~= "function" then return false end
    local okCreate, handle = pcall(createXMLFile, "FarmDashPending", root .. P.PENDING_FILE, "farmDashboardPendingSession")
    if not okCreate or handle == nil or handle == 0 then return false end
    local saved = false
    pcall(function()
        for _, name in ipairs(PENDING_ORDER) do setXMLString(handle, "farmDashboardPendingSession#" .. name, fields[name]) end
        saved = saveXMLFile(handle) == true
    end)
    pcall(delete, handle)
    if saved then
        client.pendingCareerId = meta.careerId
        client.pendingWritten = true
    end
    return saved
end

function P:sessionKey()
    local config = rawget(_G, "FarmDashboardReplicaConfig")
    if config == nil or type(config.sessionKey) ~= "function" then return nil end
    local key = config:sessionKey()
    return validKey(key) and key or nil
end

-- The desktop challenge is only answered after this live connection renewed with the server's
-- registered HMAC key. A retained XML row or an explicit token match is not enough.
function P:answerRecoveryRequest(client)
    if client == nil or client.state ~= "bound" or client.verifiedKeyId == nil or
        client.connection == nil or not validKey(client.sessionKey) then return false end
    local config = rawget(_G, "FarmDashboardReplicaConfig")
    local binding = config and type(config.bindingForConnection) == "function"
        and config:bindingForConnection(client.connection) or nil
    if type(binding) ~= "table" or binding.renewed ~= true or
        binding.sourceId ~= client.sourceId or binding.careerId ~= client.verifiedCareerId or
        not validId(binding.remoteSlot) then return false end
    local root = dashboardRoot()
    if root == nil or type(fileExists) ~= "function" or type(loadXMLFile) ~= "function" or
        not fileExists(root .. P.RECOVERY_REQUEST_FILE) then return false end
    local okLoad, handle = pcall(loadXMLFile, "FarmDashRecoveryRequest", root .. P.RECOVERY_REQUEST_FILE)
    if not okLoad or handle == nil or handle == 0 then return false end
    local request = {}
    pcall(function()
        for _, field in ipairs({ "schema", "nonce", "sourceId", "careerId", "remoteSlot", "keyId" }) do
            request[field] = getXMLString(handle, "farmDashboardRecoveryRequest#" .. field)
        end
    end)
    pcall(delete, handle)
    if request.schema ~= "1" or not hexOf(request.nonce, 32) or
        request.nonce == client.lastRecoveryNonce or request.sourceId ~= binding.sourceId or
        request.careerId ~= binding.careerId or request.remoteSlot ~= binding.remoteSlot or
        request.keyId ~= client.verifiedKeyId then return false end
    local entry = nil
    for _, row in ipairs(self:loadTrust()) do
        if row.sourceId == request.sourceId and row.careerId == request.careerId and
            row.keyId == request.keyId then entry = row break end
    end
    if entry == nil then return false end
    local message = table.concat({ P.PROTOCOL, "recover", request.nonce, request.sourceId,
        request.careerId, request.remoteSlot, client.sessionKey, request.keyId }, "|")
    local proof = P.hmacSha256Hex(entry.key, message)
    if type(createXMLFile) ~= "function" or type(saveXMLFile) ~= "function" then return false end
    local okCreate, output = pcall(createXMLFile, "FarmDashRecoveryProof", root .. P.RECOVERY_PROOF_FILE,
        "farmDashboardRecoveryProof")
    if not okCreate or output == nil or output == 0 then return false end
    local saved = false
    pcall(function()
        local fields = { nonce = request.nonce, sourceId = request.sourceId, careerId = request.careerId,
            remoteSlot = request.remoteSlot, keyId = request.keyId, sessionKey = client.sessionKey, proof = proof }
        for name, value in pairs(fields) do setXMLString(output, "farmDashboardRecoveryProof#" .. name, value) end
        saved = saveXMLFile(output) == true
    end)
    pcall(delete, output)
    if saved then client.lastRecoveryNonce = request.nonce end
    return saved
end

--------------------------------------------------------------------------------------------------------------------
-- Client lifecycle
--------------------------------------------------------------------------------------------------------------------

function P:onJoin(connection)
    self:deletePending()
    self._client = { connection = connection, state = "idle" }
    local config = rawget(_G, "FarmDashboardReplicaConfig")
    local engineKey = config and type(config.sessionKey) == "function" and config:sessionKey() or nil
    -- Keep one value for this connection even if the engine publishes its token later.
    -- This is an approval correlation token, not the saved server authentication key.
    self._client.sessionKey = validKey(engineKey) and engineKey or randomHex(32)
end

function P:beginUnpaired(connection)
    local client = self._client
    if client == nil or client.connection ~= connection then
        client = { connection = connection }
        self._client = client
    end
    local trust = self:loadTrust()
    if #trust == 0 then
        client.state = "unpaired"
        return
    end
    local ids = {}
    for i = 1, math.min(#trust, P.MAX_CHALLENGE_IDS) do ids[i] = trust[i].keyId end
    client.nonce = randomHex(16)
    client.state = "verifying"
    client.deadline = nowMs() + P.PROOF_TIMEOUT_MS
    if not sendTo(connection, newEvent(1, client.nonce, table.concat(ids, ","))) then
        client.state = "unpaired"
    end
end

function P:noteUnboundHeader(connection, meta)
    local client = self._client
    if client == nil or client.connection ~= connection or type(meta) ~= "table" then return end
    if client.state ~= "unpaired" and client.state ~= "pending" then return end
    if not validId(meta.careerId) or not validId(meta.sourceSlot) then return end
    if client.state == "pending" and client.pendingCareerId == meta.careerId then return end
    if self:sessionKey() == nil then
        if not client.tokenLogged then
            client.tokenLogged = true
            info("[FarmDash] export mirror: this join has no usable session token, so Farm Dashboard cannot offer Link this server; nothing is stored")
        end
        return
    end
    if self:writePending(client, meta) then
        client.state = "pending"
        client.pollAt = nowMs() + P.APPROVAL_POLL_MS
        if not client.promptLogged then
            client.promptLogged = true
            info("[FarmDash] export mirror: this server is not linked on this PC; nothing is stored until you choose Link this server in Farm Dashboard")
        end
    end
end

function P:update(_dt)
    local client = self._client
    if client == nil then return end
    local now = nowMs()
    if client.state == "verifying" and now >= (client.deadline or 0) then
        client.state = "unpaired"
        info("[FarmDash] export mirror: linked-server check did not answer; Farm Dashboard will ask before storing")
    elseif client.state == "pending" and now >= (client.pollAt or 0) then
        client.pollAt = now + P.APPROVAL_POLL_MS
        local config = rawget(_G, "FarmDashboardReplicaConfig")
        if config and type(config.activateApproved) == "function" then
            pcall(function() config:activateApproved(client.connection, client.pendingCareerId) end)
        end
    end
    if client.state == "bound" and client.verifiedKeyId ~= nil and now >= (client.recoveryPollAt or 0) then
        client.recoveryPollAt = now + P.APPROVAL_POLL_MS
        self:answerRecoveryRequest(client)
    end
end

function P:onExplicitBound(connection, sourceId, careerId)
    local client = self._client
    if client == nil or client.connection ~= connection then
        client = { connection = connection }
        self._client = client
    end
    client.state = "bound"
    client.sourceId = sourceId
    self:deletePending()
    info("[FarmDash] export mirror: linked server stored under replicas/%s/", sourceId)
    for _, row in ipairs(self:loadTrust()) do
        if row.sourceId == sourceId then return end
    end
    client.register = { sourceId = sourceId, careerId = careerId, keyId = randomHex(8), key = randomHex(32), nonce = randomHex(16) }
    sendTo(connection, newEvent(2, client.register.nonce, client.register.keyId, client.register.key))
end

function P:onProof(connection, kind, keyId, careerId, proof)
    local client = self._client
    if client == nil or client.connection ~= connection then return end
    local reg = client.register
    if kind == "register" and reg ~= nil and keyId == reg.keyId then
        client.register = nil
        if not validId(careerId) or (reg.careerId ~= nil and reg.careerId ~= careerId) then return end
        if P.hmacSha256Hex(reg.key, P.PROTOCOL .. "|register|" .. reg.nonce .. "|" .. careerId) ~= proof then return end
        self:saveTrustEntry({ sourceId = reg.sourceId, careerId = careerId, keyId = reg.keyId, key = reg.key })
        local mirror = rawget(_G, "FarmDashboardExportMirror")
        local binding = mirror and mirror._bindings and mirror._bindings[connection]
        if type(binding) == "table" and binding.sourceId == reg.sourceId and binding.careerId == nil then
            binding.careerId = careerId
        end
        info("[FarmDash] export mirror: this PC will reconnect to replicas/%s/ automatically after the server proves the link", reg.sourceId)
        return
    end
    if kind ~= "renew" or client.state ~= "verifying" then return end
    local nonce = client.nonce
    client.nonce = nil
    local entry = nil
    if hexOf(keyId, 16) and validId(careerId) and hexOf(proof, 64) then
        for _, row in ipairs(self:loadTrust()) do
            if row.keyId == keyId then entry = row break end
        end
    end
    local ok = entry ~= nil and entry.careerId == careerId
        and P.hmacSha256Hex(entry.key, P.PROTOCOL .. "|renew|" .. nonce .. "|" .. careerId) == proof
    local config = rawget(_G, "FarmDashboardReplicaConfig")
    if ok and config and type(config.bindRenewed) == "function" and config:bindRenewed(connection, entry.sourceId, careerId) then
        client.state = "bound"
        client.sourceId = entry.sourceId
        client.verifiedKeyId = entry.keyId
        client.verifiedCareerId = careerId
        local newest = self:loadTrust()[1]
        if newest ~= nil and newest.keyId ~= entry.keyId then self:saveTrustEntry(entry) end
        info("[FarmDash] export mirror: linked server verified; storing under replicas/%s/", entry.sourceId)
        return
    end
    client.state = "unpaired"
    info("[FarmDash] export mirror: this server could not prove an earlier link; Farm Dashboard will ask before storing")
end

function P:onLeave(connection)
    local client = self._client
    if client ~= nil and (connection == nil or client.connection == connection) then
        self._client = nil
    end
    self:deletePending()
end

function P:clientState()
    return self._client and self._client.state or "idle"
end

--------------------------------------------------------------------------------------------------------------------
-- Server: keys registered by clients over approved connections (bounded, per career, never logged)
--------------------------------------------------------------------------------------------------------------------

local SERVER_FIELDS = { "keyId", "key", "careerId" }

local function serverCareerId()
    local identity = rawget(_G, "FarmDashboardCareerIdentity")
    if identity == nil or type(identity.status) ~= "function" then return nil end
    local ok, status = pcall(identity.status)
    local careerId = ok and type(status) == "table" and status.careerId or nil
    if careerId == "waiting" or not validId(careerId) then return nil end
    return careerId
end

local function serverRows()
    local root = dashboardRoot()
    if root == nil then return {}, nil end
    local rows = readEntries(root .. P.SERVER_FILE, "farmDashboardReplicaClients", "client", SERVER_FIELDS, P.MAX_SERVER_KEYS)
    local valid = {}
    for _, row in ipairs(rows) do
        if hexOf(row.keyId, 16) and hexOf(row.key, 64) and validId(row.careerId) then valid[#valid + 1] = row end
    end
    return valid, root
end

local function serverRateOk(connection, kind)
    if connection == nil then return false end
    local now = nowMs()
    local seen = P._serverRate[connection]
    if seen == nil then
        seen = {}
        P._serverRate[connection] = seen
    end
    if seen[kind] ~= nil and now - seen[kind] < P.SERVER_RATE_MS then return false end
    seen[kind] = now
    return true
end

local function scheduleReplay(connection)
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and type(mirror.onClientJoined) == "function" then
        pcall(function() mirror:onClientJoined(connection) end)
    end
end

-- Strict: 1..MAX_CHALLENGE_IDS distinct 16-hex IDs, comma separated, nothing else. Returns a set or nil.
function P.parseChallengeIds(idList)
    if type(idList) ~= "string" or #idList < 16 or #idList > P.MAX_ID_LIST_BYTES then return nil end
    if (#idList + 1) % 17 ~= 0 then return nil end
    local wanted, count = {}, 0
    for i = 1, #idList, 17 do
        local id = string.sub(idList, i, i + 15)
        local sep = string.sub(idList, i + 16, i + 16)
        if not hexOf(id, 16) or wanted[id] or (sep ~= "" and sep ~= ",") then return nil end
        wanted[id] = true
        count = count + 1
    end
    if count > P.MAX_CHALLENGE_IDS then return nil end
    return wanted
end

function P:onServerChallenge(connection, nonce, idList)
    if not serverRateOk(connection, "challenge") then return end
    if not hexOf(nonce, 32) then return end
    local wanted = P.parseChallengeIds(idList)
    if wanted == nil then return end
    local careerId = serverCareerId()
    local answered = false
    if careerId ~= nil then
        for _, row in ipairs((serverRows())) do
            if wanted[row.keyId] and row.careerId == careerId then
                local proof = P.hmacSha256Hex(row.key, P.PROTOCOL .. "|renew|" .. nonce .. "|" .. careerId)
                answered = sendTo(connection, newEvent(3, "renew", row.keyId, careerId, proof))
                break
            end
        end
    end
    if not answered then sendTo(connection, newEvent(3, "renew", "", "", "")) end
    scheduleReplay(connection)
end
function P:onServerRegister(connection, nonce, keyId, key)
    if not serverRateOk(connection, "register") then return end
    if not hexOf(nonce, 32) or not hexOf(keyId, 16) or not hexOf(key, 64) then return end
    local careerId = serverCareerId()
    if careerId == nil then return end
    local rows, root = serverRows()
    if root == nil then return end
    local kept = { { keyId = keyId, key = key, careerId = careerId } }
    for _, row in ipairs(rows) do
        if row.keyId ~= keyId and #kept < P.MAX_SERVER_KEYS then kept[#kept + 1] = row end
    end
    ensureRoot(root)
    if not writeEntries(root .. P.SERVER_FILE, "farmDashboardReplicaClients", "client", SERVER_FIELDS, kept) then return end
    local proof = P.hmacSha256Hex(key, P.PROTOCOL .. "|register|" .. nonce .. "|" .. careerId)
    sendTo(connection, newEvent(3, "register", keyId, careerId, proof))
    scheduleReplay(connection)
end

