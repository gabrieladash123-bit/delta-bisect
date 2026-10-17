# DeltaBisect protocol

## Purpose and consensus boundary

DeltaBisect is a two-party dispute primitive for committed batches of documentary YES/NO/UNCERTAIN classifications. It isolates one disagreement with a Merkle bisection game, then uses independent GenLayer source acquisition and semantic judgment to adjudicate that leaf. A mismatched adjudicated leaf disproves the party's committed classification vector under the frozen source/question policy. It does not certify the other vector or establish physical-world truth.

Offchain parties classify a fixed batch and construct their roots. The contract owns authenticated moves, cryptographic openings, canonical disagreement selection, source fetching, substantive validator comparison, source-bound root disproof and procedural deadlines. Publishers own documentary evidence. There is no owner-controlled update, editable graph, model confidence threshold, certificate minting or monetary settlement.

## Frozen batch and hashes

The constructor fixes 2, 4 or 8 questions, commit-pinned public report URLs and raw SHA-256 hashes, plus two nonzero participant addresses and a move window. Questions are printable ASCII and end with a question mark. The contract derives a domain by SHA-256 over compact ASCII JSON:

`["DeltaBisect-v1", decimal_chain_id, lowercase_contract_address, [{"question":q,"url":u,"sha256":h},...]]`

Object keys in each manifest row are inserted in exactly that order. A leaf is SHA-256 of `0x00 || domain_bytes32 || uint16_be(index) || code`, with YES=0x01, NO=0x02, UNCERTAIN=0x03. An internal node is SHA-256 of `0x01 || left_bytes32 || right_bytes32`. The leaf/internal domain separation follows the general construction in [RFC 9162 section 2.1](https://www.rfc-editor.org/rfc/rfc9162.html#section-2.1); the contract-specific leaf payload and dispute protocol are defined here. No RFC code is copied.

Roots bind the instance, chain, batch index, question and exact source bytes. They are public commitments, not secret ballots. Each party may submit its root once. Equal roots terminate as MATCHED_UNVERIFIED, with no source assessment and no root-disproof flags. Copying another party's root cannot produce an evidence-backed approval.

## Bisection and leaf adjudication

Different roots enter OPEN. Each party opens its current node into two child hashes. The opening must rehash exactly to that party's current node, and a party cannot replace its opening. Once both openings are present, the contract chooses the left child if the hashes differ there; otherwise it chooses the right child. This canonical choice reaches the first differing leaf in log2(N) rounds without a caller selecting a convenient disagreement. The bounded opening history proves membership of both disputed labels in their original roots.

At the leaf, each party reveals a permitted label whose domain/index hash matches its committed leaf. After both reveals, anyone calls resolve. Only the disputed report is fetched. Leader and validators independently acquire its full bytes, check the pinned hash, normalize paragraphs and classify the same question. Validators require exactly the same outcome and independently audit the leader's material quote/paragraph against the full source. Unknown or contradictory evidence cannot be accepted as an affirmative or negative determination. Player identities, roots and claimed labels are excluded from the model prompts.

The final result stores the complete report, question, consensus decision, material anchor, both claims and two root-disproof flags. A flag is true exactly when that party's committed source-classification label differs from the independently agreed label. UNCERTAIN is a real classification: a definite claim unsupported by the source can mismatch it. These flags concern documentary classification, not a claim about facts absent from the report. No label elsewhere in either batch has been adjudicated. The result is immutable.

## Liveness and procedural results

ROOTS, OPEN and REVEAL have a shared deadline. Completing a phase or bisection round starts a fresh move window; a single move cannot extend the other party's deadline. Late moves fail. After expiry, anyone can record FORFEIT if exactly one party has not moved, or ABANDONED if neither moved. These procedural outcomes keep root_disproof as `[null,null]` and do not certify any source claim. READY has no player move deadline; source resolution can be retried after web/model failures.

Models, missing files, hash mismatches and failed consensus never consume the pending leaf or create a factual result. Matching external failures can agree on a failed transaction; malformed model outputs force disagreement. All cryptographic and procedural operations are deterministic, but the consequential source classification cannot be derived from stored roots or player labels.

## Limits

This is a bondless dispute and root-disproof mechanism. It does not force participation, pay rewards, slash funds, prove that a reference publisher is honest, or prove a whole batch correct. A consumer must choose acceptable questions, sources, participants and time windows before relying on an instance. Synthetic release bulletins demonstrate the game, including corrected announcements and unresolved contradictions; they are not real software-release attestations. Unchallenged items remain unverified even if both parties agree. Only the disputed pinned report is acquired onchain, deliberately avoiding a false claim of complete-batch verification.

State is bounded by eight batch entries, two participants, three bisection rounds and one full report of at most 10,000 bytes. Generic CLI transport and direct-test environment helpers reuse MIT infrastructure from the other repositories; the bisection workflow, commitment domain, semantic leaf adjudication and root-disproof lifecycle are implemented for this contract.
