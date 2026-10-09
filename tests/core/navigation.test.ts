import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubRepository } from '../../src/domain/repository';
import { TaskNavigation, createChromeTab, type BrowserNavigation } from '../../src/platform/navigation';
import { taskKey } from '../../src/shared/protocol';

let repo: HubRepository;let navigation:TaskNavigation;let browser:BrowserNavigation;
const key=taskKey('codex','task','run');
beforeEach(async()=>{
  repo=new HubRepository(crypto.randomUUID());await repo.ingest('codex',{schemaVersion:1,eventId:crypto.randomUUID(),sourceId:'codex',taskId:'task',runId:'run',sequence:1,timestamp:new Date().toISOString(),type:'task.waiting',payload:{question:'Input required',contextUrl:'https://example.com/task'}});
  browser={hasTabsPermission:vi.fn().mockResolvedValue(true),getSessionNonce:vi.fn().mockResolvedValue('session-a'),activeTab:vi.fn().mockResolvedValue({id:42,windowId:3,url:'https://example.com/task'}),getTab:vi.fn().mockResolvedValue({id:42,windowId:3,url:'https://example.com/task'}),focusTab:vi.fn().mockResolvedValue(undefined),focusWindow:vi.fn().mockResolvedValue(undefined),createTab:vi.fn().mockResolvedValue({id:42,windowId:3,url:'https://example.com/task'})};navigation=new TaskNavigation(repo,browser);
});
afterEach(()=>repo.close());
describe('explicit navigation binding',()=>{
  it('focuses validated tab/window without clearing intervention or execution',async()=>{await navigation.attachActiveTab(key);await navigation.focusTaskTab(key);expect(browser.focusTab).toHaveBeenCalledWith(42);expect(browser.focusWindow).toHaveBeenCalledWith(3);expect(await repo.getTask(key)).toMatchObject({execution:'waiting_input',question:'Input required'});});
  it('rejects reused tab after browser session restart',async()=>{await navigation.attachActiveTab(key);vi.mocked(browser.getSessionNonce).mockResolvedValue('session-b');await expect(navigation.focusTaskTab(key)).rejects.toMatchObject({code:'navigation.expired'});expect(browser.focusTab).not.toHaveBeenCalled();});
  it('rejects closed tab without reopening or rerunning',async()=>{await navigation.attachActiveTab(key);vi.mocked(browser.getTab).mockRejectedValue(new Error('No tab'));await expect(navigation.focusTaskTab(key)).rejects.toMatchObject({code:'navigation.closed'});expect(browser.createTab).not.toHaveBeenCalled();expect(browser.focusTab).not.toHaveBeenCalled();});
  it('rejects changed URL even within same origin',async()=>{await navigation.attachActiveTab(key);vi.mocked(browser.getTab).mockResolvedValue({id:42,windowId:3,url:'https://example.com/other'});await expect(navigation.focusTaskTab(key)).rejects.toMatchObject({code:'navigation.changed'});expect(browser.focusTab).not.toHaveBeenCalled();});
  it('rejects moved/reused window binding',async()=>{await navigation.attachActiveTab(key);vi.mocked(browser.getTab).mockResolvedValue({id:42,windowId:4,url:'https://example.com/task'});await expect(navigation.focusTaskTab(key)).rejects.toMatchObject({code:'navigation.changed'});});
  it('honors permission revocation on each action while preserving deletability',async()=>{await navigation.attachActiveTab(key);vi.mocked(browser.hasTabsPermission).mockResolvedValue(false);await expect(navigation.focusTaskTab(key)).rejects.toMatchObject({code:'permission.denied'});await expect(navigation.attachActiveTab(key)).rejects.toMatchObject({code:'permission.denied'});await expect(navigation.openTaskContext(key)).rejects.toMatchObject({code:'permission.denied'});await repo.deleteTask(key);expect((await repo.snapshot()).tasks).toEqual([]);});
  it('requires binding and refuses privileged active pages',async()=>{await expect(navigation.focusTaskTab(key)).rejects.toMatchObject({code:'navigation.unbound'});vi.mocked(browser.activeTab).mockResolvedValue({id:9,windowId:3,url:'chrome://settings'});await expect(navigation.attachActiveTab(key)).rejects.toMatchObject({code:'navigation.unsafe'});});
  it('opens source context only via separate explicit action',async()=>{await navigation.openTaskContext(key);expect(browser.createTab).toHaveBeenCalledWith('https://example.com/task');expect((await repo.getTask(key)).tabBinding?.tabId).toBe(42);expect((await repo.exportData()).tasks[0].tabBinding).toBeUndefined();});
  it('waits for a committed URL after real Chrome returns pendingUrl, then removes listeners',async()=>{
    const updates=new Set<Function>(),removals=new Set<Function>();
    vi.stubGlobal('chrome',{tabs:{create:vi.fn().mockResolvedValue({id:4,windowId:1,pendingUrl:'https://example.com/task'}),get:vi.fn().mockResolvedValue({id:4,windowId:1,url:'about:blank',status:'loading'}),onUpdated:{addListener:(fn:Function)=>updates.add(fn),removeListener:(fn:Function)=>updates.delete(fn)},onRemoved:{addListener:(fn:Function)=>removals.add(fn),removeListener:(fn:Function)=>removals.delete(fn)}}});
    const promise=createChromeTab('https://example.com/task');await vi.waitFor(()=>expect(updates.size).toBe(1));
    updates.forEach(fn=>fn(4,{url:'https://example.com/task'},{id:4,windowId:1,url:'https://example.com/task',status:'loading'}));expect((await promise).id).toBe(4);expect(updates.size).toBe(0);expect(removals.size).toBe(0);vi.unstubAllGlobals();
  });
  it('cleans listeners when the newly created tab closes before navigation',async()=>{
    const updates=new Set<Function>(),removals=new Set<Function>();
    vi.stubGlobal('chrome',{tabs:{create:vi.fn().mockResolvedValue({id:4,windowId:1}),get:vi.fn().mockResolvedValue({id:4,windowId:1}),onUpdated:{addListener:(fn:Function)=>updates.add(fn),removeListener:(fn:Function)=>updates.delete(fn)},onRemoved:{addListener:(fn:Function)=>removals.add(fn),removeListener:(fn:Function)=>removals.delete(fn)}}});
    const promise=createChromeTab('https://example.com/task');const result=expect(promise).rejects.toMatchObject({code:'navigation.closed'});await vi.waitFor(()=>expect(removals.size).toBe(1));removals.forEach(fn=>fn(4));await result;expect(updates.size).toBe(0);expect(removals.size).toBe(0);vi.unstubAllGlobals();
  });
});
