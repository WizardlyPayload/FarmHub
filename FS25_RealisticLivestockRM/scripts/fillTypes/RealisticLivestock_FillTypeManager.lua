RealisticLivestock_FillTypeManager = {}

local modDir = g_currentModDirectory
local modName = g_currentModName

if FillTypeManager.SEND_NUM_BITS < 10 then FillTypeManager.SEND_NUM_BITS = 10 end

function RealisticLivestock_FillTypeManager.loadFillTypes(xmlFile, missionInfo, baseDir)

    local xml = loadXMLFile("fillTypes", modDir .. "xml/fillTypes.xml")
    g_fillTypeManager:loadFillTypes(xml, modDir , false, modName)

    -- Load bridge fill types for detected maps (must happen before AnimalSystem.loadMapData)
    RLMapBridge.loadBridgeFillTypes()

end

FillTypeManager.loadMapData = Utils.appendedFunction(FillTypeManager.loadMapData, RealisticLivestock_FillTypeManager.loadFillTypes)