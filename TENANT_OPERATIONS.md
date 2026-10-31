# Controlled clinic onboarding frontend

Operators enter at `/platform` (or `/platform/login` to sign in). This uses the
existing session login and centralized API client. No platform grant flag is
expected in a user response. A successful `GET /api/platform/tenants` authorizes
the controls; clinic roles and wildcard clinic permissions never do. Denials,
including failed revalidation, hide profiles and all platform controls.

The platform route loads account identity without resolving clinic membership.
It sends no tenant header and does not alter the selected clinic. Ordinary clinic
routes keep their existing server-selected, active-membership session checks.
Entering clinic routes as an operator still requires normal clinic membership.
No platform navigation or controls are added to the clinic-admin workspace.

The platform workspace lists clinics (25 per backend page), reads their profiles,
and supports activation/suspension with an explicit confirmation. Profiles show
status, contact information, timezone, currency and branding references. Logo
references are displayed as text and are not fetched. List pagination reads the
standard envelope metadata (`meta.pagination`, or flat `meta`), including
`lastPage`/`last_page`; list data is `data.tenants`.

Provisioning accepts clinic, contact, timezone/currency, optional branding and
new-admin details. The browser generates an editable, globally unique request key and keeps
the submitted payload in memory for exact retries after uncertain failures.
Fields lock until retry succeeds or the operator explicitly starts a new request.
A 422 response permits corrections because validation did not commit a clinic.
An identical retry returning 200 is reported as recovery of the original request,
including its actual status; it never implies reactivation. A successful response
clears the password and submitted payload. Credentials are never put in browser
storage, URL parameters or logs. Reloading/leaving discards the in-memory request;
operators must retain original inputs securely when recovery across reloads is
needed, then enter the original key and inputs in the form. The UI does not automatically retry writes.

All loading, validation, conflict, denial and network results use the existing
central API response/error normalization. Backend middleware remains the authority
for every request, including operator revocation on existing sessions.

## Clinic profile settings

Clinic administrators can view their current clinic profile in Settings. The
profile is read from `GET /api/tenants`, selecting only the active membership
matching the verified session's `current_tenant_id`. Other membership profiles
are never displayed or used as a fallback. Stale profiles are hidden after errors.
Existing communication settings remain available on the same screen.

The confirmed backend contract has no clinic-admin profile update endpoint.
Settings therefore explains that profile updates are unavailable and provides no
edit or status controls. Profile maintenance remains a backend dependency for
the original acceptance criterion. Provisioning configures timezone, currency,
contact and branding basics for new clinics.

This is a frontend repository with no Artisan executable or migrations. Run
`php artisan migrate` and `php artisan test --filter=TenantProvisioningTest` in the
backend deployment/repository. Grant/revoke operators there with the documented
`php artisan platform:operator` command. No operator is created by this frontend.

## Verification

`npm run test:platform-tenants` covers platform request contracts, exact payload
forwarding, normalized errors and account sessions without membership.
`npm run test:platform-tenants:browser` runs against a local app (default port 3000)
with all backend traffic mocked. It checks wildcard-admin denial, operator-only
access, profiles, status actions, validation, exact retries, password clearing,
mobile overflow, revocation and unauthenticated redirects. Override app/API origins
using `PLATFORM_TEST_URL` / `PLATFORM_TEST_API_URL`.

Existing auth/tenant-session and permission tests must continue to pass. Run
`npm run build` for production validation.
