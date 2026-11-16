# Fábrica cover isolated candidate — NOT deployable

User selected the corrected image 1002273161.png on 2026-11-16. Preserve exact bytes, no crop or editing.

PNG 1672×941, one frame, 2060262 bytes, SHA256 7089258579f37d13baaf82d909a65cee5ed361459656590446a9c40bc3cdde2f.

Proposed path: assets/eventos/fabrica-de-samba-20261129-7089258579f37d13.png.
Event: EVT-29112026-FABRICA-DE-SAMBA-CE2EF10E.
Producer: PROD-F100125CB73E4FF8A819251E2B624E21.

Visual checked independently: Carioca Ticket logo, VENDA ONLINE, 29 NOV domingo, 14h–22h30, Rua 24 de Maio 200, R$25. Checkout must separately disclose buyer fee and total.

This PR includes ONLY an offline validator. It does not contain the PNG, workflow or production integration. No deployment is authorized. The validator accepts an authenticated published baseline artifact plus exactly one new asset and rejects all changes to existing bytes. Evidence supplied to the validator is not independently authenticated by this module; a reviewed publication process must establish it first. Do not use it as a substitute for existing gates or the full publication pipeline.

Ten offline cases passed with the exact approved PNG and a synthetic baseline: success, deletion, modified existing HTML, extra file, wrong asset, one-byte corruption, traversal, baseline hash mismatch, unexpected evidence field and invalid run ID. PIL integrity and independent image review passed.

Blockers: authenticated latest published artifact/inventory, asset transfer into reviewed branch, active backend400 source for minimal library registration (previous Library denial respected). Existing cover-only publisher targets another event and cannot be reused. Source main is not active400. Do not execute RPC, bypass properties restrictions, change prices or publish event. Owner can select through normal event UI only AFTER library integration and asset verification; current empty/error selector is not an upload field.
