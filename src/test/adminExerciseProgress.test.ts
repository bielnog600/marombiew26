import { describe, it, expect } from 'vitest';
import { exerciseProgress, type ActivityHistoryLog } from '@/lib/adminExerciseProgress';
const start = '2026-10-29T09:28:00Z';
const rows = (name: string, weight: number, reps: number): ActivityHistoryLog[] => [{ exercise_name:name, session_id:'old-other-plan', performed_at:'2026-10-26T09:00:00Z', weight_kg:weight, reps, set_number:1 }];
const done = (weight:number,reps:number) => [{weight,reps,completed:true}];
describe('admin exercise progression',()=>{
  it('compares 50 to 60 kg across any plan/day and detects a load PR',()=>{
    const p=exerciseProgress('CADEIRA FLEXORA',done(60,12),rows('CADEIRA FLEXORA',50,15),'today',start);
    expect(p.status).toBe('up'); expect(p.loadDelta).toBe(10); expect(p.loadPercent).toBe(20); expect(p.recordLoad).toBe(true);
    expect(p.lastVolume).toBe(750); expect(p.todayVolume).toBe(720);
  });
  it('compares 10/10 unilateral reps as 10 and shows +2 at 10 kg',()=>{
    const old=rows('BÚLGARO',10,10); old[0].reps='10/10';
    const p=exerciseProgress('BÚLGARO',done(10,12),old,'today',start);
    expect(p.status).toBe('up'); expect(p.repsDelta).toBe(2);
  });
  it('marks first performance without inventing a past PR',()=>{
    const p=exerciseProgress('AGACHAMENTO LIVRE',done(20,12),[],'today',start);
    expect(p.status).toBe('first'); expect(p.recordLoad).toBe(false);
  });
  it('checks the 8/7/6 prescription independently per performed set',()=>{
    const p=exerciseProgress('AGACHAMENTO LIVRE',[...done(20,12),...done(20,12),...done(20,10)],[],'today',start,{reps:'8/7/6'});
    expect(p.alerts).toEqual([{set:1,kind:'above'},{set:2,kind:'above'},{set:3,kind:'above'}]);
  });
  it('does not compare mobility or recognition sets',()=>{
    expect(exerciseProgress('MOBILIDADE QUADRIL',done(0,15),[],'today',start).status).toBe('excluded');
    const p=exerciseProgress('CADEIRA FLEXORA',[{...done(100,12)[0],set_type:'recognition'}],rows('CADEIRA FLEXORA',50,15),'today',start);
    expect(p.status).toBe('pending'); expect(p.recordLoad).toBe(false);
  });
  it('compares method primary parts while retaining full recorded volume',()=>{
    const p=exerciseProgress('REMADA',[{weight:60,reps:12,completed:true,subRecords:[{weight:60,reps:12},{weight:45,reps:15},{weight:34,reps:20}]}],rows('REMADA',50,12),'today',start);
    expect(p.loadDelta).toBe(10); expect(p.todayVolume).toBe(2075);
  });
  it('ignores current/future logs and distinguishes maintained and decreased performance',()=>{
    const history=[...rows('REMADA',50,12),{...rows('REMADA',100,12)[0],session_id:'today'}];
    expect(exerciseProgress('REMADA',done(50,12),history,'today',start).status).toBe('same');
    expect(exerciseProgress('REMADA',done(50,10),history,'today',start).status).toBe('down');
  });
});