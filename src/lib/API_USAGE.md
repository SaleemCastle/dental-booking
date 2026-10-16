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

## Treatment Catalog

The catalog is available at `/?tab=treatments`. It uses the treatment contract
from `http://localhost:8080/openapi.yaml` through `src/services/treatments.ts`:

- `GET /api/treatments` returns all treatments without pagination.
- The active and inactive filters send `active=1` and `active=0` respectively.
- `POST /api/treatments` creates a treatment; `PATCH /api/treatments/{id}` edits it.
- Deactivation uses `DELETE /api/treatments/{id}`, which retains historical
  appointment references. Activation patches `{ active: true }`.

The admin role has full catalog access. Other sessions need `treatments.view`
to load the catalog or selector, `treatments.create` to create,
`treatments.update` to edit/reactivate, and `treatments.delete` to use the
deactivation action. Editing the active checkbox also uses the documented
update permission. Legacy sessions without roles or permissions receive no
treatment permissions. The backend remains responsible for enforcing access.

`TreatmentSelector` provides active treatments for appointment forms. The
current Calendar module has no booking form; use this component when adding
that form instead of maintaining a separate list or hardcoded options:

```tsx
import TreatmentSelector from '../components/TreatmentSelector'

<TreatmentSelector
    value={appointment.treatmentId ?? null}
    required
    onChange={treatment =>
        setAppointment(previous => ({
            ...previous,
            treatmentId: treatment?.id ?? null,
            durationMinutes: treatment?.duration_minutes ?? 30,
        }))
    }
/>
```

`useTreatments(true)` requests `active=1`. Its cache is scoped to the current
user and permissions. Catalog mutations update all three cached filters and
revalidate mounted consumers, including selectors. A selector clears a
selection that is no longer active and exposes loading, empty, permission,
validation, and API error states. Historical appointments can continue to
display their stored treatment references independently of this selector.

Run `npm run test:treatments` for the API, validation, cache, and rendering
checks, and `npm run test:permissions` for catalog authorization checks.
