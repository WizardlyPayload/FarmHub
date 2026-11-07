-- Transport Company v1.3.1.0 keeps a separate company and XML book for each farm.
-- Read server state only; offers are excluded and truck books may outlive sold trucks.

local MAX_CONTRACT_SCAN, MAX_CONTRACT_ROWS = 300, 40
local MAX_TRUCK_SCAN, MAX_TRUCK_ROWS = 200, 40
local MAX_DRIVER_SCAN, MAX_DRIVER_ROWS = 100, 30
local ACCEPTED = 2

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n == nil or n < 0 then return nil end
    return ctx.round2(n)
end

CompanionPages.register({
    key = "transportCompany",
    modNames = { "FS25_TransportCompany", "KM_80292_transport_company" },
    substrings = { "transportcompany", "transport_company", "transport-company" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        local manager = ctx.symbol("g_transportCompanyManager") or ctx.global("g_transportCompanyManager")
        if type(manager) ~= "table" or manager.isMissionLoaded ~= true or manager.isServer ~= true then
            return { readState = "settings-only", reason = "company-manager-unavailable" }
        end
        local company = type(manager.companies) == "table" and manager.companies[farmId] or nil
        if type(company) ~= "table" then
            return { readState = "settings-only", reason = "no-farm-company" }
        end
        if ctx.num(company.farmId) ~= farmId then
            return { readState = "partial", reason = "farm-identity-mismatch" }
        end

        local invalid, truncated = false, false
        local ledger = type(company.ledger) == "table" and company.ledger or nil
        local revenue = ledger and nonnegative(ctx, ledger.revenue) or nil
        local wages = ledger and nonnegative(ctx, ledger.driverWages) or nil
        local jobs = ledger and nonnegative(ctx, ledger.jobs) or nil
        if revenue == nil or wages == nil or jobs == nil then invalid = true end

        local contracts, acceptedCount, contractScan = {}, 0, 0
        if type(company.contracts) == "table" then
            for _, contract in pairs(company.contracts) do
                contractScan = contractScan + 1
                if contractScan > MAX_CONTRACT_SCAN then truncated = true; break end
                if type(contract) == "table" and ctx.num(contract.state) == ACCEPTED then
                    if ctx.num(contract.farmId) ~= farmId then
                        invalid = true
                    else
                        local amount = nonnegative(ctx, contract.amount)
                        local delivered = nonnegative(ctx, contract.delivered)
                        local reward = nonnegative(ctx, contract.reward)
                        local contractType = ctx.num(contract.contractType)
                        if amount == nil or amount <= 0 or delivered == nil or delivered > amount
                            or reward == nil or (contractType ~= 1 and contractType ~= 2) then
                            invalid = true
                        else
                            acceptedCount = acceptedCount + 1
                            if #contracts >= MAX_CONTRACT_ROWS then truncated = true
                            else
                                contracts[#contracts + 1] = {
                                    farmId = farmId,
                                    id = ctx.clip(contract.contractId, 64),
                                    source = ctx.clip(contract.sourceName, 80),
                                    destination = ctx.clip(contract.destName, 80),
                                    fillTypeIndex = ctx.num(contract.fillTypeIndex),
                                    contractType = contractType,
                                    amount = amount,
                                    delivered = delivered,
                                    reward = reward,
                                    deadline = ctx.num(contract.deadline),
                                    hiredDriver = contract.isHiredDriver == true,
                                }
                            end
                        end
                    end
                end
            end
        else invalid = true end

        local truckBooks, truckCount, truckScan = {}, 0, 0
        if type(company.trucks) == "table" then
            for _, truck in pairs(company.trucks) do
                truckScan = truckScan + 1
                if truckScan > MAX_TRUCK_SCAN then truncated = true; break end
                if type(truck) == "table" then
                    if ctx.num(truck.farmId) ~= farmId then invalid = true
                    else
                        local distance, earned = nonnegative(ctx, truck.distanceM), nonnegative(ctx, truck.revenue)
                        local fuel, other = nonnegative(ctx, truck.fuelCost), nonnegative(ctx, truck.otherCost)
                        local jobsDone = nonnegative(ctx, truck.jobsDelivered)
                        if distance == nil or earned == nil or fuel == nil or other == nil or jobsDone == nil then
                            invalid = true
                        else
                            truckCount = truckCount + 1
                            if #truckBooks >= MAX_TRUCK_ROWS then truncated = true
                            else
                                truckBooks[#truckBooks + 1] = {
                                    farmId = farmId,
                                    vehicleId = ctx.clip(truck.uniqueId, 64),
                                    name = ctx.clip(truck.vehicleName, 80),
                                    distanceKm = ctx.round2(distance / 1000),
                                    revenue = earned,
                                    fuelCost = fuel,
                                    otherCost = other,
                                    jobsDone = math.floor(jobsDone),
                                }
                            end
                        end
                    end
                end
            end
        else invalid = true end

        local drivers, driverCount, driverScan = {}, 0, 0
        if type(company.drivers) == "table" then
            for _, driver in pairs(company.drivers) do
                driverScan = driverScan + 1
                if driverScan > MAX_DRIVER_SCAN then truncated = true; break end
                if type(driver) == "table" then
                    local wage, done = nonnegative(ctx, driver.weeklyWage), nonnegative(ctx, driver.jobsDone)
                    if wage == nil or done == nil then invalid = true
                    else
                        driverCount = driverCount + 1
                        if #drivers >= MAX_DRIVER_ROWS then truncated = true
                        else
                            drivers[#drivers + 1] = {
                                farmId = farmId,
                                id = ctx.clip(driver.driverId, 64),
                                name = ctx.clip(driver.name, 80),
                                weeklyWage = wage,
                                jobsDone = math.floor(done),
                                assignedVehicleId = ctx.clip(driver.assignedTruckUniqueId, 64),
                            }
                        end
                    end
                end
            end
        else invalid = true end

        table.sort(contracts, function(a, b) return tostring(a.id or "") < tostring(b.id or "") end)
        table.sort(truckBooks, function(a, b) return tostring(a.name or "") < tostring(b.name or "") end)
        table.sort(drivers, function(a, b) return tostring(a.name or "") < tostring(b.name or "") end)
        return {
            readState = invalid and "partial" or "ok",
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                archived = company.isArchived == true,
                active = ctx.call(company, "getIsActive") == true,
                hqLevel = nonnegative(ctx, company.hqLevel),
                reputation = nonnegative(ctx, company.reputation),
                revenue = revenue,
                driverWages = wages,
                jobs = jobs and math.floor(jobs) or nil,
                acceptedCount = acceptedCount,
                truckBookCount = truckCount,
                driverCount = driverCount,
            } },
            contracts = contracts,
            truckBooks = truckBooks,
            drivers = drivers,
        }
    end,
})
