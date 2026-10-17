const fs=require('node:fs'),path=require('node:path');
const {root,assert,equal,sourceHash,save,invoke,read,rpc,receipt}=require('./transport.cjs');
const {config,reports,manifest,initial,replay,plan}=require('./proof-checks.cjs');
async function main(){
 assert(await rpc('eth_chainId',[])==='0xf22f','Gasless StudioNet only');
 const accounts=JSON.parse(process.env.DELTA_ACCOUNTS||'null');assert(accounts?.length===2,'Two public participant accounts');
 const revision=fs.readFileSync(path.join(root,'config/fixture-revision.txt'),'utf8').trim();assert(/^[a-f0-9]{40}$/.test(revision),'Pinned fixture revision');
 const deployments=[];
 for(const name of Object.keys(config)){
  const rows=reports(name,revision);
  for(const r of rows){const response=await fetch(r.url,{signal:AbortSignal.timeout(45000)});assert(response.ok&&Buffer.from(await response.arrayBuffer()).equals(Buffer.from(r.text)),'Public fixture bytes');}
  process.env.DELTA_ACCOUNT=accounts[0].name;
  const hash=await invoke(name+'-deployment',['deploy','--contract','contracts/delta_bisect.py','--args',JSON.stringify(rows.map(r=>r.question)),JSON.stringify(rows.map(r=>r.url)),JSON.stringify(rows.map(r=>r.sha256)),JSON.stringify(accounts.map(a=>a.address)),'7200']);
  const receiptValue=await receipt(name+'-deployment',hash,true),contract=receiptValue.to_address||receiptValue.recipient;
  assert(/^0x[a-f0-9]{40}$/i.test(contract),'Contract address');
  assert(fs.readFileSync(path.join(root,'contracts/delta_bisect.py')).equals(Buffer.from(await rpc('gen_getContractCode',[contract]),'base64')),'Exact deployed source');
  const d={name,contract,transaction:hash,reports:rows,fixture_revision:revision,source_sha256:sourceHash,network:'studionet',chain_id:61999,callers:accounts.map(a=>a.address)};
  deployments.push(d);save('deployments',deployments);
  let state=await read(name+'-initial',['call',contract,'get_state']);assert(equal(state,initial(d,state.deadline))&&state.deadline>0,'Fresh game and domain');save(name+'-initial-state',state);
  const trace=[];
  async function step(item,success=true,reason=null){
   process.env.DELTA_ACCOUNT=accounts[item.caller].name;
   const before=state,args=['write',contract,item.method];if(item.args.length)args.push('--args',...item.args.map(String));
   const tx=await invoke(item.label,args),r=await receipt(item.label,tx,success);state=await read(item.label+'-state',['call',contract,'get_state']);
   assert((r.from_address||r.sender).toLowerCase()===d.callers[item.caller],'Actual participant signer');
   if(success)replay(before,item.method,item.args,d.callers[item.caller],state,d);
   else{assert(equal(before,state),'Rejected move changed state');const decoded=await read(item.label+'-decoded',['receipt',tx,'--status','FINALIZED','--retries','2']);assert(JSON.stringify(decoded).includes(reason),'Exact rejection');save(item.label+'-decoded-receipt',decoded);}
   const p={...item,contract,transaction:tx,sender:d.callers[item.caller],success,reason,state_before:before,state};trace.push(p);save(item.label,p);save(name+'-trace',trace);
  }
  const moves=plan(d);
  for(const item of moves){
   await step(item);
   if(name==='corrected'&&item.label==='corrected-root-0')await step({label:'duplicate-root',method:'commit_root',args:[item.args[0]],caller:0},false,'[EXPECTED] Root already committed');
   if(name==='corrected'&&item.label==='corrected-root-1')await step({label:'bad-opening',method:'open_node',args:[0,'a'.repeat(64),'b'.repeat(64)],caller:1},false,'[EXPECTED] Incorrect node opening');
  }
  if(name==='corrected')await step({label:'repeat-resolution',method:'resolve',args:[],caller:0},false,'[EXPECTED] Leaf is not ready');
  save(name+'-final-state',state);console.log('VERIFIED',name,contract,state.stage);
 }
}
main().catch(e=>{console.error(e.stack,e.cause?.message||'');process.exitCode=1;});
