'use strict';
// Required hermetic fixtures: a missing or unsuitable live cache cannot turn these into passes.
const { mergeData } = require('../dataMerger');
const { pruneMergedDataToPlayerFarms } = require('../farmScope.cjs');
function fixture() {
    return {
        serverInfo:{farmId:3,activeFarmId:3}, farmInfo:[{id:3,farmId:3,name:'Test farm'}],
        animals:[{id:7,ownerFarmId:3,animalCount:5}],
        vehicles:[
            {id:'demo',uniqueId:'demo',name:'Shop demo',ownerFarmId:100,needsSaving:false,propertyState:'SHOP_CONFIG',configFileName:'data/vehicles/demo.xml'},
            {id:'owned',uniqueId:'owned',name:'Owned tractor',ownerFarmId:100,needsSaving:true,propertyState:'OWNED',configFileName:'data/vehicles/tractor.xml'},
        ],
    };
}
test('dealership demo does not leak into the player fleet',()=>{
    const lua=fixture();
    expect(lua.vehicles.filter(v=>v.needsSaving===false)).toHaveLength(1);
    const result=pruneMergedDataToPlayerFarms(mergeData(lua,null));
    expect(result.vehicles.some(v=>String(v.uniqueId||v.id)==='demo')).toBe(false);
});
test('authoritative XML owner resolves a player record without a live-cache precondition',()=>{
    const lua=fixture();
    const xml={vehicles:[{...lua.vehicles[1],ownerFarmId:3,farmId:3}],farms:[{id:3,farmId:3,name:'Test farm'}]};
    const result=mergeData(lua,xml);
    const owned=result.vehicles.filter(v=>String(v.uniqueId||v.id)==='owned');
    expect(owned).toHaveLength(1);
    expect(Number(owned[0].ownerFarmId||owned[0].farmId)).toBe(3);
});
