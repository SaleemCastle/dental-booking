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

## Contributing

Thank you for considering contributing to Breeze Next! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

Please review [our security policy](https://github.com/laravel/breeze-next/security/policy) on how to report security vulnerabilities.

## License

Laravel Breeze Next is open-sourced software licensed under the [MIT license](LICENSE.md).
