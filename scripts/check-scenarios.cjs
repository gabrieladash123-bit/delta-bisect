const {assert}=require('./transport.cjs');
const {domain,tree,opening}=require('./merkle.cjs');
const {config,reports,manifest,plan}=require('./proof-checks.cjs');
for(const name of Object.keys(config)){
 const d={name,chain_id:61999,contract:'0x'+'1'.repeat(40),reports:reports(name,'a'.repeat(40))};
 assert(plan(d).length===(name==='matched'?2:name==='corrected'?9:7),'Bounded move count');
}
const vectors=Array.from({length:81},(_,n)=>Array.from({length:4},(_,i)=>['YES','NO','UNCERTAIN'][Math.floor(n/3**i)%3]));
for(const a of vectors)for(const b of vectors){
 const ta=tree('12'.repeat(32),a),tb=tree('12'.repeat(32),b);if(a.join()==b.join()){assert(ta.root===tb.root,'Equal roots');continue;}
 let lo=0,hi=4;while(hi-lo>1){const middle=(lo+hi)/2;if(opening(ta,lo,hi)[0]!==opening(tb,lo,hi)[0])hi=middle;else lo=middle;}
 assert(lo===a.findIndex((v,i)=>v!==b[i]),'Canonical first disagreement');
}
console.log('6561 ternary vector pairs and four live scenario plans verified');
