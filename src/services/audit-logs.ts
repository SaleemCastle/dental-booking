import { ApiError, apiClient, PaginationMeta } from '../lib/api'
import type { AuthUser } from '../lib/auth-session'
import { canViewAuditLogs } from '../lib/permissions'

export interface AuditLog {
    readonly id: number
    readonly actor_id: number | null
    readonly actorName: string | null
    readonly action: string
    readonly resource_type: string
    readonly resource_id: string
    readonly occurred_at: string
    readonly ip_address: string | null
    readonly user_agent: string | null
    readonly request_metadata: {
        readonly request_id?: string
        readonly method?: string
        readonly route?: string
    } | null
}
export interface AuditFilters {
    actor_id: string
    actor_is_null: '' | '0' | '1'
    action: string
    resource_type: string
    resource_id: string
    request_id: string
    from: string
    to: string
}
export interface AuditLogPage {
    auditLogs: AuditLog[]
    meta: PaginationMeta
    requestId?: string
}
export interface AuditFilterOptions {
    actions: string[]
    resourceTypes: string[]
}
export interface AuditLogDetail {
    auditLog: AuditLog
    requestId?: string
}

const readAudit = async <T>(
    user: AuthUser | null,
    path: string,
    signal?: AbortSignal,
) => {
    if (!canViewAuditLogs(user))
        throw new ApiError({
            statusCode: user ? 403 : 401,
            code: user ? 'FORBIDDEN' : 'UNAUTHENTICATED',
            message:
                'Audit logs are available to administrators and auditors only.',
            errors: {},
        })
    const aborted = () =>
        new DOMException('Audit request cancelled.', 'AbortError')
    if (signal?.aborted) throw aborted()
    try {
        const response = await apiClient.get<T>(path, {
            signal,
        })
        if (signal?.aborted) throw aborted()
        return response
    } catch (error) {
        if (signal?.aborted) throw aborted()
        throw error
    }
}
export const getAuditLogs = async (
    user: AuthUser | null,
    filters: AuditFilters,
    page = 1,
    signal?: AbortSignal,
): Promise<AuditLogPage> => {
    const query = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== '') query.set(key, value)
    })
    query.set('page', String(page))
    query.set('per_page', '25')
    const response = await readAudit<{ auditLogs: AuditLog[] }>(
        user,
        `/api/audit-logs?${query}`,
        signal,
    )
    if (!Array.isArray(response.data?.auditLogs))
        throw new Error('The audit service returned an unexpected response.')
    const meta = response.meta as PaginationMeta & {
        pagination?: PaginationMeta
    }
    return {
        auditLogs: response.data.auditLogs,
        meta: meta?.pagination ?? {},
        requestId: response.requestId,
    }
}
export const getAuditFilterOptions = async (
    user: AuthUser | null,
    signal?: AbortSignal,
): Promise<AuditFilterOptions> => {
    const response = await readAudit<AuditFilterOptions>(
        user,
        '/api/audit-logs/filters',
        signal,
    )
    if (
        ![response.data?.actions, response.data?.resourceTypes].every(
            values =>
                Array.isArray(values) &&
                values.every(value => typeof value === 'string'),
        )
    )
        throw new Error('The audit service returned unexpected filter options.')
    return response.data
}
export const getAuditLog = async (
    user: AuthUser | null,
    id: number,
    signal?: AbortSignal,
): Promise<AuditLogDetail> => {
    const response = await readAudit<{ auditLog: AuditLog }>(
        user,
        `/api/audit-logs/${encodeURIComponent(String(id))}`,
        signal,
    )
    if (response.data?.auditLog?.id !== id)
        throw new Error('The audit service returned an unexpected record.')
    return { auditLog: response.data.auditLog, requestId: response.requestId }
}
