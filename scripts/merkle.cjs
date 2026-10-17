const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const codes={YES:1,NO:2,UNCERTAIN:3};
function domain(chain,contract,manifest){return hash(Buffer.from(JSON.stringify(['DeltaBisect-v1',String(chain),contract.toLowerCase(),manifest.map(r=>({question:r.question,url:r.url,sha256:r.sha256}))])));}
function leaf(domain,index,label){
 if(!/^[a-f0-9]{64}$/.test(domain)||!Number.isInteger(index)||index<0||index>65535||!Object.hasOwn(codes,label))throw Error('Invalid leaf');
 const b=Buffer.alloc(2);b.writeUInt16BE(index);return hash(Buffer.concat([Buffer.from([0]),Buffer.from(domain,'hex'),b,Buffer.from([codes[label]])]));
}
const node=(left,right)=>hash(Buffer.concat([Buffer.from([1]),Buffer.from(left,'hex'),Buffer.from(right,'hex')]));
function tree(domain,labels){
 if(![2,4,8].includes(labels.length))throw Error('Invalid batch');
 const levels=[labels.map((v,i)=>leaf(domain,i,v))];
 while(levels.at(-1).length>1){const a=levels.at(-1),b=[];for(let i=0;i<a.length;i+=2)b.push(node(a[i],a[i+1]));levels.push(b);}
 return {root:levels.at(-1)[0],levels};
}
function opening(tree,lo,hi){const level=Math.log2(hi-lo)-1;return [tree.levels[level][lo/2**level],tree.levels[level][lo/2**level+1]];}
module.exports={hash,domain,leaf,node,tree,opening};
