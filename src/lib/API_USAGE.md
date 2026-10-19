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

Dashboard metrics, today's appointments, and staff workload all come from
`GET /api/dashboard/summary`. Summary counts are rendered as supplied by the
backend rather than inferred from the displayed list. The summary refreshes
every 30 seconds while visible/online, on focus/reconnect, on return to the
dashboard, and with Refresh dashboard. Local appointment writes invalidate the
same user-scoped summary cache immediately. Polling also picks up other staff's
changes and the new UTC day. Appointment times and the daily heading use UTC.
`/dashboard` opens the same authenticated workspace as `/?tab=dashboard`.

Initial loading has a progress announcement and skeletons. Failed refreshes
hide unavailable summary content and offer retry; they do not display assumed
zero metrics or a fake collection rate. Successful empty responses show the
backend's actual zeros plus explicit appointment/workload empty states. Generic
inactive search/edit/print controls are omitted from the overview.

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
Dashboard checks also exercise the legacy route, UTC display in a Bogota
browser, nonzero backend metrics/workload, loading/error/empty states, and
polling/focus/reconnect/manual refresh after changes made outside the UI. These
browser checks use a mocked API; they do not establish live database behavior.

## Clinical Notes

Open a patient from Patient List to see the clinical note timeline. Admins and
dentists without a receptionist role can create, edit, and delete notes from
any author. Other users require `clinical_notes.view` or its read wildcard
equivalent and receive a read-only timeline. A receptionist role prevents writes
even alongside dentist or wildcard permissions; admin is the explicit override.
The backend remains the authority for every request, including expired access.

The form selects a provider record independently of the authenticated user.
An optional appointment selector includes all statuses for the current patient;
selecting a visit selects its provider. Detach the visit before changing the
provider independently. Appointment browsing requires `appointments.view`.
Archived patients support clinical notes. Existing links remain intact when
editing text, and choosing no appointment explicitly sends `appointment_id: null`.
The client sends only changed relationship IDs and text on edit; authorship,
last editor, and timestamps are server-controlled.

`src/services/clinical-notes.ts` uses the standard envelope and
`meta.pagination`. Notes load newest first with Load older notes. The timeline
shows persisted creation and last-edit attribution, including unknown legacy
authors; it does not infer a full revision history. Note caches are scoped to
the session and patient. Successful writes immediately update the timeline and
refresh loaded pages. Focus/reconnect and Refresh notes pick up other staff's
changes. A failed refresh preserves a successful write and offers retry. Backend
403 responses hide unavailable note content and disable rejected write controls.

Run `npm run test:clinical-notes` for API, validation, partial-update, attribution,
permission, and rendering checks. With the app running, run
`npm run test:clinical-notes:browser` using Node 22+ and Chrome, Edge, or Chromium.
Set `CLINICAL_NOTES_TEST_URL`, `CLINICAL_NOTES_TEST_API_URL`, or `BROWSER_PATH` to
override the frontend URL, its configured backend origin, or browser executable.
All backend requests are mocked. Browser checks cover create/edit/link/detach/
delete, duplicate submissions, relationship errors, failed refreshes, collaborative
attribution, pagination, archived patients, provider/appointment loading failures,
and role restrictions. They do not mutate live records or verify database behavior.

## Assigned Tasks and Follow-ups

The dashboard's My tasks worklist uses `GET /api/tasks?assigned_to_me=1`.
It is independent of the summary's provider workload and remains usable if the
summary endpoint fails. All task statuses are included initially; due-date and
status filters combine on the backend before pagination. Boolean filters are
sent as `1` or `0`, and changing filters resets the page. The API's due-date/ID
ordering and pagination metadata are preserved.

Due today and overdue refer to the clinic's UTC calendar date, not the browser's
timezone or a rolling 24-hour period. Only pending and in-progress tasks receive
due/overdue badges. Completed and cancelled tasks retain their due dates without
being presented as late work. Completion uses
`PATCH /api/tasks/{id}/status` with only `{"status":"completed"}`; the server
supplies completion timestamps. Only open tasks offer Mark complete in this UI.

Read access requires `tasks.view`, and completion additionally requires
`tasks.update`. Admin and M1 resource/action wildcard grants are supported.
Assignment and other staff roles grant no task access. Clinical-note writes
continue to use their separate role-only policy. Related-patient and appointment
buttons require their own read permissions. Patient links load detail by canonical
ID, including archived records outside the current list page, with loading/error/
retry states. Appointments open in the existing detail workflow.

Task caches include the session, filters, page, and current UTC date. Successful
completion updates the current list immediately, refreshes it, and invalidates
the user's dashboard summary. A completed task leaves due-date/open-status
filters immediately; a page that becomes empty at the end of the list returns
to the new last page. Failed refreshes preserve successful completion and offer
retry. Task and dashboard refresh buttons, 30-second visible/online polling,
focus/reconnect, and returning to the dashboard fetch current work. Task errors
do not replace working appointment/metric sections. A read 403 hides cached task
content, and a write 403 removes completion controls.

Run `npm run test:tasks` for API envelopes/filters, wildcard/role permissions,
UTC midnight boundaries, completion locking/cache refresh, and panel states.
With the app running, `npm run test:tasks:browser` uses Node 22+ and Chrome,
Edge, or Chromium. Override `TASKS_TEST_URL`, `TASKS_TEST_API_URL`, or `BROWSER_PATH`
as needed. The browser checks intercept all backend requests; they cover assigned
scope, due/status filters, UTC rollover in a Bogota browser, context links/errors,
completion and failed refreshes, pagination shrinkage, and permission scenarios.
They do not change live records or verify database behavior.

### Patient follow-up workflow (M6)

Patient detail includes a Follow-ups & tasks panel with a paginated patient
timeline. It requests `GET /api/tasks?patient_id={id}` without assignment or status
filters, so staff see related work across assignees and retain completed tasks.
Loaded entries are deduplicated and ordered by completion/creation time. Use Load
more follow-ups to retrieve further pages (the API pages are ordered by due date).
Completed entries show the server's `completed_at` timestamp and never show an
overdue badge or completion action. Archived patients retain their task history.

Patient detail requires `patients.view`; task reads, creation, and completion
additionally require `tasks.view`, `tasks.create`, and `tasks.update` respectively.
No staff role or assignment implicitly grants access. A read 403 hides cached
entries; a create/update 403 disables only the denied operation until the panel
is reopened. Loading, empty, validation, permission, missing-record, network, and
server-error states include actionable feedback and refresh/retry controls.

Create follow-up sends `POST /api/tasks` with `patient_id`, nullable
`appointment_id`, `assignee_id`, date-only `due_date`, `priority`, and `description`.
Priority is low/normal/high/urgent. The initial assignee is the authenticated user;
the assignee directory uses authenticated `GET /api/users` (`data.users`, user IDs,
not dentist IDs). Only ID/name are retained by the form's directory cache. Directory
failure allows self-assignment and retry. Optional appointment choices use the
existing appointment endpoint, filtered to the current patient across all visit
statuses, and require `appointments.view`. Appointment failure still permits an
unlinked follow-up. Past due dates are valid; impossible dates, blank descriptions,
and descriptions over 16,000 characters are rejected. Backend 422 field errors
retain input and focus the first invalid field.

Synchronous locks prevent duplicate creates/completions. Successful responses
update patient history before refreshing all loaded pages and invalidating the
session's dashboard summary. Refresh failures retain the saved entry and report
that the write succeeded. Patient caches include the authenticated session and
patient ID, revalidate on mount/focus/reconnect, and never expose another patient's
tasks. Returning to My tasks revalidates its assigned list.

`npm run test:tasks` includes patient follow-up service, validation, hook, cache,
and permission regression checks. With the app running,
`npm run test:follow-ups:browser` exercises creation with and without appointment
context, staff assignment, completion history, patient isolation, pagination,
validation, duplicate protection, refresh failures, and permission changes. Set
`FOLLOW_UPS_TEST_URL`, `FOLLOW_UPS_TEST_API_URL`, or `BROWSER_PATH` as needed. Backend
requests are mocked; these checks do not verify a deployed backend/database.

## Audit Viewer (M7)

Open Audit Logs at `/?tab=audit_logs`. The existing authenticated client sends
credentials and Accept headers. Audit GETs do not need an extra CSRF request.
Navigation, the viewer hook, and all audit service methods require a role object
in `/api/user` with `roles[].slug` exactly `admin` or `auditor`. Display names,
string roles, legacy aliases, permission wildcards, `audit_logs.view`, and
super-admin flags alone do not grant access. The API checks current membership
on every request; frontend guards supplement that server policy.

The implementation follows the supplied guide and the local backend's
`AuditLogController`, `AuditLogResource`, `ListAuditLogsRequest`, and
`AuditLogPolicy`. The earlier proposed contract has been replaced:

| Read | Response |
| --- | --- |
| `GET /api/audit-logs` | `data.auditLogs`, `meta.pagination` |
| `GET /api/audit-logs/filters` | `data.actions`, `data.resourceTypes` |
| `GET /api/audit-logs/{id}` | `data.auditLog` |

Rows use `actorName`, `actor_id`, `action`, `resource_type`, string `resource_id`,
`occurred_at`, nullable `ip_address`/`user_agent`, and nullable allowlisted
`request_metadata` (`request_id`, `method`, `route`). Null attribution displays
System / unauthenticated; a non-null actor ID with no current name displays
Deleted user #ID. Actor names are current names, not historical snapshots.
IP/user agent and the exact six-digit timestamp are shown in the detail dialog.
All values are escaped text. No resource links imply underlying API access.

Filters combine on the server before pagination: `actor_id`, `actor_is_null`,
`action`, `resource_type`, string `resource_id`, `request_id`, `from`, and `to`.
Empty filters are omitted. Attribution uses `1`/`0`, and choosing unattributed
records clears/disables user ID. Resource and action suggestions load once on
opening the viewer, independently of active filters; exact tokens remain usable
when suggestions fail or are empty. Actor history works for deleted accounts
without a user-directory query. Related activity uses the row's originating
mutation request ID, never the top-level GET request ID.

Valid text/ID filters debounce for 500 ms; Apply submits immediately. Invalid
filters stay local, and changing applied filters resets page 1. Query values are
encoded with URLSearchParams, preserving positive offsets and resource keys such
as `00042`. From/through fields accept inclusive RFC 3339 timestamps with seconds,
explicit Z/offset, and optional 1-6 fractional digits. Local validation compares
offsets and microseconds without Date's fractional truncation. A full offset day
ends at `23:59:59.999999` with that offset. Display timezone can change independently
of filter bounds; it never silently converts input. Raw timestamps remain available
in list time-element titles and detail text.

Results follow backend occurrence-time/ID descending order, 25 per page. Explicit
refresh returns to page 1. Pagination retains bounds, including an explicit `to`;
a note explains that new records may shift offset-based pages. Filtering never
loads the full history. Detail reads use the audit ID, not the resource ID.

Audit reads use component-local state, outside the shared SWR cache. Each request
has an AbortController bridged to Axios 0.21 CancelToken through the existing API
client. Obsolete/cancelled replies cannot replace new results or errors. User/key
checks suppress previous data immediately, and pending work is cancelled on
filter changes, detail close, account/access changes, logout, and unmount. Payloads
are not persisted to browser storage, service workers, analytics, or error reports.
Server responses provide Cache-Control: private, no-store.

401 clears protected state through the normal session/login flow. 403 clears all
audit results/detail/options and refreshes session membership. A missing detail
is marked unavailable with retry/close. 422 messages appear under corresponding
filters; read failures show their top-level GET request ID. Network/5xx errors
allow retry. 429 disables new reads/retries for 30 seconds with no automatic retry
or polling. Loading and empty states are independent for list/options/detail.

The frontend exposes only GET audit services. It has no mutation, bulk, export,
audit-event submission, or migration behavior. Filter/history/detail buttons only
read data. The backend rejects unsupported write methods with 405.

Run `npm run test:audit-logs` for role, service, cancellation, precision, rendering,
and error checks. With the app running, `npm run test:audit-logs:browser` verifies
the documented contract using mocked HTTP, including delayed list/detail replies,
account changes, logout, revocation, options, 422 and rate limiting. Override
`AUDIT_LOGS_TEST_URL`, `AUDIT_LOGS_TEST_API_URL`, or `BROWSER_PATH` as needed. Mocked
checks do not exercise a deployed database or replace the backend's
`tests/Feature/Api/AuditLogApiTest.php` authorization/immutability coverage.
