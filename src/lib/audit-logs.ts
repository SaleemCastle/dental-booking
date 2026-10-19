import type { AuditFilters, AuditLog } from '../services/audit-logs'
import type { ApiFieldErrors } from './api'

export const emptyAuditFilters = (): AuditFilters => ({
    actor_id: '',
    actor_is_null: '',
    action: '',
    resource_type: '',
    resource_id: '',
    request_id: '',
    from: '',
    to: '',
})
export const auditResourceLabels: Record<string, string> = {
    patients: 'Patients',
    appointments: 'Appointments',
    clinical_notes: 'Clinical notes',
    users: 'Users',
    roles: 'Roles',
    tasks: 'Tasks',
    treatments: 'Treatments',
}
const actionLabels: Record<string, string> = {
    created: 'Created',
    updated: 'Updated',
    archived: 'Archived',
    deleted: 'Deleted',
    status_changed: 'Status changed',
    roles_changed: 'Roles changed',
    permissions_changed: 'Permissions changed',
    password_reset: 'Password reset',
    email_verified: 'Email verified',
}
export const auditFilterLabels: Record<keyof AuditFilters, string> = {
    actor_id: 'User ID',
    actor_is_null: 'Actor attribution',
    action: 'Action',
    resource_type: 'Resource type',
    resource_id: 'Resource ID',
    request_id: 'Mutation request ID',
    from: 'From time',
    to: 'Through time',
}
export const cleanAuditFilters = (filters: AuditFilters): AuditFilters =>
    (Object.fromEntries(
        Object.entries(filters).map(([key, value]) => [key, value.trim()]),
    ) as unknown) as AuditFilters

// Keep fractional seconds separately: Date truncates microseconds, which would
// incorrectly accept a reversed range within the same millisecond.
export const parseAuditBound = (value: string) => {
    const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
        value,
    )
    if (!match) return null
    const day = new Date(`${match[1]}T00:00:00Z`)
    const millis = Date.parse(
        `${match[1]}T${match[2]}:${match[3]}:${match[4]}${match[6]}`,
    )
    if (
        Number.isNaN(day.getTime()) ||
        day.toISOString().slice(0, 10) !== match[1] ||
        Number.isNaN(millis)
    )
        return null
    return { millis, micros: Number((match[5] ?? '').padEnd(6, '0')) }
}
export const validateAuditFilters = (filters: AuditFilters): ApiFieldErrors => {
    const errors: ApiFieldErrors = {}
    if (
        filters.actor_id &&
        (!/^[1-9]\d*$/.test(filters.actor_id) ||
            !Number.isSafeInteger(Number(filters.actor_id)))
    )
        errors.actor_id = ['Enter a positive integer user ID.']
    if (!['', '0', '1'].includes(filters.actor_is_null))
        errors.actor_is_null = ['Choose an actor attribution.']
    if (filters.actor_id && filters.actor_is_null === '1')
        errors.actor_id = [
            'Clear the user ID when showing unattributed records.',
        ]
    if (filters.action && !/^[a-z][a-z0-9_.]{0,79}$/.test(filters.action))
        errors.action = ['Enter an action token such as status_changed.']
    if (
        filters.resource_type &&
        !/^[a-z][a-z0-9_]{0,79}$/.test(filters.resource_type)
    )
        errors.resource_type = [
            'Use a resource type such as patients or clinical_notes.',
        ]
    if (
        filters.resource_id &&
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(filters.resource_id)
    )
        errors.resource_id = [
            'Enter a resource key of up to 128 letters, digits, dots, underscores, colons or hyphens.',
        ]
    if (
        filters.request_id &&
        !/^[A-Za-z0-9._:-]{1,100}$/.test(filters.request_id)
    )
        errors.request_id = [
            'Enter a mutation request ID of up to 100 letters, digits, dots, underscores, colons or hyphens.',
        ]
    const from = filters.from ? parseAuditBound(filters.from) : null
    const to = filters.to ? parseAuditBound(filters.to) : null
    for (const field of ['from', 'to'] as const)
        if (filters[field] && !(field === 'from' ? from : to))
            errors[field] = [
                'Enter a timestamp with seconds and Z or an explicit offset, e.g. 2026-10-18T00:00:00-05:00.',
            ]
    if (
        from &&
        to &&
        (to.millis < from.millis ||
            (to.millis === from.millis && to.micros < from.micros))
    )
        errors.to = ['The through time must be on or after the from time.']
    return errors
}
export const auditActionLabel = (value: string) =>
    Object.prototype.hasOwnProperty.call(actionLabels, value)
        ? actionLabels[value]
        : value
              .replace(/[_.]/g, ' ')
              .replace(/^\w/, letter => letter.toUpperCase())
export const auditResourceLabel = (value: string) =>
    Object.prototype.hasOwnProperty.call(auditResourceLabels, value)
        ? auditResourceLabels[value]
        : value
export const auditActorLabel = (record: AuditLog) =>
    record.actor_id === null
        ? 'System / unauthenticated'
        : record.actorName ?? `Deleted user #${record.actor_id}`
export const formatAuditTimestamp = (value: string, timeZone = 'UTC') => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Timestamp unavailable'
    return (
        date.toLocaleString('en-US', {
            timeZone,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }) + ` ${timeZone}`
    )
}
