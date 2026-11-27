# P4 Insurance frontend implementation and acceptance

## Contract revision

This work is based on frontend base commit `e39d1c049967fc8a732cac99fedb0e0b6d2eaf9e` and backend `SaleemCastle/dental-booking-api` main revision `f49ed2b97352bb9efdbff6d2f16562d25d780b59` (OpenAPI root blob `f58c9c6a1a8482849e756100359bff15bbdf33dd`). The backend's M7 QA review is [PR #71](https://github.com/SaleemCastle/dental-booking-api/pull/71). Workflow OpenAPI artifacts at that revision include patient insurance (`8c28e195f7ad9ad0e82b0401a2147cdb0eb36e86`), benefits (`26d88b3356d5e2bf16cd04214d7e5a95e8a40c52`), evidence (`f8943d28b2df275ca73392b51e9565eb4451728f`), claims (`e27779cce6087ccb3ded312b305f1fb73ec739d3`), remittances (`a0dac13fc48542b0de71169a29d5290f89c83569`), receipts (`d16fc310ee3f1765c1f65faff6b34d363db76b2c`), obligations (`a7208c3c4368a5cdfce4f776c04a783bea7b7134`), and catalog (`e2e8a8c8d83a98dc89ce497ac1357a913493824f`).

## Implemented frontend behavior

- Added a clinic Insurance navigation workspace and patient Insurance tab. Requests send the selected `X-Tenant-Id`; patient workflows use patient-scoped routes and selected association IDs.
- Added patient association and policy revision forms, masked policy history, audited reveal controls when exact `patient_insurance.reveal` is granted, and manual eligibility/benefit observation forms. The association relationship captures self/spouse/child/other; the API has no separate dependent endpoint.
- Added patient-scoped claim draft/line/readiness/submission/correction flows, response history and additional-information requests, appeals, and prior-authorization drafts/requests/decisions/history. Staff-entered channels and provenance are labeled as observations; they do not transmit to insurers.
- Added provisional estimate history and authorized clean insurance evidence metadata. No protected URL, upload, or evidence-link action is exposed because backend evidence upload/link activation is disabled pending scanner controls.
- Added clinic lists for insurer catalog, remittance advice, nonposting receipts, insurer-obligation proposals and aggregate reports, plus receipt entry and obligation approval where exact permissions are present.
- Insurance permission decisions use exact clinic permission grants, without wildcard/admin UI shortcuts. The backend remains authoritative for endpoint denial.
- The UI states that estimates and insurer observations are unconfirmed and do not post cash, payments, receivables, patient credits, or benefit balances. No insurer integration or Settlement v2 control is present.

## Contract and safety gaps

This implementation is **not complete frontend acceptance**. The patient view does not yet provide a safe tenant-scoped selector for invoice items and patient/association lines. Accordingly, obligation proposal creation and remittance advice creation/correction are not offered; the API requires linked patient, association, invoice, or advice-line IDs and we do not accept arbitrary cross-context IDs. Receipt verification is not yet actionable from a selected receipt detail (receipt list/create are present). Catalog version editing/review/publication controls are also not implemented. These are UI coverage gaps, not claims that the backend endpoints are unavailable.

Evidence uploads and links are contractually unavailable while activation is disabled. The frontend cannot prove backend tenant/patient isolation, private document authorization, permission denial, or live API error envelopes without an available backend environment and browser session. The browser suite is not run in this change.

## Dependencies and checks

Dependencies were already installed; no package dependency or lockfile change was needed.

| Command | Result |
| --- | --- |
| `npm run test:insurance` | Exit 0; 34 focused assertions passed |
| `npx tsc --noEmit` | Exit 0 |
| `npm run lint` | Exit 0; 0 ESLint warnings or errors |
| `npm run build` | Exit 0; optimized production build generated 13 static pages |
| `git diff --check` | Pending final diff |

## Release risks and status

- Hosted PostgreSQL backend application and migration tests, tenant/patient IDOR tests, and permission-denial tests remain required as stated in PR #71.
- Live frontend/API browser acceptance has not been run. Current focused tests include source-level contract, tenant header, exact permission gate, validation and nonposting assertions; they do not test a real API.
- Remittance and obligation creation, receipt verification, catalog lifecycle, direct-link authorization, and protected document behavior need focused follow-up UI coverage against the backend.
- Keep P4-M7 open until frontend gaps are reviewed and the required hosted PostgreSQL backend evidence passes.

**Frontend acceptance: incomplete.** This branch adds supported patient workflows and safe clinic-level read/limited write views, and records remaining UI/API acceptance gaps. Do not merge as acceptance-complete until those gaps and required backend evidence are resolved.
