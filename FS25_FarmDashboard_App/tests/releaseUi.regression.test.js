/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
'use strict';
const { h, render } = require('../../NEW APP/node_modules/preact');
const { act } = require('../../NEW APP/node_modules/preact/test-utils');
const { productionTs, productionFunctions } = require('./helpers/production-source.cjs');
let container;
beforeEach(()=>{container=document.createElement('div');document.body.appendChild(container);});
afterEach(()=>{act(()=>render(null,container));container.remove();jest.restoreAllMocks();});

async function renderAndSettle(element) {
    // Flush mounting effects before awaiting the detail response microtask.
    // The second act then commits the state update scheduled by that response.
    act(()=>render(element,container));
    await act(async()=>{await Promise.resolve();});
}

describe('actual Preact hydration lifecycle',()=>{
    function setup(loadPenDetail) {
        const {useHydratedLivestockAnimals}=productionTs('NEW APP/src/lib/use-hydrated-livestock.ts',{
            '@/lib/pen-detail':{loadPenDetail},
            '@/lib/livestock-normalize':{normalizeLivestockAnimals:animals=>({animals,lodState:{}})},
            '@/lib/livestock-hydrate':{
                collectPensNeedingDetailHydration:rows=>[...new Set(rows.filter(r=>r.synthetic).map(r=>String(r.husbandryId)))],
                mergeAnimalsWithPenHydration:(rows,by)=>rows.flatMap(r=>by[String(r.husbandryId)]||[r]),
                penDetailAnimalsLookIndividual:()=>true,
                penDetailAnimalsToLivestockRows:(_id,rows)=>rows,
            },
        });
        function View(props){const state=useHydratedLivestockAnimals(props);return h('output',null,JSON.stringify(state.animals));}
        return View;
    }
    const rows=()=>[{husbandryId:7,synthetic:true,health:0}];
    test('a new payload refreshes detail for the same pen',async()=>{
        let health=60;const load=jest.fn(async()=>({detail:{animals:[{husbandryId:7,health}]}}));const View=setup(load);
        await renderAndSettle(h(View,{animalsData:rows(),activeServerId:'A',activeFarmId:1}));
        expect(container.textContent).toContain('"health":60');health=90;
        await renderAndSettle(h(View,{animalsData:rows(),activeServerId:'A',activeFarmId:1}));
        expect(container.textContent).toContain('"health":90');expect(load).toHaveBeenCalledTimes(2);
    });
    test('same pen id in save B triggers B detail',async()=>{
        const load=jest.fn(async(_id,opts)=>({detail:{animals:[{husbandryId:7,server:opts.serverId}]}}));const View=setup(load);
        await renderAndSettle(h(View,{animalsData:rows(),activeServerId:'A',activeFarmId:1}));
        await renderAndSettle(h(View,{animalsData:rows(),activeServerId:'B',activeFarmId:1}));
        expect(load).toHaveBeenLastCalledWith('7',{serverId:'B'});expect(container.textContent).toContain('"server":"B"');
    });
    test('late A detail cannot replace B',async()=>{
        let completeA;const load=jest.fn((_id,opts)=>opts.serverId==='A'?new Promise(resolve=>{completeA=resolve;}):Promise.resolve({detail:{animals:[{server:'B'}]}}));
        const View=setup(load);
        await renderAndSettle(h(View,{animalsData:rows(),activeServerId:'A',activeFarmId:1}));
        await renderAndSettle(h(View,{animalsData:rows(),activeServerId:'B',activeFarmId:1}));
        await act(async()=>{completeA({detail:{animals:[{server:'A'}]}});});
        expect(container.textContent).toContain('"server":"B"');expect(container.textContent).not.toContain('"server":"A"');
    });
});

test('input rerender does not steal password focus, Escape uses latest callback',()=>{
    const {useFocusTrap}=productionTs('NEW APP/src/lib/use-focus-trap.ts');
    const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetParent');
    Object.defineProperty(HTMLElement.prototype,'offsetParent',{configurable:true,get(){return this.parentElement;}});
    const first=jest.fn(),latest=jest.fn();
    function Dialog({escape}){const ref=useFocusTrap(true,escape);return h('div',{ref},h('input',{name:'username'}),h('input',{name:'password',type:'password'}));}
    try {
        act(()=>render(h(Dialog,{escape:first}),container));
        const password=container.querySelector('[name=password]');password.focus();
        act(()=>render(h(Dialog,{escape:latest}),container));
        expect(document.activeElement).toBe(password);
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        expect(latest).toHaveBeenCalledTimes(1);expect(first).not.toHaveBeenCalled();
    } finally {
        if(descriptor)Object.defineProperty(HTMLElement.prototype,'offsetParent',descriptor);
        else delete HTMLElement.prototype.offsetParent;
    }
});

test('zero reported herd does not preserve nonzero clusters',()=>{
    const {reconcileClustersToReported,clustersForFanOut}=productionFunctions('NEW APP/src/lib/livestock-fanout.ts',['reconcileClustersToReported','clustersForFanOut'],{
        sumClusterCounts:clusters=>clusters.reduce((sum,c)=>sum+(Number(c.count)||0),0),
    });
    expect(reconcileClustersToReported([{count:5}],0)).toEqual([]);
    expect(clustersForFanOut({numOfAnimalsReported:0},[{count:5}])).toEqual([]);
    expect(clustersForFanOut({},[{count:5}])).toEqual([{count:5}]);
});
test('measured zero health remains zero for synthetic rows',()=>{
    const {displayAnimalHealth}=productionFunctions('NEW APP/src/lib/livestock-format.ts',['displayAnimalHealth']);
    expect(displayAnimalHealth({health:0,__lodSynth:true})).toBe(0);
});
test('Windows missing paths are not classified as rejected credentials',()=>{
    const {classifyRawError}=productionFunctions('NEW APP/src/lib/ux-classify.ts',['classifyRawError'],{ERROR_CODES:{
        E_PATH_DENIED:'path',E_AUTH_MISSING:'auth',E_PERMISSION_DENIED:'permission',E_LAN_TIMEOUT:'timeout',E_SETUP_LOCAL_ONLY:'local',E_INVALID_TOKEN:'token',E_SERVER_OFFLINE:'offline',E_LUA_STALE:'stale',E_SAVE_FAILED:'save',
    }});
    expect(classifyRawError('ENOENT C:\\Users\\Example\\savegame1')).toBe('path');
    expect(classifyRawError('ENOTDIR C:\\Users\\Example')).toBe('path');
    expect(classifyRawError('401 Unauthorized')).toBe('auth');
});
