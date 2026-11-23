# P4-M7 Insurance v1 frontend acceptance

## Scope and backend contract

Reviewed frontend base `main` at `cd97596` (P4-M3 estimate workflow already merged). Backend contracts were read from `SaleemCastle/dental-booking-api` main snapshot `64afadb426d97774595040003bdf981cddfac19a`. The backend QA report is PR [#71](https://github.com/SaleemCastle/dental-booking-api/pull/71), whose checked-in acceptance report is blob `71127b4c0a8acb42aa36d83fb1f0cf1fe4c7f8d9`; it records M6 PR #70 merge `55d6b48` and says PostgreSQL application tests remain outstanding. The backend's OpenAPI and Postman artifacts are maintained in that repository; feature contracts are summarized in its `docs/insurance-v1-feature-coverage.md` and individual workflow documents.

## Frontend compatibility findings

The frontend contains a P4-M3 provisional estimate flow only. It calls:

- `GET /api/patients/{patient}/insurance-estimates?treatment_plan_id={plan}&latest_only=true&per_page=100`
- `POST /api/treatment-plans/{plan}/items/{item}/insurance-estimates`

These match `docs/insurance-estimates.md`. The request requires explicit service date and three-letter currency; optional association and benefit observation IDs are passed through. The visible flow requires `patients.view`, `treatment_plans.view`, and `insurance_estimates.create`; the invoice draft preview requires `insurance_estimates.view`. Estimate amounts are labeled provisional, unresolved/stale/superseded/currency differences are shown, and estimates are excluded from invoice write payloads. UI text says estimates do not confirm insurer acceptance or payment and do not post payment or receivable amounts.

No frontend client, screen, feature flag, or navigation entry was found for patient policies/evidence, eligibility checks, benefit observations, claims/responses, prior authorizations, appeals, remittance advice, insurer receipt observations, insurer obligations, or aggregate insurance reporting. Those backend contracts cannot be accepted by frontend tests in this repository. The existing reporting client supports clinic operational and billing reports only. Existing invoice payments are staff-entered settled payments; the payment method type contains no insurer option. No Settlement v2 activation, insurer allocation, refund, or insurer payment-posting UI is exposed in the reviewed billing client.

Authentication and clinic context are selected by the existing session provider. The estimate client uses the authenticated API session and patient-scoped URLs, consistent with existing treatment-plan calls. The focused checks verify the estimate route and permission gate, but do not establish backend tenant isolation or API authorization; the backend QA report requires hosted PostgreSQL tests for cross-tenant and patient IDOR cases.

## Checks

Dependencies were already installed and matched `package.json` (`npm ls --depth=0`, exit 0); no install was needed and `package-lock.json` was not changed. The focused frontend test covers the estimate paths/payloads, estimate permission gating, required input constraints, nonposting language, and the absence of insurer payment/reporting/Settlement v2 operations in current clients.

Final checks on this branch:

| Command | Result |
| --- | --- |
| `npm run test:insurance` | Exit 0; 21 focused assertions passed |
| `npm test` | Exit 0; all 23 Node test files passed |
| `npx tsc --noEmit` | Exit 0 |
| `npm run lint` | Exit 0; 0 ESLint warnings or errors |
| `npm run build` | Exit 0; optimized Next.js production build completed and generated 13 static pages |
| `git diff --check` | Exit 0 |

The build logged an outdated Browserslist database notice, webpack cache snapshot warnings, and the existing legacy Redux wrapper notice. These did not fail the build. Browser acceptance against a running API was not run; the focused suite is an isolated client contract/source check.

## Remaining release-QA risks and status

- There is no frontend/API consumer for the backend M1-M2 and M4-M6 insurance workflows listed above, so their loading, empty, validation, permission-denial, tenant/patient isolation, and error states remain unverified here.
- The focused frontend checks are contract and source-level checks; they do not exercise a live merged backend or browser flow.
- Backend hosted PostgreSQL API/security and migration checks remain required. PR #71 reports that earlier API tests could not reach assertions on SQLite and the hosted workflow did not run application jobs.
- This frontend evidence does not complete P4-M7. Keep the ticket open until the frontend gaps and required hosted PostgreSQL evidence are reviewed and accepted.

**Frontend acceptance: incomplete.** This PR verifies the implemented estimate slice and records missing frontend consumers and release-QA dependencies. No backend code, frontend product flow, or Settlement v2 behavior is added.
