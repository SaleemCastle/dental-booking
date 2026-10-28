import React, { FormEvent, ReactNode, useRef, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { useReport } from '../hooks/reporting'
import { ApiFieldErrors } from '../lib/api'
import { getReportingPermissions } from '../lib/permissions'
import {
    defaultReportFilters,
    metricDefinitions,
    reportAmount,
    ReportFilters,
    ReportKind,
    reportKinds,
    reportLabels,
    reportStatuses,
    statusLabel,
    validateReportFilters,
} from '../lib/reporting'
import {
    AppointmentReport,
    CurrencyReport,
    ProviderReport,
    TreatmentReport,
} from '../services/reporting'

const input =
    'mt-1 w-full rounded-md border border-clinic-line bg-white px-3 py-2 text-sm focus:border-clinic-blue focus:ring-clinic-blue'
const button =
    'rounded-md border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-blue disabled:cursor-not-allowed disabled:opacity-50'
const cell =
    'whitespace-nowrap border-b border-clinic-line px-4 py-3 text-left text-sm'
type Metric = keyof typeof metricDefinitions
const Definition = ({
    metric,
    children,
}: {
    metric: Metric
    children: ReactNode
}) => <span title={metricDefinitions[metric]}>{children}</span>
const Definitions = ({ metrics }: { metrics: Metric[] }) => (
    <details className="rounded-md border border-clinic-line bg-clinic-canvas p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-clinic-blue">
            Metric definitions
        </summary>
        <dl className="mt-3 space-y-3">
            {metrics.map(metric => (
                <div key={metric}>
                    <dt className="font-semibold capitalize">
                        {statusLabel(metric)}
                    </dt>
                    <dd className="mt-1 text-clinic-muted">
                        {metricDefinitions[metric]}
                    </dd>
                </div>
            ))}
        </dl>
    </details>
)
const Table = ({
    label,
    headers,
    children,
}: {
    label: string
    headers: ReactNode[]
    children: ReactNode
}) => (
    <div
        role="region"
        aria-label={`${label}, scroll horizontally for more columns`}
        tabIndex={0}
        className="max-w-full overflow-x-auto rounded-md border border-clinic-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-blue">
        <table className="w-full border-collapse bg-white">
            <caption className="px-4 py-3 text-left text-sm font-semibold">
                {label}
            </caption>
            <thead className="bg-clinic-canvas">
                <tr>
                    {headers.map((header, index) => (
                        <th
                            key={index}
                            scope="col"
                            className={`${cell} font-semibold`}>
                            {header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    </div>
)
const Empty = ({ children }: { children: ReactNode }) => (
    <p
        role="status"
        className="rounded-md border border-dashed border-clinic-line p-6 text-sm text-clinic-muted">
        {children}
    </p>
)
const metricHeader = (metric: Metric, label: string) => (
    <Definition metric={metric}>{label}</Definition>
)
const capacityValue = (value: number | null) =>
    value === null ? 'Unavailable' : value.toLocaleString()

function Appointments({ data }: { data: AppointmentReport }) {
    const largest = Math.max(
        1,
        ...reportStatuses.map(status => data.by_status[status]),
    )
    return (
        <>
            <div className="rounded-md border border-clinic-line bg-clinic-sky p-5">
                <h3 className="text-sm font-semibold">
                    <Definition metric="appointment_count">
                        Total appointments
                    </Definition>
                </h3>
                <p className="mt-1 text-3xl font-extrabold text-clinic-blue">
                    {data.appointment_count.toLocaleString()}
                </p>
            </div>
            <div
                aria-label="Appointment status summary"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reportStatuses.map(status => (
                    <div
                        key={status}
                        className="rounded-md border border-clinic-line p-4">
                        <div className="flex justify-between gap-3 text-sm">
                            <span className="capitalize">
                                {statusLabel(status)}
                            </span>
                            <strong>
                                {data.by_status[status].toLocaleString()}
                            </strong>
                        </div>
                        <div
                            aria-hidden="true"
                            className="mt-3 h-2 rounded bg-clinic-canvas">
                            <div
                                className="h-2 rounded bg-clinic-blue"
                                style={{
                                    width: `${
                                        (data.by_status[status] / largest) * 100
                                    }%`,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
            <Definitions metrics={['appointment_count']} />
            {data.appointment_count === 0 ? (
                <Empty>
                    No appointments in this period for the selected providers.
                </Empty>
            ) : (
                <>
                    <p className="text-sm text-clinic-muted">
                        Daily counts use UTC scheduled dates. Dates with no
                        appointments are omitted.
                    </p>
                    <Table
                        label="Appointments by date (UTC)"
                        headers={[
                            'Date',
                            'Total',
                            ...reportStatuses.map(statusLabel),
                        ]}>
                        {data.by_date.map(day => (
                            <tr key={day.date}>
                                <th
                                    scope="row"
                                    className={`${cell} font-semibold`}>
                                    {day.date}
                                </th>
                                <td className={cell}>
                                    {day.appointment_count}
                                </td>
                                {reportStatuses.map(status => (
                                    <td key={status} className={cell}>
                                        {day.by_status[status]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </Table>
                </>
            )}
        </>
    )
}
function Providers({
    rows,
    capacity,
}: {
    rows: ProviderReport[]
    capacity: boolean
}) {
    return (
        <>
            <p className="text-sm text-clinic-muted">
                Every current clinic provider is included, even with zero
                activity. Provider IDs are the canonical clinic IDs.
            </p>
            <Definitions
                metrics={[
                    'appointment_count',
                    'booked_minutes',
                    'completed_minutes',
                    ...(capacity
                        ? ([
                              'available_minutes',
                              'occupied_minutes',
                              'utilization_percent',
                          ] as Metric[])
                        : []),
                ]}
            />
            {!rows.length ? (
                <Empty>No providers match these filters.</Empty>
            ) : (
                <Table
                    label="Provider activity"
                    headers={[
                        'Provider',
                        metricHeader('appointment_count', 'Appointments'),
                        ...reportStatuses.map(statusLabel),
                        metricHeader(
                            'booked_minutes',
                            'Planned booked minutes',
                        ),
                        metricHeader(
                            'completed_minutes',
                            'Planned completed minutes',
                        ),
                        ...(capacity
                            ? [
                                  metricHeader(
                                      'available_minutes',
                                      'Available minutes',
                                  ),
                                  metricHeader(
                                      'occupied_minutes',
                                      'Occupied minutes',
                                  ),
                                  metricHeader(
                                      'utilization_percent',
                                      'Utilization',
                                  ),
                              ]
                            : []),
                    ]}>
                    {rows.map(row => (
                        <tr key={row.dentist_id}>
                            <th scope="row" className={`${cell} font-semibold`}>
                                Provider #{row.dentist_id}
                            </th>
                            <td className={cell}>{row.appointment_count}</td>
                            {reportStatuses.map(status => (
                                <td key={status} className={cell}>
                                    {row.by_status[status]}
                                </td>
                            ))}
                            <td className={cell}>{row.booked_minutes}</td>
                            <td className={cell}>{row.completed_minutes}</td>
                            {capacity && (
                                <>
                                    <td className={cell}>
                                        {capacityValue(row.available_minutes)}
                                    </td>
                                    <td className={cell}>
                                        {capacityValue(row.occupied_minutes)}
                                    </td>
                                    <td className={cell}>
                                        {row.utilization_percent === null
                                            ? 'Unavailable'
                                            : `${row.utilization_percent.toFixed(
                                                  2,
                                              )}%`}
                                    </td>
                                </>
                            )}
                        </tr>
                    ))}
                </Table>
            )}
            {capacity && (
                <p className="text-xs text-clinic-muted">
                    Unavailable capacity means no configured schedule. Zero
                    capacity means a configured closed period; utilization is
                    undefined. Planned minutes may exceed occupied minutes
                    because of overlaps, changed schedules or clipping at date
                    boundaries.
                </p>
            )}
        </>
    )
}
function Treatments({ rows }: { rows: TreatmentReport[] }) {
    return (
        <>
            <p className="text-sm text-clinic-muted">
                Activity by assigned catalog treatment ID, including inactive
                treatments. Completed appointments are a proxy for treatment
                occurrences; multiple performed procedures are not recorded
                separately.
            </p>
            <Definitions metrics={['appointment_count', 'completed_count']} />
            {!rows.length ? (
                <Empty>
                    No treatment activity in this period for the selected
                    providers.
                </Empty>
            ) : (
                <Table
                    label="Treatment / procedure summary"
                    headers={[
                        'Treatment',
                        metricHeader(
                            'appointment_count',
                            'Appointments · all statuses',
                        ),
                        metricHeader(
                            'completed_count',
                            'Completed occurrences',
                        ),
                    ]}>
                    {rows.map(row => (
                        <tr key={row.treatment_id}>
                            <th scope="row" className={`${cell} font-semibold`}>
                                Treatment #{row.treatment_id}
                            </th>
                            <td className={cell}>{row.appointment_count}</td>
                            <td className={cell}>{row.completed_count}</td>
                        </tr>
                    ))}
                </Table>
            )}
        </>
    )
}
const financialMetrics: Array<{
    key: Metric & keyof CurrencyReport
    label: string
    money?: boolean
}> = [
    { key: 'invoice_count', label: 'Issued invoices' },
    { key: 'invoiced_total', label: 'Invoiced total', money: true },
    { key: 'paid_total', label: 'Current paid total', money: true },
    {
        key: 'outstanding_balance',
        label: 'Current outstanding balance',
        money: true,
    },
    { key: 'payment_count', label: 'Settled payments' },
    { key: 'collections_total', label: 'Collections in period', money: true },
]
function Billing({ rows }: { rows: CurrencyReport[] }) {
    return (
        <>
            <p className="text-sm text-clinic-muted">
                Invoice totals use invoice issue dates. Collections use payment
                dates. Payments outside the period can change the current paid
                and outstanding totals. Each currency is reported separately.
            </p>
            <Definitions metrics={financialMetrics.map(metric => metric.key)} />
            {!rows.length ? (
                <Empty>
                    No issued invoices or settled collections in this period for
                    the selected providers.
                </Empty>
            ) : (
                rows.map(row => (
                    <section
                        key={row.currency}
                        aria-label={`${row.currency} financial summary`}
                        className="rounded-md border border-clinic-line p-5">
                        <h3 className="mb-4 text-lg font-extrabold">
                            {row.currency}
                        </h3>
                        <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                            {financialMetrics.map(metric => (
                                <div key={metric.key}>
                                    <dt className="text-sm text-clinic-muted">
                                        <Definition metric={metric.key}>
                                            {metric.label}
                                        </Definition>
                                    </dt>
                                    <dd className="mt-1 break-words text-xl font-bold">
                                        {metric.money
                                            ? `${row.currency} ${reportAmount(
                                                  row[metric.key] as string,
                                              )}`
                                            : row[metric.key].toLocaleString()}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))
            )}
            <p className="text-xs text-clinic-muted">
                Provider attribution follows the invoice&apos;s current linked
                appointment. Unlinked invoices and their payments appear only
                with all providers selected. Reassignment or deletion can change
                attribution. These reports do not calculate revenue recognition,
                refunds, tax or period close.
            </p>
        </>
    )
}

export default function ReportingWorkspace() {
    const { user } = useAuthSession()
    const access = getReportingPermissions(user)
    const allowed = reportKinds.filter(kind => access[kind])
    const [selected, setSelected] = useState<ReportKind>(
        allowed[0] ?? 'appointments',
    )
    const kind = access[selected] ? selected : allowed[0] ?? 'appointments'
    const [filters, setFilters] = useState<ReportFilters>(defaultReportFilters)
    const [draft, setDraft] = useState<ReportFilters>(filters)
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(25)
    const form = useRef<HTMLFormElement>(null)
    const report = useReport(kind, filters, page, perPage)
    const paginated = kind === 'providers' || kind === 'treatments'
    const apply = (event: FormEvent) => {
        event.preventDefault()
        const next = validateReportFilters(draft)
        setErrors(next)
        if (Object.keys(next).length) {
            form.current
                ?.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)
                ?.focus()
            return
        }
        setFilters({ ...draft })
        setPage(1)
        report.retry()
    }
    const serverErrors = report.error?.errors ?? {}
    const result = report.data
    if (!allowed.length)
        return (
            <p role="status" className="p-6">
                Reporting requires access to the underlying appointment or
                billing records.
            </p>
        )
    return (
        <section
            aria-label="Reporting workspace"
            className="mx-auto max-w-[1600px] space-y-6 p-4 text-clinic-ink sm:p-6 lg:p-8">
            <div>
                <h1 className="text-2xl font-extrabold">Operational reports</h1>
                <p className="mt-2 text-sm text-clinic-muted">
                    Explore appointment, provider and treatment activity
                    {access.billing ? ', and billing collections' : ''} for your
                    clinic.
                </p>
            </div>
            <nav aria-label="Report selection" className="flex flex-wrap gap-2">
                {allowed.map(item => (
                    <button
                        key={item}
                        type="button"
                        aria-pressed={kind === item}
                        onClick={() => {
                            setSelected(item)
                            setPage(1)
                            setErrors({})
                        }}
                        className={`${button} ${
                            kind === item
                                ? 'border-clinic-blue bg-clinic-sky text-clinic-blue'
                                : ''
                        }`}>
                        {reportLabels[item]}
                    </button>
                ))}
            </nav>
            <form
                ref={form}
                noValidate
                onSubmit={apply}
                aria-label="Report filters"
                className="space-y-3 rounded-md border border-clinic-line bg-white p-4">
                <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {(['date_from', 'date_to', 'dentist_id'] as const).map(
                        field => {
                            const messages =
                                errors[field] ?? serverErrors[field]
                            return (
                                <div key={field}>
                                    <label
                                        htmlFor={`report-${field}`}
                                        className="text-sm font-semibold">
                                        {field === 'date_from'
                                            ? 'Start date (UTC)'
                                            : field === 'date_to'
                                            ? 'End date (UTC)'
                                            : 'Provider ID (optional)'}
                                    </label>
                                    <input
                                        id={`report-${field}`}
                                        name={field}
                                        type={
                                            field === 'dentist_id'
                                                ? 'text'
                                                : 'date'
                                        }
                                        inputMode={
                                            field === 'dentist_id'
                                                ? 'numeric'
                                                : undefined
                                        }
                                        required={field !== 'dentist_id'}
                                        value={draft[field]}
                                        placeholder={
                                            field === 'dentist_id'
                                                ? 'All providers'
                                                : undefined
                                        }
                                        aria-invalid={Boolean(messages?.length)}
                                        aria-describedby={
                                            messages?.length
                                                ? `report-${field}-error`
                                                : 'report-filter-help'
                                        }
                                        className={input}
                                        onChange={event => {
                                            setDraft(current => ({
                                                ...current,
                                                [field]: event.target.value,
                                            }))
                                            setErrors({})
                                        }}
                                    />
                                    {messages?.length > 0 && (
                                        <p
                                            id={`report-${field}-error`}
                                            role="alert"
                                            className="mt-1 text-sm text-red-700">
                                            {messages.join(' ')}
                                        </p>
                                    )}
                                </div>
                            )
                        },
                    )}
                    <button
                        type="submit"
                        className={`${button} mt-6 bg-clinic-blue text-white`}>
                        Apply filters
                    </button>
                </div>
                <p
                    id="report-filter-help"
                    className="text-xs text-clinic-muted">
                    Both dates are inclusive, in UTC. Maximum 366 dates. Leave
                    provider blank for all providers; use the canonical provider
                    ID to narrow the report.
                </p>
            </form>
            <div className="rounded-md border border-clinic-line bg-white p-4 sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold">
                            {reportLabels[kind]}
                        </h2>
                        <p className="mt-1 text-sm text-clinic-muted">
                            {result?.filters.date_from ?? filters.date_from} –{' '}
                            {result?.filters.date_to ?? filters.date_to} ·{' '}
                            {result?.timezone ?? 'UTC'} ·{' '}
                            {filters.dentist_id
                                ? `Provider #${filters.dentist_id}`
                                : 'All providers'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {paginated && (
                            <label className="text-sm">
                                Rows per page
                                <select
                                    aria-label="Rows per page"
                                    value={perPage}
                                    className={`${input} ml-2 inline-block w-auto`}
                                    onChange={event => {
                                        setPerPage(Number(event.target.value))
                                        setPage(1)
                                    }}>
                                    {[25, 50, 100].map(size => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <button
                            type="button"
                            className={button}
                            disabled={report.isLoading}
                            onClick={report.retry}>
                            Refresh report
                        </button>
                    </div>
                </div>
                <div aria-busy={report.isLoading} className="space-y-5">
                    {report.isLoading && (
                        <p role="status">
                            Loading {reportLabels[kind].toLowerCase()} report…
                        </p>
                    )}
                    {report.error && (
                        <div
                            role="alert"
                            className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                            <p>
                                {report.error.statusCode === 403
                                    ? 'Access to this report was denied. Your clinic permissions are being refreshed.'
                                    : report.error.message}
                            </p>
                            {Object.entries(serverErrors)
                                .filter(
                                    ([field]) =>
                                        ![
                                            'date_from',
                                            'date_to',
                                            'dentist_id',
                                        ].includes(field),
                                )
                                .map(([field, messages]) => (
                                    <p key={field}>{messages.join(' ')}</p>
                                ))}
                            {report.error.requestId && (
                                <p>Request ID: {report.error.requestId}</p>
                            )}
                            <button
                                type="button"
                                className={`${button} mt-3`}
                                onClick={report.retry}>
                                Retry report
                            </button>
                        </div>
                    )}
                    {result && (
                        <>
                            {kind === 'appointments' && (
                                <Appointments
                                    data={result.data as AppointmentReport}
                                />
                            )}
                            {kind === 'providers' && (
                                <Providers
                                    rows={result.data as ProviderReport[]}
                                    capacity={access.capacity}
                                />
                            )}
                            {kind === 'treatments' && (
                                <Treatments
                                    rows={result.data as TreatmentReport[]}
                                />
                            )}
                            {kind === 'billing' && access.billing && (
                                <Billing
                                    rows={
                                        (result.data as {
                                            by_currency: CurrencyReport[]
                                        }).by_currency
                                    }
                                />
                            )}
                            {paginated && result.pagination && (
                                <nav
                                    aria-label={`${reportLabels[kind]} pagination`}
                                    className="flex flex-wrap items-center justify-end gap-3 text-sm">
                                    <span>
                                        {result.pagination.total} rows · Page{' '}
                                        {result.pagination.currentPage} of{' '}
                                        {result.pagination.lastPage}
                                    </span>
                                    <button
                                        type="button"
                                        className={button}
                                        disabled={page <= 1}
                                        onClick={() =>
                                            setPage(value => value - 1)
                                        }>
                                        Previous page
                                    </button>
                                    <button
                                        type="button"
                                        className={button}
                                        disabled={
                                            page >= result.pagination.lastPage
                                        }
                                        onClick={() =>
                                            setPage(value => value + 1)
                                        }>
                                        Next page
                                    </button>
                                </nav>
                            )}
                        </>
                    )}
                </div>
            </div>
            <p className="text-xs text-clinic-muted">
                Reports reflect current records and schedules. Later status
                changes, payments, voids or deletions can change historical
                results. Concurrent updates can change values between reports or
                pages; these aggregates are not a fixed accounting snapshot.
            </p>
        </section>
    )
}
