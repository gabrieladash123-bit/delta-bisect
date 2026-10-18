# Deployment proofs

**Network:** gasless GenLayer StudioNet, chain **61999**. These are public StudioNet instances, not Bradbury or mainnet deployments.

The [successful CLI proof run](https://github.com/gabrieladash123-bit/delta-bisect/actions/runs/39101466364) deployed four instances and finalized **32 transactions with MAJORITY_AGREE**: 29 successful executions and three deliberately rejected moves. Every receipt has a strict agreeing majority when idle votes are included in the denominator. There are no dissenting votes in this run; the 44 idle votes are retained and are not counted as agreements.

## Contracts and semantic outcomes

| Scenario | Contract address | Deployment | Final result |
|---|---|---|---|
| Corrected announcement, four leaves | `0x59Af97E9269bE399320906612aE7470927606dBd` | [transaction](https://explorer-studio.genlayer.com/tx/0x23a738fa9dc59f582b129b6aae36c83d5b99008a5fd623184b0ce46d75dcccc8) | YES at index 2; root disproof `[true,false]` |
| Explicit negative, two leaves | `0x2CDa056008d0bF544D3cc48Aca23393B2eC0D9BD` | [transaction](https://explorer-studio.genlayer.com/tx/0xf37296f6140250bd949889b31dbb2e23cbde4bfb9ab0116a07631df51f36ab85) | NO at index 1; both roots disproved `[true,true]` |
| Unresolved contradiction, two leaves | `0x92092E8dfD1A40BA682fe83B86bf216CC33A615D` | [transaction](https://explorer-studio.genlayer.com/tx/0x5dce5a623fca654cdca24d107fb964f5c06f1cd6f0b1d5b33e87bdc0fa451013) | UNCERTAIN at index 0; root disproof `[true,false]` |
| Matching roots, two leaves | `0xF6Af8aba32057CB89b17E9903f28650cefA6F29d` | [transaction](https://explorer-studio.genlayer.com/tx/0xd3eb85fef1a81302575cd9085de34b36b465db2d323b093ee5d571b61968104e) | MATCHED_UNVERIFIED; no factual decision or disproof flags |

The corrected-announcement game takes RIGHT then LEFT, isolating the first difference at index 2 although the vectors also differ at index 3. Its [resolution](https://explorer-studio.genlayer.com/tx/0xc534434d813ed8e1ad1cb7fc758cae1f0ed511b8d05cd2ec70c8c550cf580ace) stores the full report and the final correction's exact release statement. The withdrawn draft cannot override that correction. See the complete [move trace](corrected-trace.json) and [final state](corrected-final-state.json).

The [negative resolution](https://explorer-studio.genlayer.com/tx/0xb8f8cbfae6ac9f77adc7dcf1ec7d3bf438e6bbe83d5d7a9211d2f63e159df813) selects NO from the explicit closed-period statement despite a preview, future plan and older-version decoy. Both committed labels, YES and UNCERTAIN, mismatch it; neither party receives a factual win. See the [trace](negative-trace.json) and [state](negative-final-state.json).

The [uncertain resolution](https://explorer-studio.genlayer.com/tx/0x911c7ea4370177e63af7cdac669f0cc4fdcb278e04e9ad3a96875149809a8f48) preserves an unresolved contradiction between final statements. The material quotation explains that neither statement has precedence. See the [trace](uncertain-trace.json) and [state](uncertain-final-state.json).

The [matching-root termination](https://explorer-studio.genlayer.com/tx/0x7fe3507ec6bc8998ac02b92dedf8092b4521818d96ca70514efb8982dfa33dc2) has no source classification, quote or root-disproof result. Equal commitments cannot certify a batch. See the [trace](matched-trace.json) and [state](matched-final-state.json).

## Deliberate rejected transactions

These receipts finalized with consensus on an **ERROR**, not successful execution. Their recorded states are unchanged:

| Move | Onchain receipt | Expected reason |
|---|---|---|
| Duplicate commitment | [transaction](https://explorer-studio.genlayer.com/tx/0xdaa51041fd017e6a47d64562894c3c1cc81d5c9338033e56711ba607a6999c36) | Root already committed |
| Invalid child opening | [transaction](https://explorer-studio.genlayer.com/tx/0x10bedec34d24f8dac710b6189f237a9085425c4b3217af772e508c2c1e80dde8) | Incorrect node opening |
| Repeat adjudication | [transaction](https://explorer-studio.genlayer.com/tx/0xea440ba98e6614a6054c5c505c9a61ba5ddfbef5b10e6108406048d8d9b943ba) | Leaf is not ready |

## Reproducible evidence

- [Deployments](deployments.json): actual addresses, two distinct caller wallets, immutable manifests and source identity.
- [Transaction index](transactions.json): all 32 hashes; each label also has a sanitized `*-receipt.json` with raw votes and execution results.
- [Verification](verification.json): fresh receipt lookups, exact deployment/source bytes, actual calldata decoding, full Merkle move replay, source anchors and final onchain-state comparisons.
- [Hosted verification](cloud-verification.json): the original workflow's independent fresh RPC/source/state check, retained separately from the subsequent verifier with calldata binding.
- [Hosted direct-test results](cloud-direct-tests.xml): 48 passing tests. [Local results](local-direct-tests.xml) are retained too.
- [CI](https://github.com/gabrieladash123-bit/delta-bisect/actions/runs/39101656051): lint, tests, exhaustive Merkle checks and script syntax.

Contract source SHA-256: `47c777fbd55e1705c812093c41430cef08680913755530abb56a5a1bc0b6c0bc`.

Report revision: `63dc8e6b82c43a8eeb95b6503494ff174f67aac3`. Full report texts are synthetic and commit-pinned; raw SHA-256 checks precede UTF-8 decoding. They demonstrate documentary classification and cannot establish actual software-release or physical-world truth.

From a checkout with GenLayer CLI 0.39.2 installed, set `GENLAYER_CLI_PATH` to its `dist/index.js`. Run `node scripts/verify-proofs.cjs --offline` to replay downloaded evidence. For fresh onchain reads, select a locally available account with `DELTA_ACCOUNT` and omit `--offline`. The verifier sends only read requests. It checks all source/constructor bindings, exact transaction methods and arguments, actual signers, hashes, strict majorities including idle votes, expected execution errors, canonical bisection, literal report anchors and current terminal states.

The 30-second deadline boundary, late moves, procedural forfeits/abandonment, eight-leaf traversal and malformed/unavailable sources are direct-test coverage; they are not additional onchain scenarios in this proof set. No timeout is claimed as a source-backed factual determination.
