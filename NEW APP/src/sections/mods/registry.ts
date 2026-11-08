/**
 * The one list of dedicated companion-mod pages. Each entry drives its sidebar MODS item (shown only
 * when the mod is detected), its `#mod-<key>` route and the "Open full page" links from section embeds.
 */

import type { ModPageSectionId } from "@/types/dashboard";
import type { CompanionPageEntry, CompanionPagesPayload } from "./types";
import { sectionHasFeature } from "@/platform/demo-source";

export type { CompanionPageEntry, CompanionPageGroup, CompanionPageProps } from "./types";

export const COMPANION_PAGES: CompanionPageEntry[] = [
  // Finance
  { key: "enhancedLoanSystem", catalogId: "enhancedLoanSystem", title: "Enhanced Loan System", glyph: "EL", group: "finance",
    load: () => import("@/sections/mods/enhancedLoanSystem").then((m) => m.Page) },
  { key: "fairLeasingPlus", catalogId: "fairLeasingPlus", title: "Fair Leasing Plus", glyph: "FL", group: "finance",
    load: () => import("@/sections/mods/fairLeasingPlus").then((m) => m.Page) },
  { key: "iNeedALoan", catalogId: "iNeedALoan", title: "I Need A Loan", glyph: "NL", group: "finance",
    load: () => import("@/sections/mods/iNeedALoan").then((m) => m.Page) },
  { key: "automaticLoanRepay", catalogId: "automaticLoanRepay", title: "Automatic Loan Repay", glyph: "LR", group: "finance",
    load: () => import("@/sections/mods/automaticLoanRepay").then((m) => m.Page) },
  { key: "realisticDieselPrice", catalogId: "realisticDieselPrice", title: "Realistic Diesel Price", glyph: "RD", group: "finance",
    load: () => import("@/sections/mods/realisticDieselPrice").then((m) => m.Page) },
  { key: "fluctuatingDieselPrice", catalogId: "fluctuatingDieselPrice", title: "Fluctuating Diesel Price", glyph: "FD", group: "finance",
    load: () => import("@/sections/mods/fluctuatingDieselPrice").then((m) => m.Page) },
  { key: "dynamicMarket", catalogId: "dynamicMarket", title: "Dynamic Market", glyph: "DM", group: "finance",
    load: () => import("@/sections/mods/dynamicMarket").then((m) => m.Page) },
  { key: "betterContracts", catalogId: "betterContracts", title: "Better Contracts", glyph: "BC", group: "finance",
    load: () => import("@/sections/mods/betterContracts").then((m) => m.Page) },
  { key: "cropContracts", catalogId: "cropContracts", title: "Crop Contracts", glyph: "CC", group: "finance",
    load: () => import("@/sections/mods/cropContracts").then((m) => m.Page) },
  { key: "woodChipsMissions", catalogId: "woodChipsMissions", title: "Wood Chips Missions", glyph: "WC", group: "finance",
    load: () => import("@/sections/mods/woodChipsMissions").then((m) => m.Page) },
  { key: "supplyTransportContracts", catalogId: "supplyTransportContracts", title: "Supply and Transport Contracts", glyph: "ST", group: "finance",
    load: () => import("@/sections/mods/supplyTransportContracts").then((m) => m.Page) },
  { key: "cropInsurance", catalogId: "cropInsurance", title: "Crop Insurance", glyph: "CI", group: "finance",
    load: () => import("@/sections/mods/cropInsurance").then((m) => m.Page) },
  { key: "grainTickets", catalogId: "grainTickets", title: "Grain Tickets", glyph: "GT", group: "finance",
    load: () => import("@/sections/mods/grainTickets").then((m) => m.Page) },
  { key: "contractManager", catalogId: "contractManager", title: "Contract Manager", glyph: "CM", group: "finance",
    load: () => import("@/sections/mods/contractManager").then((m) => m.Page) },
  { key: "mowingContractsPlus", catalogId: "mowingContractsPlus", title: "Mowing Contracts Plus", glyph: "MC", group: "finance",
    load: () => import("@/sections/mods/mowingContractsPlus").then((m) => m.Page) },
  { key: "cryptoFarm", catalogId: "cryptoFarm", title: "Crypto Farm", glyph: "CF", group: "finance",
    load: () => import("@/sections/mods/cryptoFarm").then((m) => m.Page) },
  { key: "netWorthTracker", catalogId: "netWorthTracker", title: "Net Worth Tracker", glyph: "NW", group: "finance",
    load: () => import("@/sections/mods/netWorthTracker").then((m) => m.Page) },
  { key: "multiplayerAchievements", catalogId: "multiplayerAchievements", title: "Multiplayer Achievements", glyph: "MA", group: "finance",
    load: () => import("@/sections/mods/multiplayerAchievements").then((m) => m.Page) },
  { key: "economicHistory", catalogId: "economicHistory", title: "Economic History", glyph: "EH", group: "finance",
    load: () => import("@/sections/mods/economicHistory").then((m) => m.Page) },
  { key: "usedEquipmentYards", catalogId: "usedEquipmentYards", title: "Used Equipment Yards", glyph: "UY", group: "finance",
    load: () => import("@/sections/mods/usedEquipmentYards").then((m) => m.Page) },
  { key: "realLandFinance", catalogId: "realLandFinance", title: "Real Land Finance", glyph: "LF", group: "finance",
    load: () => import("@/sections/mods/realLandFinance").then((m) => m.Page) },
  { key: "financeYourFleet", catalogId: "financeYourFleet", title: "Finance Your Fleet", glyph: "FY", group: "finance",
    load: () => import("@/sections/mods/financeYourFleet").then((m) => m.Page) },
  { key: "realisticFarmFinanceLoans", catalogId: "realisticFarmFinanceLoans", title: "Realistic Farm Finance loans", glyph: "RL", group: "finance",
    load: () => import("@/sections/mods/realisticFarmFinanceLoans").then((m) => m.Page) },
  { key: "bankAndCreditLoans", catalogId: "bankAndCreditLoans", title: "Bank And Credit loans", glyph: "BK", group: "finance",
    load: () => import("@/sections/mods/bankAndCreditLoans").then((m) => m.Page) },
  { key: "agriCreditSolutions", catalogId: "agriCreditSolutions", title: "AgriCredit Solutions", glyph: "AC", group: "finance",
    load: () => import("@/sections/mods/agriCreditSolutions").then((m) => m.Page) },
  { key: "kringstadPiler", catalogId: "kringstadPiler", title: "Sugar Beet Piler tare balance", glyph: "SB", group: "finance",
    load: () => import("@/sections/mods/kringstadPiler").then((m) => m.Page) },
  { key: "villageBank", catalogId: "villageBank", title: "Village Bank", glyph: "VB", group: "finance",
    load: () => import("@/sections/mods/villageBank").then((m) => m.Page) },
  { key: "investmentSystem", catalogId: "investmentSystem", title: "Investment System", glyph: "IS", group: "finance",
    load: () => import("@/sections/mods/investmentSystem").then((m) => m.Page) },
  { key: "shopRefund", catalogId: "shopRefund", title: "Shop Refund", glyph: "SR", group: "fleet",
    load: () => import("@/sections/mods/shopRefund").then((m) => m.Page) },
  { key: "rentYourField", catalogId: "rentYourField", title: "Rent Your Field", glyph: "RY", group: "finance",
    load: () => import("@/sections/mods/rentYourField").then((m) => m.Page) },
  { key: "transportCompany", catalogId: "transportCompany", title: "Transport Company", glyph: "TC", group: "finance",
    load: () => import("@/sections/mods/transportCompany").then((m) => m.Page) },
  { key: "futuresMarketPositions", catalogId: "futuresMarketPositions", title: "Futures Market", glyph: "FM", group: "finance",
    load: () => import("@/sections/mods/futuresMarketPositions").then((m) => m.Page) },
  { key: "farmReputation", catalogId: "farmReputation", title: "Farm Reputation", glyph: "FR", group: "finance",
    load: () => import("@/sections/mods/farmReputation").then((m) => m.Page) },
  { key: "snowContracts", catalogId: "snowContracts", title: "Snow Contracts", glyph: "SC", group: "finance",
    load: () => import("@/sections/mods/snowContracts").then((m) => m.Page) },
  { key: "grassContracts", catalogId: "grassContracts", title: "Grass Contracts", glyph: "GC", group: "finance",
    load: () => import("@/sections/mods/grassContracts").then((m) => m.Page) },
  { key: "autoSellSilo", catalogId: "autoSellSilo", title: "Auto Sell Silo", glyph: "AS", group: "finance",
    load: () => import("@/sections/mods/autoSellSilo").then((m) => m.Page) },
  { key: "baleDirect", catalogId: "baleDirect", title: "Bale Direct", glyph: "BD", group: "finance",
    load: () => import("@/sections/mods/baleDirect").then((m) => m.Page) },
  { key: "autoSwitchCoop", catalogId: "autoSwitchCoop", title: "AutoSwitch co-operative payments", glyph: "AC", group: "finance",
    load: () => import("@/sections/mods/autoSwitchCoop").then((m) => m.Page) },
  { key: "grainHaulingService", catalogId: "grainHaulingService", title: "Grain Hauling Service", glyph: "GH", group: "finance",
    load: () => import("@/sections/mods/grainHaulingService").then((m) => m.Page) },
  { key: "overburden", catalogId: "overburden", title: "Overburden", glyph: "OB", group: "fields",
    load: () => import("@/sections/mods/overburden").then((m) => m.Page) },
  { key: "slurryPipeSystem", catalogId: "slurryPipeSystem", title: "Slurry Pipe System", glyph: "SP", group: "storage",
    load: () => import("@/sections/mods/slurryPipeSystem").then((m) => m.Page) },
  // Livestock
  { key: "leaseLivestock", catalogId: "leaseLivestock", title: "Lease Livestock", glyph: "LL", group: "livestock",
    load: () => import("@/sections/mods/leaseLivestock").then((m) => m.Page) },
  { key: "veterinarian", catalogId: "veterinarian", title: "Veterinarian and Animal Diseases", glyph: "VT", group: "livestock",
    load: () => import("@/sections/mods/veterinarian").then((m) => m.Page) },
  { key: "seasonalMilkProduction", catalogId: "seasonalMilkProduction", title: "Seasonal Milk Production", glyph: "SM", group: "livestock",
    load: () => import("@/sections/mods/seasonalMilkProduction").then((m) => m.Page) },
  { key: "seasonalWoolProduction", catalogId: "seasonalWoolProduction", title: "Seasonal Wool Production", glyph: "SW", group: "livestock",
    load: () => import("@/sections/mods/seasonalWoolProduction").then((m) => m.Page) },
  { key: "realisticAnimalLosses", catalogId: "realisticAnimalLosses", title: "Realistic Animal Losses", glyph: "AL", group: "livestock",
    load: () => import("@/sections/mods/realisticAnimalLosses").then((m) => m.Page) },
  { key: "animalFoodOverview", catalogId: "animalFoodOverview", title: "Animal Food Overview", glyph: "FO", group: "livestock",
    load: () => import("@/sections/mods/animalFoodOverview").then((m) => m.Page) },
  { key: "animalFoodCalculator", catalogId: "animalFoodCalculator", title: "Animal Food Calculator", glyph: "FC", group: "livestock",
    load: () => import("@/sections/mods/animalFoodCalculator").then((m) => m.Page) },
  { key: "automaticMilkDistribution", catalogId: "automaticMilkDistribution", title: "Automatic Milk Distribution", glyph: "MD", group: "livestock",
    load: () => import("@/sections/mods/automaticMilkDistribution").then((m) => m.Page) },
  { key: "bullMilkProduction", catalogId: "bullMilkProduction", title: "Bull Milk Production", glyph: "BM", group: "livestock",
    load: () => import("@/sections/mods/bullMilkProduction").then((m) => m.Page) },
  { key: "udderToTank", catalogId: "udderToTank", title: "Udder to Tank", glyph: "UT", group: "livestock",
    load: () => import("@/sections/mods/udderToTank").then((m) => m.Page) },
  { key: "animalPlanner", catalogId: "animalPlanner", title: "Animal Planner", glyph: "AP", group: "livestock",
    load: () => import("@/sections/mods/animalPlanner").then((m) => m.Page) },
  // Storage and production
  { key: "factoryProfitCalculator", catalogId: "factoryProfitCalculator", title: "Factory Profit Calculator", glyph: "FP", group: "storage",
    load: () => import("@/sections/mods/factoryProfitCalculator").then((m) => m.Page) },
  { key: "productionControl", catalogId: "productionControl", title: "Production Control", glyph: "PC", group: "storage",
    load: () => import("@/sections/mods/productionControl").then((m) => m.Page) },
  { key: "soilCompostBatches", catalogId: "soilCompostBatches", title: "Soil & Fertilizer compost batches", glyph: "SC", group: "storage",
    load: () => import("@/sections/mods/soilCompostBatches").then((m) => m.Page) },
  { key: "greenhouseAutomaticWatering", catalogId: "greenhouseAutomaticWatering", title: "Greenhouse Automatic Watering", glyph: "GW", group: "storage",
    load: () => import("@/sections/mods/greenhouseAutomaticWatering").then((m) => m.Page) },
  { key: "adjustProductionPoints", catalogId: "adjustProductionPoints", title: "Adjust Production Points", glyph: "AP", group: "storage",
    load: () => import("@/sections/mods/adjustProductionPoints").then((m) => m.Page) },
  { key: "realisticFuelingSilos", catalogId: "realisticFuelingSilos", title: "Realistic Fueling System silos", glyph: "FS", group: "storage",
    load: () => import("@/sections/mods/realisticFuelingSilos").then((m) => m.Page) },
  { key: "upgradeYourFactory", catalogId: "upgradeYourFactory", title: "Upgrade Your Factory", glyph: "UF", group: "storage",
    load: () => import("@/sections/mods/upgradeYourFactory").then((m) => m.Page) },
  { key: "upgradableFactories", catalogId: "upgradableFactories", title: "Upgradable Factories", glyph: "UF", group: "storage",
    load: () => import("@/sections/mods/upgradableFactories").then((m) => m.Page) },
  { key: "productionBoosterSystem", catalogId: "productionBoosterSystem", title: "Production Booster System", glyph: "PB", group: "storage",
    load: () => import("@/sections/mods/productionBoosterSystem").then((m) => m.Page) },
  { key: "productionRevamp", catalogId: "productionRevamp", title: "Production Revamp", glyph: "PR", group: "storage",
    load: () => import("@/sections/mods/productionRevamp").then((m) => m.Page) },
  { key: "productionPalletManager", catalogId: "productionPalletManager", title: "Production Pallet Manager", glyph: "PP", group: "storage",
    load: () => import("@/sections/mods/productionPalletManager").then((m) => m.Page) },
  { key: "productionSupplyManager", catalogId: "productionSupplyManager", title: "Production Supply Manager", glyph: "PS", group: "storage",
    load: () => import("@/sections/mods/productionSupplyManager").then((m) => m.Page) },
  { key: "invoicesProductionSalesOffers", catalogId: "invoicesProductionSalesOffers", title: "Invoices - Production Sales", glyph: "IS", group: "storage",
    load: () => import("@/sections/mods/invoicesProductionSalesOffers").then((m) => m.Page) },
  { key: "productionsManager", catalogId: "productionsManager", title: "Productions Manager", glyph: "PM", group: "storage",
    load: () => import("@/sections/mods/productionsManager").then((m) => m.Page) },
  { key: "palletDegradation", catalogId: "palletDegradation", title: "Pallet Degradation", glyph: "PD", group: "storage",
    load: () => import("@/sections/mods/palletDegradation").then((m) => m.Page) },
  { key: "realSilo", catalogId: "realSilo", title: "RealSilo", glyph: "RS", group: "storage",
    load: () => import("@/sections/mods/realSilo").then((m) => m.Page) },
  { key: "mobileButcherMeatPickup", catalogId: "mobileButcherMeatPickup", title: "Mobile Butcher Meat Pickup", glyph: "MB", group: "storage",
    load: () => import("@/sections/mods/mobileButcherMeatPickup").then((m) => m.Page) },
  { key: "automaticBaleStorage", catalogId: "automaticBaleStorage", title: "Automatic Bale Storage", glyph: "AB", group: "storage",
    load: () => import("@/sections/mods/automaticBaleStorage").then((m) => m.Page) },
  { key: "baleBatchTracker", catalogId: "baleBatchTracker", title: "Bale Batch Tracker", glyph: "BB", group: "storage",
    load: () => import("@/sections/mods/baleBatchTracker").then((m) => m.Page) },
  { key: "ritterFreshLoss", catalogId: "ritterFreshLoss", title: "Ritter Fresh", glyph: "RF", group: "storage",
    load: () => import("@/sections/mods/ritterFreshLoss").then((m) => m.Page) },
  { key: "productionAdvisorAlerts", catalogId: "productionAdvisorAlerts", title: "Production Advisor", glyph: "PA", group: "storage",
    load: () => import("@/sections/mods/productionAdvisorAlerts").then((m) => m.Page) },
  // Construction
  { key: "everythingConstructable", catalogId: "everythingConstructable", title: "Everything Constructable", glyph: "EC", group: "construction",
    load: () => import("@/sections/mods/everythingConstructable").then((m) => m.Page) },
  // Fields
  { key: "hireAWorker", catalogId: "hireAWorker", title: "Hire A Worker", glyph: "HW", group: "fields",
    load: () => import("@/sections/mods/hireAWorker").then((m) => m.Page) },
  { key: "whiteysFarmStaff", catalogId: "whiteysFarmStaff", title: "Whitey's Farm Staff Manager", glyph: "WS", group: "fields",
    load: () => import("@/sections/mods/whiteysFarmStaff").then((m) => m.Page) },
  { key: "employees", catalogId: "employees", title: "Employees", glyph: "EM", group: "fields",
    load: () => import("@/sections/mods/employees").then((m) => m.Page) },
  { key: "personnelManagement", catalogId: "personnelManagement", title: "Personnel Management", glyph: "PM", group: "fields",
    load: () => import("@/sections/mods/personnelManagement").then((m) => m.Page) },
  { key: "tramlineSystem", catalogId: "tramlineSystem", title: "Tramline System", glyph: "TS", group: "fields",
    load: () => import("@/sections/mods/tramlineSystem").then((m) => m.Page) },
  { key: "fieldToDoPlannedCrops", catalogId: "fieldToDoPlannedCrops", title: "Field To-Do List", glyph: "TD", group: "fields",
    load: () => import("@/sections/mods/fieldToDoPlannedCrops").then((m) => m.Page) },
  { key: "workplan", catalogId: "workplan", title: "Workplan", glyph: "WP", group: "fields",
    load: () => import("@/sections/mods/workplan").then((m) => m.Page) },
  { key: "harvestLedger", catalogId: "harvestLedger", title: "Harvest Ledger", glyph: "HL", group: "fields",
    load: () => import("@/sections/mods/harvestLedger").then((m) => m.Page) },
  { key: "realisticCropRotation", catalogId: "realisticCropRotation", title: "Realistic Crop Rotation", glyph: "CR", group: "fields",
    load: () => import("@/sections/mods/realisticCropRotation").then((m) => m.Page) },
  { key: "cropRotationPlanner", catalogId: "cropRotationPlanner", title: "Crop Rotation", glyph: "CP", group: "fields",
    load: () => import("@/sections/mods/cropRotationPlanner").then((m) => m.Page) },
  { key: "vehicleWeightModifier", catalogId: "vehicleWeightModifier", title: "Vehicle Weight Modifier", glyph: "VW", group: "fleet",
    load: () => import("@/sections/mods/vehicleWeightModifier").then((m) => m.Page) },
  { key: "flockCamera", catalogId: "flockCamera", title: "Flock Camera", glyph: "FC", group: "construction",
    load: () => import("@/sections/mods/flockCamera").then((m) => m.Page) },
  { key: "restrictedPeriods", catalogId: "restrictedPeriods", title: "Restricted Periods", glyph: "RP", group: "fields",
    load: () => import("@/sections/mods/restrictedPeriods").then((m) => m.Page) },
  { key: "regionalCropCalendar", catalogId: "regionalCropCalendar", title: "Regional Crop Calendar", glyph: "RC", group: "fields",
    load: () => import("@/sections/mods/regionalCropCalendar").then((m) => m.Page) },
  { key: "moistureSystem", catalogId: "moistureSystem", title: "Moisture System", glyph: "MS", group: "fields",
    load: () => import("@/sections/mods/moistureSystem").then((m) => m.Page) },
  { key: "fieldLeasing", catalogId: "fieldLeasing", title: "Field Leasing", glyph: "FL", group: "fields",
    load: () => import("@/sections/mods/fieldLeasing").then((m) => m.Page) },
  { key: "smartCropControl", catalogId: "smartCropControl", title: "Smart Crop Control", glyph: "CC", group: "fields",
    load: () => import("@/sections/mods/smartCropControl").then((m) => m.Page) },
  { key: "cropControlOverride", catalogId: "cropControlOverride", title: "Crop Control Override", glyph: "CO", group: "fields",
    load: () => import("@/sections/mods/cropControlOverride").then((m) => m.Page) },
  // Fleet
  { key: "enhancedVehicle", catalogId: "enhancedVehicle", title: "EnhancedVehicle", glyph: "EV", group: "fleet",
    load: () => import("@/sections/mods/enhancedVehicle").then((m) => m.Page) },
  { key: "puncturedTires", catalogId: "puncturedTires", title: "Punctured Tires", glyph: "PT", group: "fleet",
    load: () => import("@/sections/mods/puncturedTires").then((m) => m.Page) },
  { key: "vehicleInspectionHU", catalogId: "vehicleInspectionHU", title: "Vehicle Inspection (HU)", glyph: "HU", group: "fleet",
    load: () => import("@/sections/mods/vehicleInspectionHU").then((m) => m.Page) },
  { key: "majorService", catalogId: "majorService", title: "Major Service", glyph: "MS", group: "fleet",
    load: () => import("@/sections/mods/majorService").then((m) => m.Page) },
  { key: "useYourTyres", catalogId: "useYourTyres", title: "Use Your Tyres", glyph: "TY", group: "fleet",
    load: () => import("@/sections/mods/useYourTyres").then((m) => m.Page) },
  { key: "realisticHarvesting", catalogId: "realisticHarvesting", title: "Realistic Harvesting", glyph: "RH", group: "fleet",
    load: () => import("@/sections/mods/realisticHarvesting").then((m) => m.Page) },
  { key: "jobQueue", catalogId: "jobQueue", title: "Job Queue", glyph: "JQ", group: "fleet",
    load: () => import("@/sections/mods/jobQueue").then((m) => m.Page) },
  { key: "hydraulicSuspension", catalogId: "hydraulicSuspension", title: "Hydraulic Suspension System", glyph: "HS", group: "fleet",
    load: () => import("@/sections/mods/hydraulicSuspension").then((m) => m.Page) },
  { key: "realDieselStart", catalogId: "realDieselStart", title: "Realistic Diesel Start", glyph: "RS", group: "fleet",
    load: () => import("@/sections/mods/realDieselStart").then((m) => m.Page) },
  { key: "twoRotorRakeControl", catalogId: "twoRotorRakeControl", title: "Universal Two-Rotor Rake Control", glyph: "TR", group: "fleet",
    load: () => import("@/sections/mods/twoRotorRakeControl").then((m) => m.Page) },
  { key: "terraFarmMachines", catalogId: "terraFarmMachines", title: "TerraFarm Machines", glyph: "TF", group: "fleet",
    load: () => import("@/sections/mods/terraFarmMachines").then((m) => m.Page) },
  { key: "realisticMechanicalSystems", catalogId: "realisticMechanicalSystems", title: "Realistic Mechanical Systems", glyph: "MS", group: "fleet",
    load: () => import("@/sections/mods/realisticMechanicalSystems").then((m) => m.Page) },
  { key: "realFuelConsumption", catalogId: "realFuelConsumption", title: "Real Fuel Consumption", glyph: "FC", group: "fleet",
    load: () => import("@/sections/mods/realFuelConsumption").then((m) => m.Page) },
  { key: "dieselFuelSystem", catalogId: "dieselFuelSystem", title: "Diesel Fuel System", glyph: "DF", group: "fleet",
    load: () => import("@/sections/mods/dieselFuelSystem").then((m) => m.Page) },
  { key: "roundBalerExtension", catalogId: "roundBalerExtension", title: "Round Baler Extension", glyph: "RB", group: "fleet",
    load: () => import("@/sections/mods/roundBalerExtension").then((m) => m.Page) },
  { key: "baleCapacityMultiplier", catalogId: "baleCapacityMultiplier", title: "Bale Capacity Multiplier", glyph: "BC", group: "fleet",
    load: () => import("@/sections/mods/baleCapacityMultiplier").then((m) => m.Page) },
  { key: "forageWagonCompression", catalogId: "forageWagonCompression", title: "Forage Wagon Compression", glyph: "FW", group: "fleet",
    load: () => import("@/sections/mods/forageWagonCompression").then((m) => m.Page) },
  { key: "enhancedMixerWagons", catalogId: "enhancedMixerWagons", title: "Enhanced Mixer Wagons", glyph: "MW", group: "fleet",
    load: () => import("@/sections/mods/enhancedMixerWagons").then((m) => m.Page) },
  { key: "mixerWagonFeedSwitcher", catalogId: "mixerWagonFeedSwitcher", title: "Mixer Wagon Feed Switcher", glyph: "MF", group: "fleet",
    load: () => import("@/sections/mods/mixerWagonFeedSwitcher").then((m) => m.Page) },
  { key: "chainsawConsumables", catalogId: "chainsawConsumables", title: "Chainsaw Consumables", glyph: "CS", group: "fleet",
    load: () => import("@/sections/mods/chainsawConsumables").then((m) => m.Page) },
  { key: "vehicleAnchor", catalogId: "vehicleAnchor", title: "Vehicle Anchor", glyph: "VA", group: "fleet",
    load: () => import("@/sections/mods/vehicleAnchor").then((m) => m.Page) },
  { key: "multipleSilageTypes", catalogId: "multipleSilageTypes", title: "Multiple Silage Types", glyph: "MS", group: "fleet",
    load: () => import("@/sections/mods/multipleSilageTypes").then((m) => m.Page) },
  { key: "handPlantSaplings", catalogId: "handPlantSaplings", title: "Hand Plant Saplings", glyph: "SP", group: "storage",
    load: () => import("@/sections/mods/handPlantSaplings").then((m) => m.Page) },
  { key: "rcSheepBarn", catalogId: "rcSheepBarn", title: "RC Sheep Barn and Storage", glyph: "SB", group: "livestock",
    load: () => import("@/sections/mods/rcSheepBarn").then((m) => m.Page) },
  { key: "unloadGarage", catalogId: "unloadGarage", title: "Unload Garage", glyph: "UG", group: "fleet",
    load: () => import("@/sections/mods/unloadGarage").then((m) => m.Page) },
  { key: "smartBarrier", catalogId: "smartBarrier", title: "Smart Barrier Pack", glyph: "SB", group: "construction",
    load: () => import("@/sections/mods/smartBarrier").then((m) => m.Page) },
  { key: "bhFuelTerminal", catalogId: "bhFuelTerminal", title: "BH Bulk Fuel Terminal", glyph: "FT", group: "storage",
    load: () => import("@/sections/mods/bhFuelTerminal").then((m) => m.Page) },
  { key: "bhWaterBattery", catalogId: "bhWaterBattery", title: "BH Produced Water Tank Batteries", glyph: "WB", group: "storage",
    load: () => import("@/sections/mods/bhWaterBattery").then((m) => m.Page) },
  { key: "bhSandFacilities", catalogId: "bhSandFacilities", title: "BH Sand Facilities", glyph: "SF", group: "storage",
    load: () => import("@/sections/mods/bhSandFacilities").then((m) => m.Page) },
  { key: "powertrainUpgrade", catalogId: "powertrainUpgrade", title: "Powertrain Upgrade", glyph: "PU", group: "fleet",
    load: () => import("@/sections/mods/powertrainUpgrade").then((m) => m.Page) },
  { key: "capacityUpgrade", catalogId: "capacityUpgrade", title: "Capacity Upgrade", glyph: "CU", group: "fleet",
    load: () => import("@/sections/mods/capacityUpgrade").then((m) => m.Page) },
  { key: "variableTirePressure", catalogId: "variableTirePressure", title: "Variable Tire Pressure", glyph: "TP", group: "fleet",
    load: () => import("@/sections/mods/variableTirePressure").then((m) => m.Page) },
  { key: "realTireWear", catalogId: "realTireWear", title: "Real Tire Wear", glyph: "TW", group: "fleet",
    load: () => import("@/sections/mods/realTireWear").then((m) => m.Page) },
  { key: "autoSwitchTireLife", catalogId: "autoSwitchTireLife", title: "AutoSwitch tire life", glyph: "AT", group: "fleet",
    load: () => import("@/sections/mods/autoSwitchTireLife").then((m) => m.Page) },
  { key: "organicDemand", catalogId: "organicDemand", title: "Demand-Oriented Organic Application", glyph: "OD", group: "fleet",
    load: () => import("@/sections/mods/organicDemand").then((m) => m.Page) },
  { key: "adjustableFillLevelAdvanced", catalogId: "adjustableFillLevelAdvanced", title: "Adjustable Fill Level Advanced", glyph: "AF", group: "fleet",
    load: () => import("@/sections/mods/adjustableFillLevelAdvanced").then((m) => m.Page) },
  { key: "adjustFuelTank", catalogId: "adjustFuelTank", title: "Adjustable Fuel Tank + Elektro", glyph: "FT", group: "fleet",
    load: () => import("@/sections/mods/adjustFuelTank").then((m) => m.Page) },
  { key: "realisticSeeder", catalogId: "realisticSeeder", title: "Realistic Seeder", glyph: "RS", group: "fleet",
    load: () => import("@/sections/mods/realisticSeeder").then((m) => m.Page) },
  { key: "manualAttach", catalogId: "manualAttach", title: "Manual Attach", glyph: "MA", group: "fleet",
    load: () => import("@/sections/mods/manualAttach").then((m) => m.Page) },
  { key: "vehicleControlAddon", catalogId: "vehicleControlAddon", title: "Vehicle Control Addon", glyph: "VC", group: "fleet",
    load: () => import("@/sections/mods/vehicleControlAddon").then((m) => m.Page) },
  { key: "advancedVehicleFunctions", catalogId: "advancedVehicleFunctions", title: "Advanced Vehicle Functions", glyph: "AV", group: "fleet",
    load: () => import("@/sections/mods/advancedVehicleFunctions").then((m) => m.Page) },
  { key: "sowingMachineRollerReady", catalogId: "sowingMachineRollerReady", title: "Sowing Machine Roller Ready", glyph: "SR", group: "fleet",
    load: () => import("@/sections/mods/sowingMachineRollerReady").then((m) => m.Page) },
  { key: "advancedSeedingControl", catalogId: "advancedSeedingControl", title: "Advanced Seeding Control", glyph: "AC", group: "fleet",
    load: () => import("@/sections/mods/advancedSeedingControl").then((m) => m.Page) },
  { key: "flexibleCombiSeeder", catalogId: "flexibleCombiSeeder", title: "Flexible Combi Seeder", glyph: "FC", group: "fleet",
    load: () => import("@/sections/mods/flexibleCombiSeeder").then((m) => m.Page) },
  { key: "manualPaint", catalogId: "manualPaint", title: "Manual Paint", glyph: "MP", group: "fleet",
    load: () => import("@/sections/mods/manualPaint").then((m) => m.Page) },
  { key: "dynamicMolehills", catalogId: "dynamicMolehills", title: "Dynamic Molehills", glyph: "MH", group: "fields",
    load: () => import("@/sections/mods/dynamicMolehills").then((m) => m.Page) },
  { key: "resourceUsageControl", catalogId: "resourceUsageControl", title: "Resource Usage Control", glyph: "RU", group: "fields",
    load: () => import("@/sections/mods/resourceUsageControl").then((m) => m.Page) },
  { key: "farmLimitManager", catalogId: "farmLimitManager", title: "Farm Limit Manager", glyph: "LM", group: "finance",
    load: () => import("@/sections/mods/farmLimitManager").then((m) => m.Page) },
  { key: "agroRealisticResale", catalogId: "agroRealisticResale", title: "Agro Realistic - land resale", glyph: "AR", group: "finance",
    load: () => import("@/sections/mods/agroRealisticResale").then((m) => m.Page) },
  { key: "agroRealisticHealthLoss", catalogId: "agroRealisticHealthLoss", title: "Agro Realistic - animal health timer", glyph: "AH", group: "livestock",
    load: () => import("@/sections/mods/agroRealisticHealthLoss").then((m) => m.Page) },
  { key: "financialDashboardHistory", catalogId: "financialDashboardHistory", title: "Financial Dashboard History", glyph: "FH", group: "finance",
    load: () => import("@/sections/mods/financialDashboardHistory").then((m) => m.Page) },
  { key: "fieldContractors", catalogId: "fieldContractors", title: "Field Contractors", glyph: "CT", group: "finance",
    load: () => import("@/sections/mods/fieldContractors").then((m) => m.Page) },
  { key: "farmContractorServices", catalogId: "farmContractorServices", title: "Farm Contractor Services", glyph: "FS", group: "finance",
    load: () => import("@/sections/mods/farmContractorServices").then((m) => m.Page) },
  { key: "vipOrderManager", catalogId: "vipOrderManager", title: "VIP Order Manager", glyph: "VO", group: "finance",
    load: () => import("@/sections/mods/vipOrderManager").then((m) => m.Page) },
  { key: "factoryContracts", catalogId: "factoryContracts", title: "GN Realism - Factory Contracts", glyph: "FC", group: "finance",
    load: () => import("@/sections/mods/factoryContracts").then((m) => m.Page) },
  { key: "swathRouter", catalogId: "swathRouter", title: "Swath Router", glyph: "SR", group: "fleet",
    load: () => import("@/sections/mods/swathRouter").then((m) => m.Page) },
  { key: "vehicleTradeIn", catalogId: "vehicleTradeIn", title: "Vehicle Trade In", glyph: "TI", group: "fleet",
    load: () => import("@/sections/mods/vehicleTradeIn").then((m) => m.Page) },
  { key: "sellToTheBestBidder", catalogId: "sellToTheBestBidder", title: "Sell To The Best Bidder", glyph: "SB", group: "fleet",
    load: () => import("@/sections/mods/sellToTheBestBidder").then((m) => m.Page) },
  { key: "incomeModEmergencyDebt", catalogId: "incomeModEmergencyDebt", title: "Income Mod Emergency Debt", glyph: "ID", group: "finance",
    load: () => import("@/sections/mods/incomeModEmergencyDebt").then((m) => m.Page) },
  { key: "workplaceTriggersSites", catalogId: "workplaceTriggersSites", title: "Workplace Triggers Sites", glyph: "WT", group: "fields",
    load: () => import("@/sections/mods/workplaceTriggersSites").then((m) => m.Page) },
  { key: "autoGrovePlantings", catalogId: "autoGrovePlantings", title: "Auto Grove Planting Records", glyph: "AG", group: "fields",
    load: () => import("@/sections/mods/autoGrovePlantings").then((m) => m.Page) },
  { key: "dynamicDealership", catalogId: "dynamicDealership", title: "Dynamic Dealership", glyph: "DD", group: "fleet",
    load: () => import("@/sections/mods/dynamicDealership").then((m) => m.Page) },
  { key: "tuvSystem", catalogId: "tuvSystem", title: "TUV System", glyph: "TV", group: "fleet",
    load: () => import("@/sections/mods/tuvSystem").then((m) => m.Page) },
  { key: "implementUsageCounter", catalogId: "implementUsageCounter", title: "Implement Usage Counter", glyph: "UC", group: "fleet",
    load: () => import("@/sections/mods/implementUsageCounter").then((m) => m.Page) },
  // Units
  { key: "imperialSystem", catalogId: "imperialSystem", title: "Imperial System", glyph: "IS", group: "units",
    load: () => import("@/sections/mods/imperialSystem").then((m) => m.Page) },
];

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function modPageSection(key: string): ModPageSectionId {
  return `mod-${key}`;
}

export function companionPageKeyFromSection(section: string | null | undefined): string | null {
  if (!section || !section.startsWith("mod-")) return null;
  const key = section.slice(4);
  return KEY_PATTERN.test(key) ? key : null;
}

export function companionPageEntry(key: string | null | undefined): CompanionPageEntry | undefined {
  if (!key) return undefined;
  return COMPANION_PAGES.find((e) => e.key === key);
}

export function companionPageForCatalogId(catalogId: string | null | undefined): CompanionPageEntry | undefined {
  if (!catalogId) return undefined;
  return COMPANION_PAGES.find((e) => e.catalogId === catalogId);
}

type DetectPayload = {
  dataSource?: unknown;
  companionMods?: unknown;
  companionPages?: unknown;
} | null | undefined;

function detectedCatalogIds(payload: DetectPayload): Set<string> {
  const out = new Set<string>();
  const cm = payload?.companionMods as { mods?: unknown } | null | undefined;
  const mods = Array.isArray(cm?.mods) ? cm!.mods : [];
  for (const row of mods) {
    if (row && typeof row === "object") {
      const r = row as { id?: unknown; detected?: unknown };
      if (typeof r.id === "string" && r.detected === true) out.add(r.id);
    }
  }
  return out;
}

function hasCurrentCatalog(payload: DetectPayload): boolean {
  const cm = payload?.companionMods as { mods?: unknown } | null | undefined;
  return Array.isArray(cm?.mods);
}

export function companionPageDetected(entry: CompanionPageEntry, payload: DetectPayload): boolean {
  const pages = (payload?.companionPages as CompanionPagesPayload | null | undefined)?.pages;
  const active = hasCurrentCatalog(payload)
    ? detectedCatalogIds(payload).has(entry.catalogId)
    : pages?.[entry.key]?.detected === true;
  if (payload?.dataSource === "recorded-demo") {
    return active && sectionHasFeature(payload, modPageSection(entry.key));
  }
  return active;
}

/** Detected pages in sidebar order (group order, then title). */
export function visibleCompanionPages(payload: DetectPayload): CompanionPageEntry[] {
  return COMPANION_PAGES.filter((entry) => companionPageDetected(entry, payload));
}
