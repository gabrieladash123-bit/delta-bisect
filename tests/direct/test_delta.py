import hashlib
import itertools
import json
from pathlib import Path
import pytest
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
QUESTION = 'Did the final bulletin confirm HarborDB version 4.2 became generally available by 2026-09-30, excluding previews and planned releases?'
CODES = {'YES': b'\x01', 'NO': b'\x02', 'UNCERTAIN': b'\x03'}

def sha(b): return hashlib.sha256(b).hexdigest()
def leaf(d, i, label): return sha(b'\0' + bytes.fromhex(d) + i.to_bytes(2, 'big') + CODES[label])
def node(a, b): return sha(b'\1' + bytes.fromhex(a) + bytes.fromhex(b))
def levels(domain, labels):
    out = [[leaf(domain, i, label) for i, label in enumerate(labels)]]
    while len(out[-1]) > 1:
        row = out[-1]
        out.append([node(row[i], row[i+1]) for i in range(0, len(row), 2)])
    return out

@pytest.fixture
def setup(direct_deploy, direct_vm, direct_alice, direct_bob):
    direct_vm.warp('2026-10-17T00:00:00Z')
    def deploy(n=4, **overrides):
        args = dict(questions=[QUESTION]*n,
            report_urls=['https://raw.githubusercontent.com/gabrieladash123-bit/delta-bisect/'+'a'*40+'/reports/corrected-release.md']*n,
            report_hashes=[sha((ROOT/'reports/corrected-release.md').read_bytes())]*n,
            participants=[direct_alice, direct_bob], move_seconds=30)
        args.update(overrides)
        return direct_deploy(str(ROOT/'contracts/delta_bisect.py'), **args)
    return deploy

def commit(c, vm, players, labels):
    trees = [levels(c.get_state()['domain'], row) for row in labels]
    for player, t in zip(players, trees):
        vm.sender = player
        c.commit_root(t[-1][0])
    return trees

def descend(c, vm, players, trees):
    while c.get_state()['stage'] == 'OPEN':
        s = c.get_state()
        level = (s['hi']-s['lo']).bit_length()-2
        offset = s['lo']//(2**level)
        for player, t in zip(players, trees):
            vm.sender = player
            c.open_node(s['round'], *t[level][offset:offset+2])

def ready(c, vm, players, labels):
    trees = commit(c, vm, players, labels)
    descend(c, vm, players, trees)
    i = c.get_state()['lo']
    for p, row in zip(players, labels):
        vm.sender = p
        c.reveal_label(i, row[i])
    return i

def model(vm, outcome='YES', audit=True):
    text = (ROOT/'reports/corrected-release.md').read_text()
    quote = 'HarborDB version 4.2 became generally available on 2026-09-30.'
    vm.mock_web(r'.*', {'status':200,'body':text})
    vm.mock_llm(r'DELTA-CLASSIFY', json.dumps({'outcome':outcome,'paragraph':2,'quote':quote}))
    vm.mock_llm(r'DELTA-ANCHOR', json.dumps({'valid':audit}))

def test_domain(setup):
    c = setup(); s = c.get_state()
    assert s['stage']=='ROOTS' and s['hi']==4 and s['deadline']>0
    assert len(s['domain'])==64 and s['result'] is None

@pytest.mark.parametrize('index',range(8))
def test_canonical_first_disagreement(setup,direct_vm,direct_alice,direct_bob,index):
    c=setup(8); a=['YES']*8; b=['YES']*index+['NO']*(8-index)
    i=ready(c,direct_vm,[direct_alice,direct_bob],[a,b]); s=c.get_state()
    assert i==index and s['round']==3 and s['stage']=='READY'
    assert [x['direction'] for x in s['history']]==['RIGHT' if (index>>bit)&1 else 'LEFT' for bit in (2,1,0)]

def test_matching_roots_never_certify(setup,direct_vm,direct_alice,direct_bob):
    c=setup(); commit(c,direct_vm,[direct_alice,direct_bob],[['YES']*4]*2)
    assert c.get_state()['stage']=='MATCHED_UNVERIFIED' and c.get_state()['result'] is None
    with direct_vm.expect_revert('Leaf is not ready'): c.resolve()

@pytest.mark.parametrize('outcome,flags',[('YES',[True,False]),('NO',[False,True]),('UNCERTAIN',[True,True])])
def test_consensus_exact_outcomes(setup,direct_vm,direct_alice,direct_bob,outcome,flags):
    c=setup(2); ready(c,direct_vm,[direct_alice,direct_bob],[['NO','YES'],['YES','YES']])
    model(direct_vm,outcome); c.resolve(); assert direct_vm.run_validator() is True
    s=c.get_state(); assert s['stage']=='ADJUDICATED' and s['result']['root_disproof']==flags
    assert s['result']['report']['text']==(ROOT/'reports/corrected-release.md').read_text()
    with direct_vm.expect_revert('Leaf is not ready'): c.resolve()

@pytest.mark.parametrize('change',['outcome','audit','source'])
def test_validator_independence(setup,direct_vm,direct_alice,direct_bob,change):
    c=setup(2); ready(c,direct_vm,[direct_alice,direct_bob],[['NO']*2,['YES']*2]); model(direct_vm); c.resolve()
    direct_vm.clear_mocks(); model(direct_vm,'NO' if change=='outcome' else 'YES',change!='audit')
    if change=='source':
        direct_vm.clear_mocks(); direct_vm.mock_web(r'.*',{'status':200,'body':'Changed publisher text. '*5})
    assert direct_vm.run_validator() is False

@pytest.mark.parametrize('bad',[
 {'outcome':'YES','paragraph':-1,'quote':''},
 {'outcome':'YES','paragraph':True,'quote':'x'*30},
 {'outcome':'YES','paragraph':2,'quote':'A fabricated material statement.'},
 {'outcome':'YES','paragraph':2,'quote':'short'},
 {'outcome':'MAYBE','paragraph':-1,'quote':''},
 {'outcome':'YES','paragraph':20,'quote':'x'*30},
 {'outcome':'YES','paragraph':2,'quote':'x'*30,'confidence':0.99},
 '{"outcome":"YES","outcome":"NO","paragraph":-1,"quote":""}',
])
def test_bad_model_output_leaves_ready(setup,direct_vm,direct_alice,direct_bob,bad):
    c=setup(2); ready(c,direct_vm,[direct_alice,direct_bob],[['NO']*2,['YES']*2]); model(direct_vm)
    direct_vm.clear_mocks(); direct_vm.mock_web(r'.*',{'status':200,'body':(ROOT/'reports/corrected-release.md').read_text()})
    direct_vm.mock_llm(r'.*',bad if isinstance(bad,str) else json.dumps(bad))
    with direct_vm.expect_revert('LLM_ERROR'): c.resolve()
    assert c.get_state()['stage']=='READY' and c.get_state()['result'] is None

@pytest.mark.parametrize('body,status',[('x'*50,200),('x'*50,404),('x'*50,503),('tiny',200),('x'*10001,200)])
def test_fetch_failure_retryable(setup,direct_vm,direct_alice,direct_bob,body,status):
    c=setup(2); ready(c,direct_vm,[direct_alice,direct_bob],[['NO']*2,['YES']*2])
    direct_vm.mock_web(r'.*',{'status':status,'body':body})
    with direct_vm.expect_revert(): c.resolve()
    assert c.get_state()['stage']=='READY'

def test_invalid_moves(setup,direct_vm,direct_alice,direct_bob,direct_charlie):
    c=setup(2); direct_vm.sender=direct_charlie
    with direct_vm.expect_revert('not a participant'): c.commit_root('a'*64)
    direct_vm.sender=direct_alice
    with direct_vm.expect_revert('SHA-256'): c.commit_root('ABC')
    labels=[['YES']*2,['NO']*2]; trees=commit(c,direct_vm,[direct_alice,direct_bob],labels)
    with direct_vm.expect_revert('round does not match'): c.open_node(1,*trees[1][0])
    with direct_vm.expect_revert('Incorrect node opening'): c.open_node(0,'a'*64,'b'*64)
    c.open_node(0,*trees[1][0])
    with direct_vm.expect_revert('already opened'): c.open_node(0,*trees[1][0])
    direct_vm.sender=direct_alice; c.open_node(0,*trees[0][0])
    with direct_vm.expect_revert('index does not match'): c.reveal_label(1,'YES')
    with direct_vm.expect_revert('committed leaf'): c.reveal_label(0,'NO')
    c.reveal_label(0,'YES')
    with direct_vm.expect_revert('already revealed'): c.reveal_label(0,'YES')

@pytest.mark.parametrize('phase', ['ROOTS','OPEN','REVEAL'])
@pytest.mark.parametrize('moves',[0,1])
def test_timeout_never_factual(setup,direct_vm,direct_alice,direct_bob,phase,moves):
    c=setup(2); players=[direct_alice,direct_bob]; labels=[['YES']*2,['NO']*2]
    if phase!='ROOTS': trees=commit(c,direct_vm,players,labels)
    if phase=='REVEAL': descend(c,direct_vm,players,trees)
    before=c.get_state()['deadline']; direct_vm.sender=direct_alice
    with direct_vm.expect_revert('No expired'): c.timeout()
    if moves:
        if phase=='ROOTS': c.commit_root('a'*64)
        elif phase=='OPEN': c.open_node(0,*trees[0][0])
        else: c.reveal_label(0,'YES')
    assert c.get_state()['deadline']==before
    direct_vm.warp('2026-10-17T00:00:30Z'); c.timeout(); s=c.get_state()
    assert s['stage']==('FORFEIT' if moves else 'ABANDONED')
    assert s['result']['root_disproof']==[None,None]
    assert s['result']['missing']==([1] if moves else [0,1])

def test_deadline_exact_and_duplicate_root(setup,direct_vm,direct_alice):
    c=setup(2); direct_vm.sender=direct_alice; c.commit_root('a'*64)
    with direct_vm.expect_revert('already committed'): c.commit_root('b'*64)
    direct_vm.warp('2026-10-17T00:00:30Z')
    with direct_vm.expect_revert('deadline expired'): c.commit_root('b'*64)

@pytest.mark.parametrize('override',[
 {'questions':[QUESTION]*3}, {'report_urls':['https://example.org/report']*4},
 {'report_hashes':['F'*64]*4}, {'questions':['short?']*4},
 {'questions':[QUESTION+'\n']*4}, {'move_seconds':29}, {'move_seconds':86401}, {'move_seconds':True},
])
def test_bad_constructor(setup,direct_vm,override):
    with direct_vm.expect_revert(): setup(**override)

def test_domain_instance_binding(setup):
    s=setup(2).get_state(); gl=sys.modules['genlayer.gl']
    body=['DeltaBisect-v1',str(int(gl.message.chain_id)),str(gl.message.contract_address).lower(),s['manifest']]
    assert sha(json.dumps(body,separators=(',',':'),ensure_ascii=True).encode())==s['domain']
    body[2]='0x'+'ab'*20
    assert sha(json.dumps(body,separators=(',',':'),ensure_ascii=True).encode())!=s['domain']

def test_javascript_commitments_match_python():
    labels=list(itertools.product(CODES,repeat=4))
    rows=[{'domain':'12'*32,'labels':list(v)} for v in labels]
    script="const fs=require('node:fs'),{tree}=require('./scripts/merkle.cjs');process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(x=>tree(x.domain,x.labels).levels)));"
    result=subprocess.run(['node','-e',script],input=json.dumps(rows),text=True,cwd=ROOT,capture_output=True,check=True)
    assert json.loads(result.stdout)==[levels('12'*32,v) for v in labels]

def test_exhaustive_four_leaf_bisection():
    # Independent reference traversal over every pair of ternary four-item vectors.
    vectors=list(itertools.product(CODES,repeat=4)); d='12'*32
    for a in vectors:
        for b in vectors:
            ta,tb=levels(d,a),levels(d,b)
            if a==b: assert ta[-1]==tb[-1]; continue
            lo,hi=0,4
            while hi-lo>1:
                level=(hi-lo).bit_length()-2; j=lo//2**level; middle=(hi+lo)//2
                if ta[level][j]!=tb[level][j]: hi=middle
                else: lo=middle
            assert lo==next(i for i in range(4) if a[i]!=b[i])
