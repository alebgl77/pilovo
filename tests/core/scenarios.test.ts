import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { HubRepository } from '../../src/domain/repository';
import { taskKey } from '../../src/shared/protocol';
import type { AgentEvent, EventType, SourceId } from '../../src/shared/types';

// 100 synthetic reliability scenarios: two adapters × ten histories × five delivery conditions.
// This exercises protocol/domain reliability, not real CLI connectivity or user activation.
const paths: { name: string; events: EventType[]; final: string }[] = [
  {name:'complete',events:['task.started','task.completed'],final:'completed'},
  {name:'progress-complete',events:['task.started','task.progress','task.completed'],final:'completed'},
  {name:'wait-resume-complete',events:['task.started','task.waiting','task.progress','task.completed'],final:'completed'},
  {name:'repeat-wait',events:['task.started','task.waiting','task.waiting'],final:'waiting_input'},
  {name:'failure',events:['task.started','task.progress','task.failed'],final:'failed'},
  {name:'wait-failure',events:['task.started','task.waiting','task.failed'],final:'failed'},
  {name:'cancel',events:['task.started','task.cancelled'],final:'cancelled'},
  {name:'wait-cancel',events:['task.started','task.waiting','task.cancelled'],final:'cancelled'},
  {name:'partial-completion',events:['task.completed'],final:'completed'},
  {name:'partial-running',events:['task.progress','task.waiting','task.progress'],final:'running'},
];
const conditions=['ordered','duplicates','late-replay','gaps','disconnect'] as const;
const cases=(['claude-code','codex'] as SourceId[]).flatMap(source=>paths.flatMap(path=>conditions.map(condition=>({source,path,condition,name:`${source}/${path.name}/${condition}`}))));
describe('100-case protocol reliability matrix',()=>{
  it.each(cases)('$name',async({source,path,condition})=>{
    const timestamp='2026-10-09T00:00:00.000Z';const db=new HubRepository(crypto.randomUUID(),()=>Date.parse(timestamp));
    const events=path.events.map((type,index):AgentEvent=>({schemaVersion:1,eventId:crypto.randomUUID(),sourceId:source,taskId:'matrix-task',runId:'matrix-run',sequence:(index+1)*(condition==='gaps'?2:1),timestamp,type,payload:{title:'Synthetic protocol fixture',question:type==='task.waiting'?'Synthetic question':undefined}}));
    try {
      await db.setConnection(source,'online');
      for(const event of events){expect((await db.ingest(source,event)).status).toBe('accepted');if(condition==='duplicates')expect((await db.ingest(source,event)).status).toBe('duplicate');}
      if(condition==='late-replay')expect((await db.ingest(source,{...events[0],eventId:crypto.randomUUID()})).status).toBe('rejected');
      if(condition==='disconnect')await db.setConnection(source,'disconnected');
      const task=await db.getTask(taskKey(source,'matrix-task','matrix-run'));
      expect(task.execution).toBe(path.final);expect(task.verification.status).toBe('unverified');expect(task.review.status).toBe('pending');expect(task.eventCount).toBe(events.length);
      expect(task.connection).toBe(condition==='disconnect'?'disconnected':'online');
      if(condition==='gaps'||condition==='late-replay'||path.name.startsWith('partial'))expect(task.uncertainty).toBe(true);
      expect((await db.getTaskEvents(task.key)).map(e=>e.sequence)).toEqual(events.map(e=>e.sequence));
    } finally {await db.close();}
  });
});
