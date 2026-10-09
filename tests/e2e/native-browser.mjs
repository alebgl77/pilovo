import { chromium } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('../work/browser-acceptance-owned');await mkdir(root,{recursive:true});
const sourceInstallArg=process.argv.indexOf('--source-install');
const sourceInstall=sourceInstallArg>=0?path.resolve(process.argv[sourceInstallArg+1]):undefined;
if(sourceInstall&&!sourceInstall.startsWith(root+path.sep))throw new Error('Source installation must be in the owned acceptance directory.');
const run=path.join(root,`run-${Date.now()}`);await mkdir(run);
const testExtension=path.join(run,'test-extension');await cp('dist',testExtension,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(testExtension,'manifest.json'),'utf8'));
manifest.permissions=[...new Set([...manifest.permissions,'nativeMessaging','tabs'])];delete manifest.optional_permissions;
await writeFile(path.join(testExtension,'manifest.json'),JSON.stringify(manifest,null,2));
const evidence={startedAt:new Date().toISOString(),testOnlyManifestDifference:{requiredPermissionsAdded:['nativeMessaging','tabs'],optionalPermissionsRemoved:['nativeMessaging','tabs']},productionPermissionPrompt:'Trusted real UI request triggered separately; headless Chromium did not grant permission. Acceptance remains manual.',checks:[],errors:[],registryCleanup:false};
const record=(name,detail={})=>{evidence.checks.push({name,...detail});console.log(JSON.stringify({check:name,...detail}));};
const save=()=>writeFile(path.join(run,'evidence.json'),JSON.stringify(evidence,null,2));
const command=(script,args)=>{const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr.trim().slice(0,1000)||`PowerShell exit ${result.status}`);return result.stdout.trim();};
const executablePath=process.env.CHROME_PATH || chromium.executablePath();
const profile=path.join(run,'browser-profile');
const launch=()=>chromium.launchPersistentContext(profile,{executablePath,headless:true,args:[`--disable-extensions-except=${testExtension}`,`--load-extension=${testExtension}`]});
let context;let page;let registration;const clients=[];
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><head><title>Hub test context</title></head><body><h1>Synthetic navigation fixture</h1><p>${req.url==='/changed'?'Changed URL':'Original task context'}</p></body></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const fixture=`http://127.0.0.1:${server.address().port}/context`;
async function rpc(request){return page.evaluate(request=>chrome.runtime.sendMessage({channel:'hub.rpc',request}),request);}
async function data(request){const result=await rpc(request);assert.equal(result.ok,true,JSON.stringify(result));return result.data;}
async function until(check,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Timeout: ${label}`);}
try{
 context=await launch();const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const extensionId=new URL(worker.url()).host;evidence.extensionId=extensionId;
 page=await context.newPage();await page.goto(`chrome-extension://${extensionId}/index.html`);await page.getByRole('button',{name:'Connexions',exact:true}).click();
 assert.deepEqual((await data({method:'getSnapshot'})).tasks,[]);record('real-mv3-serviceworker-empty-indexeddb',{extensionId});
 const install=path.join(run,'companion-install');
 command(path.resolve('scripts/install-companion.ps1'),['-ExtensionId',extensionId,'-InstallDirectory',install,'-NodeExecutable',process.execPath,'-BundleDirectory',path.resolve('companion-dist'),'-PrepareOnly']);
 if(sourceInstall){const existing=JSON.parse(await readFile(path.join(sourceInstall,'host-config.json'),'utf8'));const generated=JSON.parse(await readFile(path.join(install,'host-config.json'),'utf8'));generated.dataDirectory=existing.dataDirectory;generated.secrets=existing.secrets;await writeFile(path.join(install,'host-config.json'),JSON.stringify(generated));record('reuse-owned-live-cli-outbox',{sourceInstall});}
 registration=path.join(install,'dev.agentcontrolhub.bridge.json');
 command(path.resolve('tests/e2e/register-owned.ps1'),['-Action','register','-ManifestPath',registration]);record('temporary-native-host-registration',{scope:'HKCU exact owned manifest, preexisting registration forbidden'});
 await writeFile(path.join(root,'active-run.json'),JSON.stringify({run,install,sourceInstall:sourceInstall??install,extensionId,fixture,hostConfig:path.join(install,'host-config.json'),claudeConfig:path.join(sourceInstall??install,'claude-code-config.json'),codexConfig:path.join(sourceInstall??install,'codex-config.json')},null,2));
 await page.getByRole('button',{name:'Connecter le compagnon',exact:true}).click();
 await until(async()=>(await data({method:'getSnapshot'})).bridgeStatus==='connected','native host connected');record('chrome-connectNative-launched-actual-host');
 const mission=await data({method:'createMission',title:'Synthetic multi-source native acceptance'});
 for(const sourceId of ['claude-code','codex']){
  const client=new Client({name:'browser-acceptance',version:'1.0.0'});const transport=new StdioClientTransport({command:process.execPath,args:[path.join(install,`${sourceId}.cjs`),'--config',path.join(sourceInstall??install,`${sourceId}-config.json`)],stderr:'pipe'});clients.push(client);await client.connect(transport);
  const started=await client.callTool({name:'hub_start_task',arguments:{title:`Native browser ${sourceId}`,missionId:mission.id,contextUrl:fixture}});assert.equal(started.isError,undefined);const handle=JSON.parse(started.content[0].text).taskHandle;
  const waiting=await client.callTool({name:'hub_ask_question',arguments:{taskHandle:handle,question:'Synthetic question: confirm in original agent.'}});assert.equal(waiting.isError,undefined);
  await until(async()=>(await data({method:'getSnapshot'})).tasks.some(t=>t.sourceId===sourceId&&t.execution==='waiting_input'),`${sourceId} waiting receipt`);
  const complete=await client.callTool({name:'hub_complete_task',arguments:{taskHandle:handle,summary:'Synthetic SDK-to-native transport acceptance.',artifacts:[{kind:'link',label:'Fixture context',url:fixture}]}});assert.equal(complete.isError,undefined);
 }
 await until(async()=>(await data({method:'getSnapshot'})).tasks.filter(t=>t.title.startsWith('Native browser ')&&t.execution==='completed').length===2,'both native receipts');
 let snapshot=await data({method:'getSnapshot'});assert.equal(snapshot.missions[0].taskKeys.length,2);assert.ok(snapshot.tasks.every(t=>t.verification.status==='unverified'&&t.review.status==='pending'));record('two-independent-mcp-adapters-native-receipts',{sources:snapshot.tasks.filter(t=>t.title.startsWith('Native browser ')).map(t=>t.sourceId),eventCount:snapshot.tasks.filter(t=>t.title.startsWith('Native browser ')).reduce((n,t)=>n+t.eventCount,0),realCliModels:false});
 const liveTasks=snapshot.tasks.filter(t=>!t.title.startsWith('Native browser '));if(liveTasks.length)record('additional-source-receipts',{tasks:liveTasks.map(t=>({key:t.key,title:t.title,sourceId:t.sourceId,execution:t.execution,eventCount:t.eventCount,verification:t.verification.status}))});
 const selected=snapshot.tasks.find(t=>t.title.startsWith('Native browser '));const taskEvents=await data({method:'getTaskEvents',key:selected.key});assert.deepEqual(taskEvents.map(e=>e.type),['task.started','task.waiting','task.completed']);
 const fixtureTab=await context.newPage();await fixtureTab.goto(fixture);await fixtureTab.bringToFront();await data({method:'attachActiveTab',key:selected.key});await data({method:'focusTaskTab',key:selected.key});record('actual-tab-attach-and-focus');
 await fixtureTab.goto(fixture.replace('/context','/changed'));assert.equal((await rpc({method:'focusTaskTab',key:selected.key})).error.code,'navigation.changed');record('changed-tab-url-rejected');
 await fixtureTab.goto(fixture);await fixtureTab.bringToFront();await data({method:'attachActiveTab',key:selected.key});await fixtureTab.close();assert.equal((await rpc({method:'focusTaskTab',key:selected.key})).error.code,'navigation.closed');record('closed-tab-rejected-without-reopen');
 await data({method:'openTaskContext',key:selected.key});record('explicit-context-open-and-bind');
 await data({method:'reviewTask',key:selected.key,status:'accepted',comment:'Synthetic human review'});assert.equal((await data({method:'getSnapshot'})).tasks.find(t=>t.key===selected.key).verification.status,'unverified');record('human-review-not-verification');
 const cdp=await context.newCDPSession(page);const targets=await cdp.send('Target.getTargets');const workerTarget=targets.targetInfos.find(target=>target.type==='service_worker'&&target.url.startsWith(`chrome-extension://${extensionId}/`));
 if(workerTarget){const stopped=await cdp.send('Target.closeTarget',{targetId:workerTarget.targetId});assert.equal(stopped.success,true);await until(async()=>(await data({method:'getSnapshot'})).tasks.some(t=>t.key===selected.key),'worker restart persisted tasks');record('serviceworker-target-restart-preserves-receipts');}else throw new Error('Service worker target missing');
 await context.close();context=await launch();page=await context.newPage();await page.goto(`chrome-extension://${extensionId}/index.html`);await until(async()=>(await data({method:'getSnapshot'})).tasks.some(t=>t.key===selected.key),'browser restart durable IDB');assert.equal((await rpc({method:'focusTaskTab',key:selected.key})).error.code,'navigation.expired');record('browser-restart-preserves-receipts-expires-tab-nonce');
 await page.screenshot({path:path.join(run,'native-receipts.png'),fullPage:true});
 await data({method:'disconnectBridge'});assert.equal((await data({method:'getSnapshot'})).bridgeStatus,'disabled');record('explicit-native-disconnect-preserves-history');
 evidence.completedAt=new Date().toISOString();await save();
}catch(error){evidence.errors.push({message:error instanceof Error?error.message:String(error)});await save();process.exitCode=1;console.error(error);}finally{
 for(const client of clients)await client.close().catch(()=>{});
 if(context)await context.close().catch(()=>{});
 await new Promise(resolve=>server.close(resolve));
 if(registration){try{command(path.resolve('tests/e2e/register-owned.ps1'),['-Action','unregister','-ManifestPath',registration]);evidence.registryCleanup=true;}catch(error){evidence.errors.push({cleanup:String(error)});process.exitCode=1;}}
 await save();console.log(JSON.stringify({evidence:path.join(run,'evidence.json'),checks:evidence.checks.length,errors:evidence.errors.length,registryCleanup:evidence.registryCleanup}));
}
