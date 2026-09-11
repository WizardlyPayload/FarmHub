'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { EventEmitter } = require('events');
const { productionFunctions } = require('./helpers/production-source.cjs');
const policy = require('../editionPolicy.cjs');
const config = require('../setupConfigMerge.cjs');
const fileCommit = require('../fileCommit.cjs');

describe('release trust regressions against production', () => {
    const guards = () => productionFunctions('FS25_FarmDashboard_App/main.js',
        ['getRequestOrigin', 'isAllowedSameOrigin', 'enforceWriteOriginAndToken', 'webSocketOriginAllowed'], {
            PORT: 8768, isLocalServerHost: h => ['localhost','127.0.0.1'].includes(h),
            corsOriginAllowedPure: () => false, MARKETING_SITE_HOSTS: [], getCachedLocalInterfaceIps: () => [],
            isLocalhostSocket: () => true, isRequestFromThisMachine: () => false,
            isLoopbackIp: () => true, requestRemoteAddress: () => '127.0.0.1',
        });
    test.each(['null', '::::', '', 'file:///C:/outside.html', 'https://evil.invalid'])('reject browser Origin %p for writes and WS', origin => {
        const g = guards(), req = { headers: { origin, host: '127.0.0.1:8768' } };
        expect(g.enforceWriteOriginAndToken(req, {})).toBeTruthy();
        expect(g.webSocketOriginAllowed(req)).toBe(false);
    });
    test('explicit absent-origin native compatibility and same-origin browser still work', () => {
        const g = guards();
        expect(g.enforceWriteOriginAndToken({ headers: {} }, {})).toBeNull();
        expect(g.webSocketOriginAllowed({ headers: { origin: 'http://127.0.0.1:8768' } })).toBe(true);
    });
    test('only exact application documents are trusted', () => {
        const appDirectory = path.resolve(__dirname, '..');
        expect(policy.isTrustedDashboardIpcUrl(pathToFileURL(path.join(appDirectory, 'setup.html')).href, { port:8768, appDirectory })).toBe(true);
        for (const url of ['file:///C:/Temp/index.html','file:///C:/Temp/setup.html','http://localhost/','http://127.0.0.1:8768/untrusted.html','https://127.0.0.1:8768/']) {
            expect(policy.isTrustedDashboardIpcUrl(url,{port:8768,appDirectory})).toBe(false);
        }
    });
    test('privileged sender must be the expected main frame', () => {
        const frame = { url:'http://127.0.0.1:8768/' };
        const wc = { mainFrame:frame, isDestroyed:()=>false, getURL:()=>frame.url };
        const g = productionFunctions('FS25_FarmDashboard_App/main.js',['isTrustedDashboardIpcSender'], {
            mainWindow:{isDestroyed:()=>false,webContents:wc}, editionPolicy:policy, PORT:8768,
        });
        expect(g.isTrustedDashboardIpcSender({sender:wc,senderFrame:frame})).toBe(true);
        expect(g.isTrustedDashboardIpcSender({sender:wc,senderFrame:{url:frame.url}})).toBe(false);
        expect(g.isTrustedDashboardIpcSender({sender:{...wc},senderFrame:frame})).toBe(false);
    });
    test('secure import policy survives while secrets do not', () => {
        const row = policy.sanitizeClassicConfigForRf({servers:[{id:'test',mode:'ftp',ftpSecure:'explicit',ftpFtps:true,ftpAllowInsecureTls:false,httpFeedSecure:true,ftpPass:'synthetic',httpFeedCode:'synthetic'}]}).servers[0];
        expect(row).toMatchObject({ftpSecure:'explicit',ftpFtps:true,ftpAllowInsecureTls:false,httpFeedSecure:true});
        expect(row.ftpPass).toBeUndefined(); expect(row.httpFeedCode).toBeUndefined();
    });
    test.each(['ftpSecure','ftpFtps','ftpAllowInsecureTls','httpFeedSecure'])('policy-only change invalidates captured clients: %s', field => {
        const previous={servers:[{id:'test',mode:'ftp'}]};
        expect(config.configNeedsServerReboot(previous,{servers:[{...previous.servers[0],[field]:true}]})).toBe(true);
    });
    test.each(['animals_x\\..\\..\\outside.json','animals_../outside.json','animals_x:payload.json','animals_x%2foutside.json'])('reject hostile FTP name %p before download', async name => {
        const downloads=[];
        const f=productionFunctions('FS25_FarmDashboard_App/main.js',['syncFtpDetailsCache'], {
            fs:{promises:{mkdir:async()=>{}}},serverStates:{test:{lastSaveSlot:'savegame1'}},FTP_FILE_TYPE_DIRECTORY:2,
            pathExists:async()=>false,safeDownload:async(...args)=>{downloads.push(args);return true;},
            safeFsIdentity:require('../safeFsIdentity.cjs'),
        });
        await f.syncFtpDetailsCache({list:async()=>[{name,type:1,size:5}]},{id:'test'},'profile/savegame1',path.join(os.tmpdir(),'synthetic-root'));
        expect(downloads).toHaveLength(0);
    });
});

describe('last-good filesystem commit', () => {
    let root;
    beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'farmdash-commit-test-'));});
    afterEach(()=>{jest.restoreAllMocks();fs.rmSync(root,{recursive:true,force:true});});
    const client = body => ({downloadTo:async file=>fs.promises.writeFile(file,JSON.stringify(body))});
    test('failed async rename preserves final bytes', async()=>{
        const final=path.join(root,'data.json');fs.writeFileSync(final,'{"old":true}');
        jest.spyOn(fs.promises,'rename').mockRejectedValue(Object.assign(new Error('locked'),{code:'EACCES'}));
        expect(await fileCommit.downloadAndCommit(client({new:true}),'remote',final+'.tmp',final)).toBe(false);
        expect(fs.readFileSync(final,'utf8')).toBe('{"old":true}');
        expect(fs.readdirSync(root).some(n=>n.includes('.tmp.'))).toBe(true);
    });
    test('valid replacement succeeds on the real temporary filesystem',async()=>{
        const final=path.join(root,'data.json');fs.writeFileSync(final,'{"old":true}');
        expect(await fileCommit.downloadAndCommit(client({new:true}),'remote',final+'.tmp',final)).toBe(true);
        expect(JSON.parse(fs.readFileSync(final,'utf8'))).toEqual({new:true});
    });
    test('truncated JSON never replaces final',async()=>{
        const final=path.join(root,'data.json');fs.writeFileSync(final,'{"old":true}');
        expect(await fileCommit.downloadAndCommit({downloadTo:async file=>fs.promises.writeFile(file,'{"bad":')},'remote',final+'.tmp',final)).toBe(false);
        expect(fs.readFileSync(final,'utf8')).toBe('{"old":true}');
    });
    test('cancellation immediately before commit prevents obsolete bytes',async()=>{
        const final=path.join(root,'data.json');fs.writeFileSync(final,'{"old":true}');let active=true;
        const transfer={downloadTo:async file=>{await fs.promises.writeFile(file,'{"new":true}');active=false;}};
        expect(await fileCommit.downloadAndCommit(transfer,'remote',final+'.tmp',final,{canCommit:()=>active})).toBe(false);
        expect(fs.readFileSync(final,'utf8')).toBe('{"old":true}');
    });
    test('sync writer does not delete the last-good file on rename failure',()=>{
        const final=path.join(root,'requests.json');fs.writeFileSync(final,'{"old":true}');
        jest.spyOn(fs,'renameSync').mockImplementation(()=>{throw Object.assign(new Error('locked'),{code:'EPERM'});});
        expect(fileCommit.writeJsonAtomicSync(final,{new:true})).toBe(false);
        expect(fs.readFileSync(final,'utf8')).toBe('{"old":true}');
    });
});

describe('provenance and freshness regressions',()=>{
    const detail=productionFunctions('FS25_FarmDashboard_App/detailAnimalsHydrate.js',
        ['countCapturedHeads','hasUniqueIndividuals','husbandryAggregateHeadCount','shouldSkipIncompleteDetail','applyDetailBlockToHusbandry','makeCacheEntry','rememberDetailEntry'],
        {UNIQUE_CAPTURE_RATIO:.8});
    test('authoritative zero excludes retained detail',()=>{
        const result=detail.applyDetailBlockToHusbandry({id:7,animalCount:0,numOfAnimalsReported:0,clusters:[]},{ownerFarmId:1,animals:[{uniqueId:'old'}]});
        expect(result.husbandry.animals).toHaveLength(0);expect(result.hydrated).toBe(false);
    });
    test('missing count is not treated as zero',()=>{
        const result=detail.applyDetailBlockToHusbandry({id:7},{ownerFarmId:1,animals:[{uniqueId:'current'}]});
        expect(result.husbandry.animals).toHaveLength(1);
        expect(result.husbandry.animalCount).toBe(1);
        expect(result.husbandry.numOfAnimalsReported).toBe(1);
    });
    test('null numOfAnimalsReported is not coerced to an empty pen',()=>{
        const result=detail.applyDetailBlockToHusbandry(
            {id:7,animalCount:5,numOfAnimalsReported:null},
            {ownerFarmId:1,animals:[{uniqueId:'a'},{uniqueId:'b'},{uniqueId:'c'},{uniqueId:'d'},{uniqueId:'e'}]}
        );
        expect(result.hydrated).toBe(true);
        expect(result.husbandry.animals).toHaveLength(5);
        expect(result.husbandry.animalCount).toBe(5);
        expect(result.husbandry.numOfAnimalsReported).toBe(5);
    });
    test('detail generation survives caching',()=>{
        expect(detail.makeCacheEntry({mtimeMs:1,size:2},{placeableId:7,generatedAt:123},[]).generatedAt).toBe(123);
    });
    test('rememberDetailEntry keeps the longer unique-id list when timestamps match',()=>{
        const map=new Map();
        const long={placeableId:7,ownerFarmId:1,animals:[{uniqueId:'a'},{uniqueId:'b'},{uniqueId:'c'}]};
        const short={placeableId:7,ownerFarmId:1,animals:[{uniqueId:'a'}]};
        detail.rememberDetailEntry(map,long);
        detail.rememberDetailEntry(map,short);
        expect(map.get('7|1').animals).toHaveLength(3);
        const reversed=new Map();
        detail.rememberDetailEntry(reversed,short);
        detail.rememberDetailEntry(reversed,long);
        expect(reversed.get('7|1').animals).toHaveLength(3);
    });
    test('individual XML identity changes below maximum mtime',async()=>{
        let changed=1000;
        const fp=productionFunctions('FS25_FarmDashboard_App/xmlCollector.js',['getSavegameXmlFingerprint'], {
            getSavegamePathAsync:async()=>path.join(os.tmpdir(),'synthetic-xml'),SAVEGAME_XML_FILES:['a.xml','b.xml'],OPTIONAL_SAVEGAME_XML_FILES:[],
            fs:{stat:async file=>({mtimeMs:file.endsWith('a.xml')?9999:changed,size:100})},
        });
        const before=await fp.getSavegameXmlFingerprint({},'savegame1');changed=2000;
        expect(await fp.getSavegameXmlFingerprint({},'savegame1')).not.toBe(before);
    });
});

describe('HTTP total deadline and stream settlement',()=>{
    afterEach(()=>jest.useRealTimers());
    function setup() {
        const response=new EventEmitter();Object.assign(response,{statusCode:200,headers:{},complete:false,destroy:jest.fn()});
        const request=new EventEmitter();request.destroy=jest.fn();
        const transport={get:(_url,_options,callback)=>{queueMicrotask(()=>callback(response));return request;}};
        const mod=productionFunctions('FS25_FarmDashboard_App/httpFeedXml.js',['httpGetBuffer'],{
            http:transport,https:transport,HTTP_FEED_MAX_HOPS:5,HTTP_FEED_MAX_BYTES:1024,HTTP_FEED_DEADLINE_MS:45000,
        });
        return {response,request,mod};
    }
    test('continuous traffic cannot extend the absolute 45 second timer',async()=>{
        jest.useFakeTimers({doNotFake:['queueMicrotask']});const {response,mod}=setup();
        const result=mod.httpGetBuffer('http://synthetic.invalid/feed').catch(error=>error);
        await Promise.resolve();
        for(let i=0;i<4;i++){jest.advanceTimersByTime(10000);response.emit('data',Buffer.from('x'));}
        jest.advanceTimersByTime(5000);
        expect((await result).message).toMatch(/total deadline/);expect(jest.getTimerCount()).toBe(0);
    });
    test.each(['aborted','close'])('body %s settles instead of hanging',async event=>{
        const {response,mod}=setup();const result=mod.httpGetBuffer('http://synthetic.invalid/feed').catch(error=>error);
        await Promise.resolve();response.emit(event);expect((await result).message).toMatch(/aborted|closed/);
    });
    test('cross-origin redirects are rejected',async()=>{
        const {response,mod}=setup();response.statusCode=302;response.headers.location='https://outside.invalid/?code=synthetic';
        const result=await mod.httpGetBuffer('http://synthetic.invalid/feed').catch(error=>error);
        expect(result.message).toMatch(/cross-origin/);
    });
});

