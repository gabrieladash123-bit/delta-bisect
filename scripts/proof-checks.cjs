const fs=require('node:fs'),path=require('node:path');
const {assert,equal,root}=require('./transport.cjs');
const {hash,domain,tree,opening,node,leaf}=require('./merkle.cjs');
const question='Did the final bulletin confirm HarborDB version 4.2 became generally available by 2026-09-30, excluding previews and planned releases?';
const config={
 corrected:{files:['preview-only','unresolved-status','corrected-release','preview-only'],labels:[['NO','UNCERTAIN','NO','NO'],['NO','UNCERTAIN','YES','YES']],index:2,outcome:'YES',flags:[true,false]},
 negative:{files:['corrected-release','preview-only'],labels:[['YES','YES'],['YES','UNCERTAIN']],index:1,outcome:'NO',flags:[true,true]},
 uncertain:{files:['unresolved-status','corrected-release'],labels:[['YES','YES'],['UNCERTAIN','YES']],index:0,outcome:'UNCERTAIN',flags:[true,false]},
 matched:{files:['corrected-release','preview-only'],labels:[['YES','NO'],['YES','NO']],index:null,outcome:null,flags:null}
};
function reports(name,revision){return config[name].files.map(f=>{const text=fs.readFileSync(path.join(root,'reports',f+'.md'),'utf8');return {question,url:`https://raw.githubusercontent.com/gabrieladash123-bit/delta-bisect/${revision}/reports/${f}.md`,sha256:hash(Buffer.from(text)),text};});}
const manifest=rows=>rows.map(r=>({question:r.question,url:r.url,sha256:r.sha256}));
function trees(d){const dom=domain(d.chain_id,d.contract,manifest(d.reports));return config[d.name].labels.map(labels=>tree(dom,labels));}
function initial(d,deadline){return {manifest:manifest(d.reports),participants:d.callers,domain:domain(d.chain_id,d.contract,manifest(d.reports)),roots:['',''],nodes:['',''],lefts:['',''],rights:['',''],labels:['',''],lo:0,hi:d.reports.length,round:0,stage:'ROOTS',window:7200,deadline,history:[],result:null};}
function checkDecision(result,d){
 const c=config[d.name],r=d.reports[c.index],paragraphs=r.text.replace(/\r\n/g,'\n').split('\n\n').map(x=>x.trim()).filter(Boolean),decision=result.decision;
 assert(equal(Object.keys(result).sort(),['kind','index','question','report','decision','claims','root_disproof'].sort()),'Exact adjudication schema');
 assert(result.kind==='ADJUDICATED'&&result.index===c.index&&result.question===question,'Disputed proposition');
 assert(equal(result.report,{url:r.url,sha256:r.sha256,text:r.text,paragraphs}),'Complete fetched pinned report');
 assert(equal(Object.keys(decision).sort(),['outcome','paragraph','quote'])&&decision.outcome===c.outcome,'Expected semantic outcome');
 assert(Number.isInteger(decision.paragraph)&&typeof decision.quote==='string','Typed anchor');
 if(decision.paragraph===-1)assert(decision.outcome==='UNCERTAIN'&&decision.quote==='','Absent anchor');
 else assert(decision.paragraph>=0&&decision.paragraph<paragraphs.length&&decision.quote.length>=20&&decision.quote.length<=500&&paragraphs[decision.paragraph].includes(decision.quote),'Literal material anchor');
 assert(equal(result.claims,c.labels.map(row=>row[c.index]))&&equal(result.root_disproof,c.flags),'Exact source-bound root disproof');
}
function replay(before,method,args,caller,after,d){
 const s=structuredClone(before),p=d.callers.indexOf(caller),t=trees(d);
 assert(p>=0,'Known signer');
 if(method==='commit_root'){
  assert(s.stage==='ROOTS'&&!s.roots[p]&&args[0]===t[p].root,'Valid committed vector');s.roots[p]=s.nodes[p]=args[0];
  if(s.roots.every(Boolean))s.stage=s.roots[0]===s.roots[1]?'MATCHED_UNVERIFIED':'OPEN';
 }else if(method==='open_node'){
  assert(s.stage==='OPEN'&&!s.lefts[p]&&args[0]===s.round,'One opening for expected round');
  assert(equal(args.slice(1),opening(t[p],s.lo,s.hi))&&node(args[1],args[2])===s.nodes[p],'Root-bound child hashes');
  [s.lefts[p],s.rights[p]]=args.slice(1);
  if(s.lefts.every(Boolean)){
   const left=s.lefts[0]!==s.lefts[1],chosen=[...(left?s.lefts:s.rights)];assert(chosen[0]!==chosen[1],'Differing child');
   s.history.push({round:s.round,lo:s.lo,hi:s.hi,nodes:[...s.nodes],lefts:[...s.lefts],rights:[...s.rights],direction:left?'LEFT':'RIGHT'});
   const middle=(s.hi+s.lo)/2;if(left)s.hi=middle;else s.lo=middle;
   s.nodes=chosen;s.lefts=['',''];s.rights=['',''];s.round++;s.stage=s.hi-s.lo===1?'REVEAL':'OPEN';
  }
 }else if(method==='reveal_label'){
  assert(s.stage==='REVEAL'&&!s.labels[p]&&args[0]===s.lo&&args[1]===config[d.name].labels[p][s.lo],'Expected committed label');
  assert(leaf(s.domain,s.lo,args[1])===s.nodes[p],'Leaf membership');s.labels[p]=args[1];if(s.labels.every(Boolean))s.stage='READY';
 }else if(method==='resolve'){
  assert(s.stage==='READY'&&args.length===0,'Permissionless ready resolution');checkDecision(after.result,d);s.stage='ADJUDICATED';s.result=after.result;
 }else throw Error('Unexpected method');
 const reset=s.stage!==before.stage||s.round!==before.round;
 if(['MATCHED_UNVERIFIED','READY','ADJUDICATED'].includes(s.stage))s.deadline=0;
 else if(reset){assert(Number.isInteger(after.deadline)&&after.deadline>=before.deadline,'New shared move window');s.deadline=after.deadline;}
 assert(equal(s,after),'Full deterministic state replay for '+method);
}
function plan(d){
 const t=trees(d),c=config[d.name],out=[{label:d.name+'-root-0',method:'commit_root',args:[t[0].root],caller:0},{label:d.name+'-root-1',method:'commit_root',args:[t[1].root],caller:1}];
 if(c.index===null)return out;
 let lo=0,hi=c.files.length,round=0;
 while(hi-lo>1){
  for(let p=0;p<2;p++)out.push({label:`${d.name}-open-${round}-${p}`,method:'open_node',args:[round,...opening(t[p],lo,hi)],caller:p});
  const left=opening(t[0],lo,hi)[0]!==opening(t[1],lo,hi)[0],middle=(lo+hi)/2;if(left)hi=middle;else lo=middle;round++;
 }
 assert(lo===c.index,'Canonical first disagreement');
 for(let p=0;p<2;p++)out.push({label:`${d.name}-reveal-${p}`,method:'reveal_label',args:[lo,c.labels[p][lo]],caller:p});
 out.push({label:d.name+'-resolve',method:'resolve',args:[],caller:1});return out;
}
module.exports={config,reports,manifest,trees,initial,checkDecision,replay,plan};
