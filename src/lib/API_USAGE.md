# API Usage Conventions

Use `src/lib/api.ts` for all frontend HTTP calls. Hooks, services, and
components should not import Axios directly or inspect raw Laravel/Axios error
objects.

Responses are normalized centrally into `ApiResponse<T>`:

```ts
{
    success
    statusCode
    message
    code
    data
    errors
    meta
    requestId
}
```

Failures throw `ApiError` with `statusCode`, `message`, `code`, `errors`, and
`requestId`. Preserve backend `code` values for business logic; the client only
falls back to HTTP-derived codes when the backend omits one.

Forms should render field messages from `ApiError.errors`. Paginated services
should preserve envelope `meta` on their typed return shape. Call
`ensureCsrfCookie()` before Sanctum-protected mutating auth requests.

The shared client emits `api:unauthorized` on `401`; authenticated flows listen
for that event, clear session state, and route users back to `/login`.

## Session Readiness

`AuthSessionProvider` in `_app.tsx` is the single owner of `/api/user`
resolution. Components should use `useAuth()` or `useAuthSession()` and check
`status`, `isLoading`, or `isAuthenticated` before running authenticated API
calls. Do not create another session fetcher in a component.
