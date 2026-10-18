# DeltaBisect

**A GenLayer Merkle disagreement game for committed documentary classifications.**

Two parties freeze YES/NO/UNCERTAIN label vectors as Merkle roots. Authenticated child openings isolate the first differing leaf in at most three rounds. GenLayer then independently fetches that leaf's commit-pinned report, checks its SHA-256 hash, classifies the fixed question and audits a material quotation. The agreed label can disprove one or both roots. Other leaves remain unverified.

This primitive fits disputes between batch classifiers, source-index maintainers or document-review systems whose label vectors diverge. It spends semantic consensus on one authenticated disagreement rather than re-evaluating an entire batch. Equal roots explicitly terminate as `MATCHED_UNVERIFIED`.

## Contract and protocol

- [Intelligent contract](contracts/delta_bisect.py): pinned GenVM runner, immutable 2/4/8-item manifest and two participants.
- [Architecture and hash specification](docs/architecture.md): commitment domain, canonical bisection, independent source judgment, deadlines and limits.
- [Commitment helper](scripts/merkle.cjs): Node.js domain, leaves, tree construction and child openings.
- [Direct tests](tests/direct/test_delta.py): authenticated moves, first-difference selection, deadlines, source/model failures and explicit validator replay.
- [Onchain proofs](proofs/README.md): four public StudioNet instances; 32 finalized MAJORITY_AGREE receipts, actual calldata and fresh-state verification.
- [Submission text](docs/submission.md): category, ready-to-copy description, source and deployment links.

## Build and verify

Python 3.13, Node.js 24 and GenLayer CLI 0.39.2:

```sh
python -m venv .venv
# Activate the environment for your shell.
pip install -r requirements-dev.txt
genvm-lint download --version v0.2.16
genvm-lint check contracts/delta_bisect.py --json
python -m pytest -q
node scripts/check-scenarios.cjs
```

The direct VM mocks web/model calls. Tests explicitly replay validators for outcome disagreement, anchor rejection and changed report bytes; this does not replace real multi-validator receipts. Independent Python/JavaScript checks compare all 81 ternary four-item trees and traverse all 6,561 vector pairs.

## Deploy and interact

The constructor takes `questions`, `report_urls`, `report_hashes`, `participants` and `move_seconds` (30–86,400). Report URLs must point to a full Git commit under `reports/`; hashes bind raw bytes. Choose trustworthy sources and precise documentary questions. Obtain the deployed domain from `get_state` and construct each vector with `scripts/merkle.cjs`.

1. Each participant calls `commit_root(root)` once.
2. If roots differ, each calls `open_node(expected_round,left,right)`; use the current `[lo,hi)` from `get_state` with the commitment helper.
3. Repeat until `REVEAL`; each calls `reveal_label(expected_index,label)`.
4. Anyone calls `resolve()` in `READY`. The full pinned report and source-bound consensus outcome are retained in `get_state`.
5. Anyone can call `timeout()` after an expired player-phase deadline. A timeout is procedural and never proves a factual claim.

The manual `proofs.yml` workflow creates two encrypted disposable CLI accounts and executes the published proof runner against gasless **StudioNet, chain 61999**. It needs no exported private keys or repository secrets. A source-bound journal records each transaction hash immediately and refuses ambiguous resends. CLI output is adapted to JSON without altering local account configuration. Sanitized receipts retain raw consensus votes. Run `node scripts/verify-proofs.cjs --offline` on downloaded artifacts, or omit `--offline` for fresh receipts, deployed-source comparison and final onchain reads with `GENLAYER_CLI_PATH` and `DELTA_ACCOUNT` set.

## Scope

This is a bondless, bounded dispute primitive. It does not settle payments, certify a whole batch, prove delivery, or establish physical truth. `root_disproof=true` means an authenticated leaf differs from consensus classification of the frozen document under the question policy. Procedural forfeits and matching roots cannot produce source-backed approval. The synthetic release bulletins demonstrate corrections, previews, decoy versions and unresolved contradictions; they are not actual release attestations.

Generic CLI transport and direct-VM environment helpers reuse MIT infrastructure from CounterForge/BrierCommit. The dispute storage, domain-bound commitments, canonical bisection, semantic adjudication and root-disproof lifecycle are implemented here. No claim of globally unique cryptographic research is made; Merkle bisection is an established technique applied to independently verified GenLayer documentary disagreements.
