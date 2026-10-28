# Laravel Breeze - Next.js Edition 🏝️

## Introduction

This repository is an implementation of the [Laravel Breeze](https://laravel.com/docs/starter-kits) application / authentication starter kit frontend in [Next.js](https://nextjs.org). All of the authentication boilerplate is already written for you - powered by [Laravel Sanctum](https://laravel.com/docs/sanctum), allowing you to quickly begin pairing your beautiful Next.js frontend with a powerful Laravel backend.

## Official Documentation

### Installation

First, create a Next.js compatible Laravel backend by installing Laravel Breeze into a [fresh Laravel application](https://laravel.com/docs/installation) and installing Breeze's API scaffolding:

```bash
# Create the Laravel application...
laravel new next-backend

cd next-backend

# Install Breeze and dependencies...
composer require laravel/breeze --dev

php artisan breeze:install api

# Run database migrations...
php artisan migrate
```

Next, ensure that your application's `APP_URL` and `FRONTEND_URL` environment variables are set to `http://localhost:8000` and `http://localhost:3000`, respectively.

After defining the appropriate environment variables, you may serve the Laravel application using the `serve` Artisan command:

```bash
# Serve the application...
php artisan serve
```

Next, clone this repository and install its dependencies with `yarn install` or `npm install`. Then, copy the `.env.example` file to `.env.local` and supply the URL of your backend:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Finally, run the application via `npm run dev`. The application will be available at `http://localhost:3000`:

```
npm run dev
```

> Note: Currently, we recommend using `localhost` during local development of your backend and frontend to avoid CORS "Same-Origin" issues.

### Authentication Hook

This Next.js application contains a custom `useAuth` React hook, designed to abstract all authentication logic away from your pages. In addition, the hook can be used to access the currently authenticated user:

```js
const ExamplePage = () => {
    const { logout, user } = useAuth({ middleware: 'auth' })

    return (
        <>
            <p>{user?.name}</p>

            <button onClick={logout}>Sign out</button>
        </>
    )
}

export default ExamplePage
```

> Note: You will need to use [optional chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) (`user?.name` instead of `user.name`) when accessing properties on the user object to account for Next.js's initial server-side render.

### Named Routes

For convenience, [Ziggy](https://github.com/tighten/ziggy#spas-or-separate-repos) may be used to reference your Laravel application's named route URLs from your React application.

## Patient documents workspace

Patient details → Medical Record includes Documents & imaging. Clinical staff can upload one PDF, JPEG, PNG or WebP at a time, optionally linking a patient appointment or clinical note. Admin and Dentist roles can read; delegated `patient_documents.view` grants read access. Writes require Admin or Dentist without Receptionist, independently of permission wildcards. Archived patients can still receive documents.

Requests use Sanctum authentication and the current clinic's `X-Tenant-Id` header. Previews and downloads fetch the private API attachment; no bucket URL or bearer link is used. Images use temporary browser object URLs. PDFs render locally with [PDF.js](https://mozilla.github.io/pdf.js/getting_started/) to canvas, without a scripting or interactive annotation layer. Closing a preview aborts outstanding retrieval and releases its resources. Previewing opens the download endpoint and produces the backend's normal download audit.

Use Node 22.13+ (or Node 24+) for PDF.js. `npm run dev` and `npm run build` prepare its versioned worker, fonts, CMaps and WASM files under `public/pdfjs/`; include those generated static assets when deploying. They contain library code only. The PDF library loads when a PDF is previewed.

The browser limit defaults to 20 MiB. If the API's `PATIENT_DOCUMENT_MAX_SIZE_KB` changes, set `NEXT_PUBLIC_PATIENT_DOCUMENT_MAX_SIZE_KB` to the same KiB value **before building**. Browser checks are advisory; server content detection, relationship validation and size limits remain authoritative. A 413 may come from PHP or the proxy.

Archive retains authenticated retrieval and cannot be undone in this UI. Removal revokes access first; a 503 leaves a visible retry action for finishing storage removal. This retry state lasts for the current workspace session. Operations must monitor and replay pending purges using the backend workflow after navigation or reload. If an upload response is lost, refresh the list before retrying to avoid duplicates.

Run `npm test` and `npm run build`. With a production server at port 3013, run `npm run test:patient-documents:browser` (Node 22+, Chrome/Edge, or `BROWSER_PATH`). Override `DOCUMENTS_TEST_URL` and `DOCUMENTS_TEST_API_URL` if needed. Browser checks intercept the API and never contact a live bucket; staging still needs an end-to-end smoke test against the configured provider.

## Hosted invoice payments

Open Billing from the sidebar or patient details and select an invoice. Admin and Billing can generate, refresh and request cancellation of checkouts; Auditor can read and share existing active links. Explicit `payment_links.view|create|cancel|refresh` grants and resource/action wildcards also apply. Reading invoice details still requires invoice read access. Deploy the online payment API, run its migrations and reseed permissions, and provision the clinic provider from the trusted backend console before use. Provider credentials never belong in frontend environment variables.

Generate payment link reserves the remaining balance on an issued/partially-paid invoice. Only the idempotency key is posted. The full paginated history is checked before enabling a new checkout, manual payment or void action. Active, creating, pending, unknown and unreconciled completed attempts keep those actions paused. Expiry timestamps alone do not release a checkout. Refresh payment status uses the authenticated backend reconciliation endpoint, then reloads the invoice, ledger, balances and dashboard. Returning from hosted checkout alone does not mark an invoice paid. HandyPay cancellation currently reports an unsupported operation and leaves the checkout payable.

Copy and Open recheck stored link state and expose HTTPS checkout URLs only while active. Resend opens a staff-reviewed email draft with the existing checkout link; this API has no message-delivery endpoint, so the application does not automatically send email. The draft contains no invoice lines or patient details.

An uncertain creation retains its original key in tab-scoped session storage, scoped by clinic and invoice, so a reload or navigation can retry the same operation. Only keys are stored there. Inspect attempt history after failures. An unknown outcome needs provider reconciliation; do not clear browser state to start another checkout. The backend remains authoritative for duplicate protection and all invoice locks.

Run `npm test` and `npm run build`. With the frontend served on port 3017, run `npm run test:payment-links:browser` and `npm run test:billing:browser` with Node 22+ and Chrome/Edge (or `BROWSER_PATH`). Override `BILLING_TEST_URL` and `BILLING_TEST_API_URL` for other origins. Browser checks stub all API traffic and do not contact HandyPay. Complete the backend's merchant sandbox checklist separately before enabling live payments.

## Operational reporting

Open **Reports** in the clinic sidebar (`/?tab=reports`). Reports use the authenticated clinic ID in `X-Tenant-Id`, source read permissions and the four `/api/reports/*` aggregate endpoints. Appointment read grants appointment/provider activity; treatment activity also needs treatment read. Billing requires both invoice and payment read (including Admin, Billing and Auditor policies). Capacity columns require availability read. `reports.*` grants no access.

Filters accept inclusive UTC calendar dates (at most 366), and an optional canonical integer provider ID. Provider/treatment pages stay bounded to 25, 50 or 100 rows. API filter echoes and pagination are verified before displaying results. Results live only in component memory; filter/session changes cancel requests and hide previous results. Financial decimal strings are displayed per currency without summing or recalculating money in the browser. Metric definitions explain current-state status, planned duration, current schedule capacity, issue-date invoice cohorts and payment-date collections. Reports are not accounting snapshots, and this milestone does not provide detailed exports.

Response fields and semantics were cross-checked with the backend `ReportController`, `ReportRequest`, `ReportingService`, `ApiResponse` and `ReportingApiTest`. `npm run test:reporting` checks the request contract, source permissions, UTC boundaries, decimal preservation and representative backend metric fixtures; it is included in `npm test`.

Run `npm run build`. For browser checks, serve the app on port 3019 and run `npm run test:reporting:browser` with Node 22+ and Chrome/Edge (or `BROWSER_PATH`). Override `REPORTING_TEST_URL` and `REPORTING_TEST_API_URL` for other origins. Browser checks intercept all API traffic and cover request cancellation, permission changes, pagination, loading/error/empty states, multi-currency rendering and mobile overflow. A live staging API smoke test is separate from these mocked checks.

## Contributing

Thank you for considering contributing to Breeze Next! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

Please review [our security policy](https://github.com/laravel/breeze-next/security/policy) on how to report security vulnerabilities.

## License

Laravel Breeze Next is open-sourced software licensed under the [MIT license](LICENSE.md).
