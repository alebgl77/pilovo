import { chromium } from '@playwright/test';
import { readFile, writeFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
const arg=name=>{const index=process.argv.indexOf(name);if(index<0)throw new Error(`Missing ${name}`);return path.resolve(process.argv[index+1]);};
const run=arg('--run');const claudeEvidence=arg('--claude-evidence');const codexEvidence=arg('--codex-evidence');
const owned=path.resolve('../work/browser-acceptance-owned');if(!run.startsWith(owned+path.sep))throw new Error('Owned test run required.');
const testExtension=path.join(run,'test-extension');const oldManifest=JSON.parse(await readFile(path.join(testExtension,'manifest.json'),'utf8'));await cp('dist',testExtension,{recursive:true});await writeFile(path.join(testExtension,'manifest.json'),JSON.stringify(oldManifest,null,2));
const record={startedAt:new Date().toISOString(),permissionVariant:'test-only required nativeMessaging and tabs; production optional grant remains manual',checks:[],errors:[],registryCleanup:false};
const log=(name,detail={})=>{record.checks.push({name,...detail});console.log(JSON.stringify({check:name,...detail}));};
const registration=path.join(run,'companion-install','dev.agentcontrolhub.bridge.json');
const registry=action=>{const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/e2e/register-owned.ps1'),'-Action',action,'-ManifestPath',registration],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr.trim().slice(0,1000));};
const expected=[];for(const file of [claudeEvidence,codexEvidence]){const proof=JSON.parse(await readFile(file,'utf8'));for(const item of proof.results){if(item.outcome==='signed_start_and_completion_observed')expected.push(item);}}
assert.deepEqual(expected.map(item=>item.source).sort(),['claude-code','codex']);
let context;let registered=false;const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Live source navigation fixture</title><h1>Explicitly attached synthetic context</h1>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const fixture=`http://127.0.0.1:${server.address().port}/`;
try{
 registry('register');registered=true;
 context=await chromium.launchPersistentContext(path.join(run,'browser-profile'),{executablePath:process.env.CHROME_PATH || chromium.executablePath(),headless:true,args:[`--disable-extensions-except=${testExtension}`,`--load-extension=${testExtension}`]});
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const extensionId=new URL(worker.url()).host;record.extensionId=extensionId;record.chromiumVersion=context.browser().version();
 const page=await context.newPage();await page.goto(`chrome-extension://${extensionId}/index.html`);
 const rpc=request=>page.evaluate(request=>chrome.runtime.sendMessage({channel:'hub.rpc',request}),request);
 const data=async request=>{const response=await rpc(request);assert.equal(response.ok,true,JSON.stringify(response));return response.data;};
 await page.getByRole('button',{name:'Connexions',exact:true}).click();await page.getByRole('button',{name:'Connecter le compagnon',exact:true}).click();
 const deadline=Date.now()+20000;let snapshot;while(Date.now()<deadline){snapshot=await data({method:'getSnapshot'});if(expected.every(item=>snapshot.tasks.some(task=>task.sourceId===item.source&&task.taskId===item.taskId&&task.runId===item.runId&&task.execution==='completed')))break;await new Promise(resolve=>setTimeout(resolve,100));}
 const mission=await data({method:'createMission',title:'Live CLI end-to-end acceptance — synthetic workload'});const tab=await context.newPage();await tab.goto(fixture);
 for(const item of expected){
  const task=snapshot.tasks.find(task=>task.sourceId===item.source&&task.taskId===item.taskId&&task.runId===item.runId);assert.ok(task,`${item.source} exact real CLI task missing`);assert.equal(task.execution,'completed');assert.equal(task.verification.status,'unverified');assert.equal(task.eventCount,2);
  const events=await data({method:'getTaskEvents',key:task.key});assert.deepEqual(events.map(event=>event.eventId),item.eventIds);assert.deepEqual(events.map(event=>event.type),['task.started','task.completed']);
  await data({method:'assignTask',key:task.key,missionId:mission.id});await tab.bringToFront();await data({method:'attachActiveTab',key:task.key});await data({method:'focusTaskTab',key:task.key});
  log('real-cli-to-chrome-receipt-and-validated-navigation',{source:item.source,cliVersion:item.cliVersion,key:task.key,eventIds:item.eventIds,execution:task.execution,verification:task.verification.status,sourceEvidence:item.source==='claude-code'?claudeEvidence:codexEvidence,context:'Explicit synthetic HTTP fixture attached by the user; no CLI terminal focus claim'});
 }
 const latest=await data({method:'getSnapshot'});assert.equal(latest.missions.find(item=>item.id===mission.id).taskKeys.length,2);log('both-real-cli-results-grouped-in-one-mission');
 await page.getByRole('button',{name:'Missions',exact:true}).click();await page.getByRole('button',{name:mission.title,exact:false}).click();await page.screenshot({path:path.join(run,'both-live-cli-receipts.png'),fullPage:true});
 await data({method:'disconnectBridge'});log('disconnect-preserves-both-live-receipts');record.completedAt=new Date().toISOString();
}catch(error){record.errors.push({message:String(error)});console.error(error);process.exitCode=1;}finally{
 if(context)await context.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));if(registered){try{registry('unregister');record.registryCleanup=true;}catch(error){record.errors.push({cleanup:String(error)});process.exitCode=1;}}
 await writeFile(path.join(run,'both-live-cli-evidence.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({evidence:path.join(run,'both-live-cli-evidence.json'),checks:record.checks.length,errors:record.errors.length,registryCleanup:record.registryCleanup}));
}
