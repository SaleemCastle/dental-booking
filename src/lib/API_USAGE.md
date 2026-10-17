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

`TreatmentSelector` provides active treatments for the appointment form in
Calendar. Reuse this component instead of maintaining a separate list or
hardcoded options:

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

## Appointment Workflow

Calendar (`/?tab=calendar`) displays a daily schedule ordered by start time,
with provider and status filters. Dates, time inputs, and displayed ranges use
UTC to match the API's `date` filter. Overnight appointments show the end date;
the daily list includes appointments that **start** on the selected date.

`src/services/appointments.ts` normalizes canonical numeric identifiers and
display fields. Writes use canonical snake_case fields. Editing sends only
changed fields, preserving historical patient/treatment links and workflow
timestamps. Moving a booking updates the previous and new day caches and the
detail cache. All successful appointment mutations also invalidate the current
user's dashboard summary when they have `dashboard.view`. Mounted dashboards
refresh immediately; an unmounted dashboard fetches fresh data on return.
Failed list/dashboard refreshes render an error with retry without treating a
successful save as a failed mutation.

The dashboard's Book appointment and View buttons open the same appointment
form/detail components used by Calendar. Both entry points share the mutation
refresh hook. The form and its parent protect pending writes with synchronous
submission locks, and Save/Cancel/close controls are disabled during a save.

The admin role can create and update appointments. Other users need explicit
`appointments.create` and `appointments.update` permissions; the legacy
navigation fallback grants neither. Viewing requires `appointments.view`.
Patient selection additionally requires `patients.view`; treatment selection
requires `treatments.view`. Booking can omit treatment and location. Provider
choices use `GET /api/dentists`; rooms with nested chairs come from
`GET /api/appointment-locations`. Selector failures preserve existing links.

Room changes clear the chair. Location changes submit both `room_id` and
`chair_id`, including nulls when clearing a reservation. The location selector
lists inventory; only the save endpoint determines availability. Provider,
room, chair, and time conflict messages are shown next to their fields and in
the form's error summary.

Detail actions follow the backend workflow: check in, start treatment,
complete, cancel, and mark no-show. Cancellation offers an optional reason and
retains history. Closed appointments expose descriptive edits and lock
scheduling fields. The UI deliberately uses cancellation rather than physical
deletion.

Status actions require `appointments.update` (or the admin role). The UI only
offers check-in/no-show for scheduled appointments, start treatment for
checked-in appointments, completion for in-progress appointments, and
cancellation for any active status. Terminal appointments offer no status
actions. Cancellation/no-show require an inline confirmation; cancellation
reasons are limited to 2000 characters and sent as `cancellation_reason`.

Pending actions lock all action/edit/close controls and announce progress.
Field and status errors remain visible without discarding the cancellation
reason. After a rejected transition (422/409), details fetch the current
appointment and synchronize schedule/dashboard caches without a success
notice. Invalid confirmations disappear when the new status disallows them.
If that fresh read fails, actions remain locked until Refresh appointment
succeeds. A backend 403 removes mutation controls. Dashboard badges retain the
workflow status; payment reminders appear separately from completion status.

Run `npm run test:appointments` for API requests, UTC and overnight ranges,
partial update payloads, location consistency, workflow rules, permissions,
cross-date cache updates, dashboard refresh/permissions, all 30 combinations
of roles and statuses, and schedule loading/error/empty rendering.

For browser regression checks, start the app and run
`npm run test:appointments:browser` (Node 22+ and Chrome, Edge, or Chromium).
Set `APPOINTMENT_TEST_URL` to use another frontend URL, `APPOINTMENT_TEST_API_URL`
to match its configured backend URL, and `BROWSER_PATH` for another browser
executable. Backend requests are intercepted and mocked: the check never
creates or edits live appointments. It verifies canonical numeric selections,
required-field validation, backend conflict/server errors, double submission
while requests are pending, and dashboard/schedule refresh after create/edit
and status actions. Status checks cover cancellation from every active status,
reason validation/retention, invalid-transition recovery (including a failed
fresh read), server errors/retry, and admin/staff/read-only/403 behavior.
