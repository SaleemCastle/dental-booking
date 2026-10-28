import { apiRequestWithSignal, PaginationMeta } from '../lib/api'
import {
    ReportFilters,
    ReportKind,
    reportStatuses,
    validateReportFilters,
} from '../lib/reporting'

export type StatusCounts = Record<typeof reportStatuses[number], number>
export interface AppointmentReport {
    appointment_count: number
    by_status: StatusCounts
    by_date: Array<{
        date: string
        appointment_count: number
        by_status: StatusCounts
    }>
}
export interface ProviderReport {
    dentist_id: number
    appointment_count: number
    by_status: StatusCounts
    booked_minutes: number
    completed_minutes: number
    available_minutes: number | null
    occupied_minutes: number | null
    utilization_percent: number | null
}
export interface TreatmentReport {
    treatment_id: number
    appointment_count: number
    completed_count: number
}
export interface CurrencyReport {
    currency: string
    invoice_count: number
    invoiced_total: string
    paid_total: string
    outstanding_balance: string
    payment_count: number
    collections_total: string
}
export interface ReportData {
    appointments: AppointmentReport
    providers: ProviderReport[]
    treatments: TreatmentReport[]
    billing: { by_currency: CurrencyReport[] }
}
export interface ReportResult<K extends ReportKind> {
    data: ReportData[K]
    filters: { date_from: string; date_to: string; dentist_id: number | null }
    timezone: string
    pagination?: PaginationMeta
}
export const getReport = async <K extends ReportKind>(
    kind: K,
    filters: ReportFilters,
    options: {
        tenantId: number
        page?: number
        perPage?: number
        signal?: AbortSignal
    },
): Promise<ReportResult<K>> => {
    if (Object.keys(validateReportFilters(filters)).length)
        throw new Error('Review the report filters.')
    if (!Number.isSafeInteger(options.tenantId) || options.tenantId < 1)
        throw new Error('An active clinic is required.')
    const paginated = kind === 'providers' || kind === 'treatments'
    const page = options.page ?? 1
    const perPage = options.perPage ?? 25
    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(perPage) ||
        perPage < 1 ||
        perPage > 100
    )
        throw new Error('Invalid report pagination.')
    const response = await apiRequestWithSignal<ReportData[K]>(
        {
            method: 'get',
            url: `/api/reports/${kind}`,
            headers: {
                'X-Tenant-Id': options.tenantId,
            },
            params: {
                date_from: filters.date_from,
                date_to: filters.date_to,
                ...(filters.dentist_id === ''
                    ? {}
                    : { dentist_id: Number(filters.dentist_id) }),
                ...(paginated ? { page, per_page: perPage } : {}),
            },
        },
        options.signal,
    )
    const meta = response.meta
    const echoed = meta?.filters as ReportResult<K>['filters']
    // A mismatched clinic/filter response must never be presented under new labels.
    if (
        !echoed ||
        echoed.date_from !== filters.date_from ||
        echoed.date_to !== filters.date_to ||
        echoed.dentist_id !==
            (filters.dentist_id === '' ? null : Number(filters.dentist_id)) ||
        typeof meta?.timezone !== 'string'
    )
        throw new Error(
            'Report filter metadata could not be verified. Please retry.',
        )
    const pagination = meta.pagination as PaginationMeta
    if (
        paginated &&
        (!Array.isArray(response.data) ||
            pagination?.currentPage !== page ||
            !Number.isSafeInteger(pagination?.lastPage) ||
            pagination.lastPage < 1)
    )
        throw new Error('Report pagination could not be read. Please retry.')
    return {
        data: response.data,
        filters: echoed,
        timezone: meta.timezone,
        pagination,
    }
}
