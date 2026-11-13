# Tony checkout-only publication route — REVIEW REQUIRED

This change does not deploy on push or PR. The review workflow only runs synthetic Python tests. Production and rollback each require explicit owner approval, `workflow_dispatch`, exact reviewed main SHA and the existing protected `github-pages` environment. Existing publishers/permissions are not changed. No backend/API-of-site request, Pix or purchase is made.

## Evidence and scope
Candidate PR263 commit `b4e817610dc90af77b631db44404cb90d166ba70`, tree `b79fc7d53405703399f74700b2fe26175f2297ce`: checkout Tony quote gate + local tests. The9 pinned PR workflows succeeded. Candidate must be integrated by a merge that preserves this exact commit's ancestry, not squash/rebase rewriting it; otherwise guard fails.
Baseline deployment7656353597 is success2026-11-09T13:50:43Z from run42628636941, artifact13679502447. Downloaded ZIP digest was checked against GitHub; original checkout equals patch baseline byte-for-byte. Original TAR has546 regular files. Offline preparer verified exactly one changed file, no additions/deletions, all derivatives and operational data untouched. No rebuild or financial routing modification.

## Publication approval inputs (not permission to execute)
Workflow `ct-tony-checkout-only-publication.yml` from main.
- mode `publish`
- confirmation `PUBLISH_TONY_CHECKOUT_ONLY`
- expected_guard_sha: exact final reviewed main SHA (not yet known; must include unchanged guard and candidate ancestry)
- expected_current_deployment `7656353597`

The guard will fail if Pages is not workflow-based, main diverges, current successful deployment changes, another deployment intervenes, baseline artifact expires, required CI ceases to match or any exact byte/tree differs. Default artifact expiry is2026-11-16T13:50:16Z: publish preparation must fail afterward unless a newly reviewed provenance-preserving source is approved.

The prepared TAR has SHA256 `d42bc4c6e8c45e36960f959a11fb461129932f0f39dee67fec0cd2c2ba5178e5`. Only `checkout/index.html` changes, from `fd97b14f21476e91f83f04e7cbf4535414d0c27ed81246deeab63e6b843b3412` to `fff11422c78ff7054d13edfe82043f73ef0708247bc653911ee22cdde67a7696`. No public test/support files added. The exact sealed TAR is uploaded with the official artifact action then published by pinned official deploy-pages action. No permissive rebuild fallback exists.

## Rollback approval inputs
Obtain separate explicit owner rollback approval. Mode `rollback`, confirmation `ROLLBACK_TONY_CHECKOUT_ONLY`, exact reviewed current-main guard SHA, and the successful deployment ID created by the checkout-only publication. The guard proves that current deployment came from this workflow and its artifact is exactly the pinned candidate TAR. It recovers the original from that execution's retained `checkout-rollback-and-seal` artifact, not from an expired baseline or reconstructed Git tree. Original TAR hash must be `7272e1fb65238fb3c9f19863fd2d25dd8506ade348d69fe9d26341c9f0f63eb1`. Original and seal are retained30days. Missing/expired artifacts or intervening changes require renewed review, not bypass.

## Limits and verification after explicit publication
All checks here concern immutable source/artifacts and GitHub deployment state. They do not prove live CDN bytes, loaded fee, checkout readiness, confirmation or ticket issuance. After publication, independently verify the resulting Pages deployment, exact served checkout hash and authorized synthetic/read-only flow. Real purchase/Pix is not included. Preserve unknown previous payment idempotency until reconciliation. Publishing corrects only Tony; Fabrica financial-policy compatibility remains separate.
