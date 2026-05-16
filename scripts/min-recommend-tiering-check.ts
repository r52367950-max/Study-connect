import { RecommendationsService } from '../src/modules/materials/recommendations.service';

function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

function svc(viewEventCount:number, schoolCount:number, onboardedAt: Date | null, optIn=true) {
  const prisma:any = {
    viewEvent: { count: async ()=>viewEventCount, groupBy: async ()=>[] },
    user: { count: async ()=>schoolCount },
  };
  return new RecommendationsService(prisma);
}

async function run(){
  const baseUser:any={id:'u',subjects:['数学'],grades:['高一'],stages:['高中'],city:null,viewedKinds:[],schoolId:'s1',collaborativeOptIn:true,onboardedAt:new Date()};
  assert((await svc(0,20,null).pickStrategy({...baseUser,onboardedAt:null},{viewEventCount:0}))==='phase-0','phase-0');
  assert((await svc(10,20,new Date()).pickStrategy(baseUser,{viewEventCount:10}))==='phase-1','phase-1');
  assert((await svc(20,5,new Date()).pickStrategy(baseUser,{viewEventCount:20}))==='phase-2','phase-2 density low');
  assert((await svc(20,12,new Date()).pickStrategy(baseUser,{viewEventCount:20}))==='phase-3','phase-3');
  assert((await svc(20,12,new Date()).pickStrategy({...baseUser,collaborativeOptIn:false},{viewEventCount:20}))==='phase-2','phase-2 optout');
  console.log('min-recommend-tiering-check passed');
}
run().catch(e=>{console.error(e);process.exit(1)});
