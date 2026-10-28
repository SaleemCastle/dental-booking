import type { ApiFieldErrors } from './api-contract'

export const reportKinds = [
    'appointments',
    'providers',
    'treatments',
    'billing',
] as const
export type ReportKind = typeof reportKinds[number]
export interface ReportFilters {
    date_from: string
    date_to: string
    dentist_id: string
}
export const reportLabels: Record<ReportKind, string> = {
    appointments: 'Appointments',
    providers: 'Provider activity',
    treatments: 'Treatments / procedures',
    billing: 'Billing / collections',
}
export const reportStatuses = [
    'scheduled',
    'checked_in',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
] as const
export const statusLabel = (status: string) => status.replace(/_/g, ' ')
export const defaultReportFilters = (now = new Date()): ReportFilters => ({
    date_from: `${now.toISOString().slice(0, 7)}-01`,
    date_to: now.toISOString().slice(0, 10),
    dentist_id: '',
})
const calendarDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
        ? date.getTime()
        : null
}
export const validateReportFilters = (
    filters: ReportFilters,
): ApiFieldErrors => {
    const errors: ApiFieldErrors = {}
    const from = calendarDate(filters.date_from)
    const to = calendarDate(filters.date_to)
    if (from === null)
        errors.date_from = ['Enter a calendar date in YYYY-MM-DD format.']
    if (to === null)
        errors.date_to = ['Enter a calendar date in YYYY-MM-DD format.']
    if (from !== null && to !== null) {
        if (to < from)
            errors.date_to = ['End date must be on or after start date.']
        else if ((to - from) / 86400000 > 365)
            errors.date_to = ['Choose at most 366 inclusive calendar dates.']
    }
    if (
        filters.dentist_id !== '' &&
        (!/^[1-9]\d*$/.test(filters.dentist_id) ||
            !Number.isSafeInteger(Number(filters.dentist_id)))
    )
        errors.dentist_id = [
            'Enter a positive integer provider ID, or leave blank for all providers.',
        ]
    return errors
}

// Preserve aggregate decimal strings, including totals above invoice-entry limits.
// No floating-point arithmetic or currency conversion is used for display.
export const reportAmount = (amount: string) =>
    amount.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const metricDefinitions = {
    appointment_count:
        'Every appointment whose scheduled start falls in the selected UTC dates, including cancelled and no-show appointments. Status is the current persisted status.',
    completed_count:
        'Appointments currently completed, grouped by their assigned catalog treatment. One appointment is one occurrence; this is not a performed-procedure ledger. Appointments without a treatment are excluded.',
    booked_minutes:
        'Planned minutes for scheduled, checked-in, in-progress and completed appointments starting in the period. Cancelled and no-show minutes are excluded.',
    completed_minutes:
        'Planned duration of completed appointments starting in the period. This is not observed chair time.',
    available_minutes:
        'Union of currently configured working intervals minus overlapping breaks. Date exceptions replace recurring hours and breaks. Unknown capacity is unavailable; a configured closed period is zero.',
    occupied_minutes:
        'Union of eligible appointment intervals intersected with current available hours and the report window. Includes cross-midnight bookings starting before the period; overlaps count once.',
    utilization_percent:
        'Occupied minutes divided by available minutes, computed by the API using unrounded seconds. Unknown or zero capacity has no percentage. Current capacity occupation is not employee productivity or historical hours worked.',
    invoice_count:
        'Current issued, partially-paid or paid invoices issued during the period. Draft and void invoices are excluded.',
    invoiced_total:
        'Original amount due on invoices in the issue-date cohort, grouped by currency.',
    paid_total:
        'Current settled amount paid on the issue-date cohort, including payments made outside the selected period.',
    outstanding_balance:
        'Invoiced total minus current paid total for the issue-date cohort. This is neither all-time receivables nor a balance as of the end date.',
    payment_count:
        'Settled payment records with a paid date in the selected period. Payment retries do not add collections.',
    collections_total:
        'Settled payments with a paid date in the selected period, including payments against invoices issued outside it. This differs from paid total.',
}
