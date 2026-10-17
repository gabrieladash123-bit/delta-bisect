const fs=require('node:fs'),path=require('node:path');
const {root,assert,equal,digest,rpc,read,receiptSummary,save}=require('./transport.cjs');
const {config,reports,initial,replay,plan}=require('./proof-checks.cjs');
const load=n=>JSON.parse(fs.readFileSync(path.join(root,'proofs',n+'.json')));
async function main(){
 const offline=process.argv.includes('--offline'),deployments=load('deployments'),code=fs.readFileSync(path.join(root,'contracts/delta_bisect.py')),journal=load('transactions');
 assert(equal(deployments.map(d=>d.name),Object.keys(config))&&journal.source_sha256===digest(code),'Complete source-bound deployment set');
 if(!offline)assert(await rpc('eth_chainId',[])==='0xf22f','StudioNet chain');
 const hashes=new Set(),summary={mode:offline?'offline-artifact':'fresh-rpc-and-state',source_sha256:digest(code),contracts:[],transactions:[]};
 async function verify(label,hash,d,success,sender){
  assert(!hashes.has(hash)&&journal.hashes[label]===hash,'Unique journal transaction');hashes.add(hash);
  const saved=load(label+'-receipt'),r=offline?saved:await rpc('eth_getTransactionByHash',[hash]),s=receiptSummary(r);
  assert(s.hash===hash&&s.status==='FINALIZED'&&s.result==='MAJORITY_AGREE'&&s.agree>(s.agree+s.disagree+s.idle)/2,'Finalized strict majority');
  assert((r.to_address||r.recipient).toLowerCase()===d.contract.toLowerCase()&&(r.from_address||r.sender).toLowerCase()===sender,'Contract and actual signer');
  assert(equal(saved.consensus_data.votes,r.consensus_data.votes),'Raw saved votes');
  assert(success?['SUCCESS','FINISHED_WITH_RETURN'].includes(s.execution):s.execution==='ERROR','Execution result');summary.transactions.push({label,...s});
 }
 for(const d of deployments){
  assert(d.network==='studionet'&&d.chain_id===61999&&d.source_sha256===digest(code),'Deployment identity');
  assert(d.fixture_revision===fs.readFileSync(path.join(root,'config/fixture-revision.txt'),'utf8').trim()&&equal(d.reports,reports(d.name,d.fixture_revision)),'Actual source fixtures');
  assert(d.callers.length===2&&new Set(d.callers).size===2,'Distinct participants');
  await verify(d.name+'-deployment',d.transaction,d,true,d.callers[0]);
  let previous=load(d.name+'-initial-state');assert(equal(previous,initial(d,previous.deadline))&&previous.deadline>0,'Initial immutable domain');
  const trace=load(d.name+'-trace'),successes=trace.filter(p=>p.success);assert(equal(successes.map(p=>({label:p.label,method:p.method,args:p.args,caller:p.caller})),plan(d)),'Complete expected protocol moves');
  const rejected={ 'duplicate-root':['commit_root','[EXPECTED] Root already committed'],'bad-opening':['open_node','[EXPECTED] Incorrect node opening'],'repeat-resolution':['resolve','[EXPECTED] Leaf is not ready']};
  for(const p of trace){
   assert(equal(p,load(p.label))&&p.contract===d.contract&&p.sender===d.callers[p.caller]&&equal(p.state_before,previous),'Snapshot and signer chain');
   await verify(p.label,p.transaction,d,p.success,p.sender);
   if(p.success)replay(previous,p.method,p.args,p.sender,p.state,d);
   else assert(d.name==='corrected'&&equal(rejected[p.label],[p.method,p.reason])&&equal(previous,p.state)&&JSON.stringify(load(p.label+'-decoded-receipt')).includes(p.reason),'Exact rejected move with unchanged state');
   previous=p.state;
  }
  assert(equal(previous,load(d.name+'-final-state')),'Final snapshot');
  assert(previous.stage===(d.name==='matched'?'MATCHED_UNVERIFIED':'ADJUDICATED'),'Expected terminal phase');
  if(!offline){assert(code.equals(Buffer.from(await rpc('gen_getContractCode',[d.contract]),'base64')),'Exact live source bytes');assert(equal(previous,await read(d.name+'-fresh',['call',d.contract,'get_state'])),'Fresh onchain state');}
  summary.contracts.push({name:d.name,contract:d.contract,stage:previous.stage,index:previous.result?.index??null,outcome:previous.result?.decision?.outcome??null,root_disproof:previous.result?.root_disproof??null});
 }
 assert(hashes.size===32&&Object.keys(journal.hashes).length===32,'Complete thirty-two transaction set');
 if(!offline){summary.live_state_match=true;save('verification',summary);}
 console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
