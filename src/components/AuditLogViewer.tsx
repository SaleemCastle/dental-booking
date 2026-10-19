import React, { FormEvent, useEffect, useRef, useState } from 'react'
import { useAuditLogs } from '../hooks/audit-logs'
import { ApiError, ApiFieldErrors } from '../lib/api'
import {
    auditActionLabel,
    auditActorLabel,
    auditFilterLabels,
    auditResourceLabel,
    cleanAuditFilters,
    emptyAuditFilters,
    formatAuditTimestamp,
    validateAuditFilters,
} from '../lib/audit-logs'
import type { AuditFilters, AuditLog } from '../services/audit-logs'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
    appointmentInputClass as inputClass,
    appointmentPrimaryClass as primaryClass,
} from './AppointmentDialog'
import InputError from './InputError'

const AuditError = ({
    error,
    retry,
    disabled,
    detail = false,
}: {
    error?: ApiError
    retry: () => void
    disabled: boolean
    detail?: boolean
}) =>
    !error ? null : (
        <div
            role="alert"
            className="rounded-md border border-clinic-line bg-white p-4 text-sm text-red-700">
            <p>
                {error.statusCode === 404
                    ? detail
                        ? 'This audit record is no longer available.'
                        : 'Audit history is currently unavailable.'
                    : error.statusCode === 429
                    ? 'Too many requests. Wait 30 seconds before retrying.'
                    : error.message}
            </p>
            {error.requestId && (
                <p className="mt-2 break-all text-xs">
                    Read request ID: {error.requestId}
                </p>
            )}
            <button
                type="button"
                className={`${buttonClass} mt-3`}
                disabled={disabled}
                onClick={retry}>
                {detail ? 'Retry audit detail' : 'Retry audit logs'}
            </button>
        </div>
    )
const RecordContext = ({ record }: { record: AuditLog }) => (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
        {[
            ['Actor', auditActorLabel(record)],
            ['Actor ID', record.actor_id ?? 'None'],
            ['Action', record.action],
            ['Resource type', record.resource_type],
            ['Resource ID', record.resource_id],
            ['Exact timestamp', record.occurred_at],
            ['IP address', record.ip_address ?? 'Not recorded'],
            ['User agent', record.user_agent ?? 'Not recorded'],
            [
                'Mutation request ID',
                record.request_metadata?.request_id ?? 'Not recorded',
            ],
            ['HTTP method', record.request_metadata?.method ?? 'Not recorded'],
            [
                'Route template',
                record.request_metadata?.route ?? 'Not recorded',
            ],
        ].map(([label, value]) => (
            <div key={label}>
                <dt className="text-xs font-bold text-clinic-muted">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-all text-clinic-ink">
                    {value}
                </dd>
            </div>
        ))}
    </dl>
)
const AuditLogViewer = () => {
    const feed = useAuditLogs()
    const { applyFilters } = feed
    const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters)
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [timeZone, setTimeZone] = useState('UTC')
    const formRef = useRef<HTMLFormElement>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const localZone =
        typeof window === 'undefined'
            ? 'UTC'
            : Intl.DateTimeFormat().resolvedOptions().timeZone
    const zones = Array.from(new Set(['UTC', 'America/Bogota', localZone]))
    const sameFilters =
        JSON.stringify(cleanAuditFilters(draft)) ===
        JSON.stringify(feed.filters)
    useEffect(() => {
        setDraft(emptyAuditFilters())
        setErrors({})
        setTimeZone('UTC')
    }, [feed.session])
    // Only valid, settled input is sent. Requests use applied filters; changing
    // one cancels the previous read and resets pagination in the hook.
    useEffect(() => {
        if (!feed.canView || feed.rateLimited || sameFilters) return
        timer.current = setTimeout(() => {
            const next = cleanAuditFilters(draft)
            const validation = validateAuditFilters(next)
            setErrors(validation)
            if (!Object.keys(validation).length) applyFilters(next)
        }, 500)
        return () => {
            if (timer.current) clearTimeout(timer.current)
        }
    }, [
        draft,
        feed.canView,
        feed.rateLimited,
        sameFilters,
        feed.session,
        applyFilters,
    ])
    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (timer.current) clearTimeout(timer.current)
        const next = cleanAuditFilters(draft)
        const validation = validateAuditFilters(next)
        setErrors(validation)
        if (Object.keys(validation).length) {
            const field = formRef.current?.elements.namedItem(
                Object.keys(validation)[0],
            )
            if (field instanceof HTMLElement) field.focus()
            return
        }
        setDraft(next)
        feed.applyFilters(next)
    }
    const chooseFilters = (next: AuditFilters) => {
        if (timer.current) clearTimeout(timer.current)
        setDraft(next)
        setErrors({})
        feed.applyFilters(next)
    }
    const change = (key: keyof AuditFilters, value: string) => {
        setDraft(current => ({
            ...current,
            [key]: value,
            ...(key === 'actor_is_null' && value === '1'
                ? { actor_id: '' }
                : {}),
        }))
        setErrors({})
    }
    if (!feed.canView)
        return (
            <p role="alert" className="p-8 text-sm text-clinic-muted">
                Audit access denied. An admin or auditor role is required.
            </p>
        )
    const fields: Array<{
        key: keyof AuditFilters
        placeholder?: string
        options?: string[]
    }> = [
        { key: 'actor_id', placeholder: 'All users' },
        {
            key: 'action',
            placeholder: 'All actions',
            options: feed.options?.actions,
        },
        {
            key: 'resource_type',
            placeholder: 'All resource types',
            options: feed.options?.resourceTypes,
        },
        { key: 'resource_id', placeholder: 'All resource IDs' },
        { key: 'request_id', placeholder: 'Originating mutation ID' },
        { key: 'from', placeholder: '2026-10-18T00:00:00-05:00' },
        { key: 'to', placeholder: '2026-10-18T23:59:59.999999-05:00' },
    ]
    const lastPage = Number(feed.meta?.lastPage ?? feed.page)
    const selected = feed.detail?.auditLog
    return (
        <section aria-label="Audit logs" className="p-4 sm:p-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-extrabold text-clinic-ink">
                        Audit logs
                    </h1>
                    <p className="mt-1 text-sm text-clinic-muted">
                        Read-only activity history. Filter by exact identifiers
                        and occurrence time.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <label
                        className="text-xs font-bold text-clinic-muted"
                        htmlFor="audit-display-timezone">
                        Display timezone
                        <select
                            id="audit-display-timezone"
                            className={inputClass}
                            value={timeZone}
                            onChange={event => setTimeZone(event.target.value)}>
                            {zones.map(zone => (
                                <option key={zone} value={zone}>
                                    {zone}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={feed.isLoading || feed.rateLimited}
                        onClick={feed.retry}>
                        Refresh audit logs
                    </button>
                </div>
            </div>
            <form
                ref={formRef}
                onSubmit={submit}
                noValidate
                aria-label="Audit filters"
                className="mb-6 space-y-4 rounded-md border border-clinic-line bg-white p-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                        <label
                            htmlFor="audit-actor_is_null"
                            className="text-sm font-bold text-clinic-ink">
                            Actor attribution
                        </label>
                        <select
                            id="audit-actor_is_null"
                            name="actor_is_null"
                            className={inputClass}
                            value={draft.actor_is_null}
                            onChange={event =>
                                change('actor_is_null', event.target.value)
                            }>
                            <option value="">All records</option>
                            <option value="0">Attributed records</option>
                            <option value="1">
                                System / unauthenticated only
                            </option>
                        </select>
                        <InputError
                            messages={
                                errors.actor_is_null?.length
                                    ? errors.actor_is_null
                                    : sameFilters &&
                                      feed.error?.statusCode === 422
                                    ? feed.error.errors.actor_is_null
                                    : undefined
                            }
                        />
                    </div>
                    {fields.map(({ key, placeholder, options }) => {
                        const messages = errors[key]?.length
                            ? errors[key]
                            : sameFilters && feed.error?.statusCode === 422
                            ? feed.error.errors[key]
                            : undefined
                        return (
                            <div key={key}>
                                <label
                                    htmlFor={`audit-${key}`}
                                    className="text-sm font-bold text-clinic-ink">
                                    {auditFilterLabels[key]}
                                </label>
                                <input
                                    id={`audit-${key}`}
                                    name={key}
                                    type="text"
                                    placeholder={placeholder}
                                    className={inputClass}
                                    value={draft[key]}
                                    inputMode={
                                        key === 'actor_id'
                                            ? 'numeric'
                                            : undefined
                                    }
                                    disabled={
                                        key === 'actor_id' &&
                                        draft.actor_is_null === '1'
                                    }
                                    list={
                                        options
                                            ? `audit-options-${key}`
                                            : undefined
                                    }
                                    aria-invalid={Boolean(messages?.length)}
                                    aria-describedby={`audit-${key}-error`}
                                    onChange={event =>
                                        change(key, event.target.value)
                                    }
                                />
                                {options && (
                                    <datalist id={`audit-options-${key}`}>
                                        {options.map(value => (
                                            <option key={value} value={value}>
                                                {key === 'action'
                                                    ? auditActionLabel(value)
                                                    : auditResourceLabel(value)}
                                            </option>
                                        ))}
                                    </datalist>
                                )}
                                <div id={`audit-${key}-error`}>
                                    <InputError messages={messages} />
                                </div>
                            </div>
                        )
                    })}
                </div>
                <p className="text-xs text-clinic-muted">
                    User IDs include deleted accounts. Time bounds need seconds
                    and an explicit Z or offset; they include the entered
                    instant. For a whole day, end at 23:59:59.999999 in the
                    chosen offset. Display timezone does not change filter
                    bounds.
                </p>
                {feed.optionsLoading && (
                    <p role="status" className="text-xs text-clinic-muted">
                        Loading filter suggestions...
                    </p>
                )}
                {feed.optionsError && (
                    <div role="alert" className="text-sm text-red-700">
                        Filter suggestions could not be loaded. You can still
                        enter exact values.{' '}
                        {feed.optionsError.requestId && (
                            <span>
                                Read request ID: {feed.optionsError.requestId}
                            </span>
                        )}{' '}
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={feed.rateLimited || feed.optionsLoading}
                            onClick={feed.retryOptions}>
                            Retry filter suggestions
                        </button>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        className={primaryClass}
                        disabled={feed.rateLimited}>
                        Apply audit filters
                    </button>
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={feed.rateLimited}
                        onClick={() => chooseFilters(emptyAuditFilters())}>
                        Clear audit filters
                    </button>
                    {!sameFilters && (
                        <p role="status" className="text-xs text-clinic-muted">
                            Valid filters apply after typing stops.
                        </p>
                    )}
                </div>
            </form>
            {feed.rateLimited && (
                <p role="status" className="mb-3 text-sm text-red-700">
                    Requests are paused for 30 seconds after the rate limit.
                    Retry when the controls become available.
                </p>
            )}
            {feed.isLoading && (
                <p
                    role="status"
                    className="rounded-md border border-clinic-line bg-white p-6 text-sm text-clinic-muted">
                    Loading audit logs...
                </p>
            )}
            <AuditError
                error={feed.error}
                retry={feed.retry}
                disabled={feed.rateLimited || feed.isLoading}
            />
            {!feed.isLoading && !feed.error && feed.records?.length === 0 && (
                <div className="rounded-md border border-dashed border-clinic-line bg-white p-10 text-center">
                    <h2 className="font-bold text-clinic-ink">
                        {Object.values(feed.filters).some(Boolean)
                            ? 'No audit records match these filters.'
                            : 'No audit records yet.'}
                    </h2>
                </div>
            )}
            {Boolean(feed.records?.length) && (
                <div className="overflow-x-auto rounded-md border border-clinic-line bg-white">
                    <table className="w-full text-left text-sm">
                        <caption className="sr-only">
                            Read-only audit records, newest first
                        </caption>
                        <thead className="border-b border-clinic-line bg-clinic-canvas text-xs uppercase text-clinic-muted">
                            <tr>
                                {[
                                    'Timestamp',
                                    'Actor',
                                    'Action',
                                    'Resource',
                                    'Mutation request',
                                    'Details',
                                ].map(label => (
                                    <th key={label} scope="col" className="p-4">
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-clinic-line">
                            {feed.records.map(record => (
                                <tr
                                    key={record.id}
                                    aria-label={`Audit record ${record.id}`}>
                                    <td className="p-4 align-top">
                                        <time
                                            dateTime={record.occurred_at}
                                            title={record.occurred_at}
                                            className="whitespace-nowrap font-semibold text-clinic-ink">
                                            {formatAuditTimestamp(
                                                record.occurred_at,
                                                timeZone,
                                            )}
                                        </time>
                                        <p className="mt-1 text-xs text-clinic-muted">
                                            Audit #{record.id}
                                        </p>
                                    </td>
                                    <td className="p-4 align-top text-clinic-ink">
                                        <p>{auditActorLabel(record)}</p>
                                        {record.actor_id !== null && (
                                            <>
                                                <p className="mt-1 text-xs text-clinic-muted">
                                                    User #{record.actor_id}
                                                </p>
                                                <button
                                                    type="button"
                                                    className={`${buttonClass} mt-2`}
                                                    aria-label={`Show actor ${record.actor_id} history for audit ${record.id}`}
                                                    disabled={feed.rateLimited}
                                                    onClick={() =>
                                                        chooseFilters({
                                                            ...emptyAuditFilters(),
                                                            actor_id: String(
                                                                record.actor_id,
                                                            ),
                                                        })
                                                    }>
                                                    Actor history
                                                </button>
                                            </>
                                        )}
                                    </td>
                                    <td className="p-4 align-top text-clinic-ink">
                                        <span className="rounded bg-clinic-sky px-2 py-1 text-xs font-bold text-clinic-blue">
                                            {auditActionLabel(record.action)}
                                        </span>
                                        <p className="mt-2 break-all font-mono text-xs text-clinic-muted">
                                            {record.action}
                                        </p>
                                    </td>
                                    <td className="p-4 align-top text-clinic-ink">
                                        <p className="font-semibold">
                                            {auditResourceLabel(
                                                record.resource_type,
                                            )}
                                        </p>
                                        <p className="mt-1 break-all font-mono text-xs">
                                            {record.resource_type} /{' '}
                                            {record.resource_id}
                                        </p>
                                    </td>
                                    <td className="max-w-sm p-4 align-top text-xs text-clinic-muted">
                                        {record.request_metadata?.request_id ? (
                                            <>
                                                <p className="break-all">
                                                    {
                                                        record.request_metadata
                                                            .request_id
                                                    }
                                                </p>
                                                <button
                                                    type="button"
                                                    className={`${buttonClass} mt-2`}
                                                    aria-label={`Show mutation history for audit ${record.id}`}
                                                    disabled={feed.rateLimited}
                                                    onClick={() =>
                                                        chooseFilters({
                                                            ...emptyAuditFilters(),
                                                            request_id:
                                                                record
                                                                    .request_metadata
                                                                    .request_id,
                                                        })
                                                    }>
                                                    Related activity
                                                </button>
                                            </>
                                        ) : (
                                            'Not recorded'
                                        )}
                                    </td>
                                    <td className="p-4 align-top">
                                        <button
                                            type="button"
                                            className={buttonClass}
                                            aria-label={`View audit record ${record.id}`}
                                            disabled={feed.rateLimited}
                                            onClick={() =>
                                                feed.openDetail(record.id)
                                            }>
                                            View details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {feed.meta && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-clinic-muted">
                    <div>
                        <p role="status">
                            Page {feed.page} of {lastPage}
                            {feed.meta.total != null
                                ? ` · ${feed.meta.total} records`
                                : ''}
                        </p>
                        <p className="mt-1 text-xs">
                            New activity can shift pages. Retain a through-time
                            bound for a bounded history view.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={
                                feed.isLoading ||
                                feed.rateLimited ||
                                feed.page <= 1
                            }
                            onClick={() => feed.changePage(feed.page - 1)}>
                            Previous audit records
                        </button>
                        <button
                            type="button"
                            className={buttonClass}
                            disabled={
                                feed.isLoading ||
                                feed.rateLimited ||
                                feed.page >= lastPage
                            }
                            onClick={() => feed.changePage(feed.page + 1)}>
                            Next audit records
                        </button>
                    </div>
                </div>
            )}
            {feed.selectedId !== null && (
                <AppointmentDialog
                    title={`Audit record #${feed.selectedId}`}
                    closeLabel="Close audit detail"
                    onClose={feed.closeDetail}>
                    <div className="space-y-5 p-6">
                        {feed.detailLoading && (
                            <p
                                role="status"
                                className="text-sm text-clinic-muted">
                                Loading audit detail...
                            </p>
                        )}
                        <AuditError
                            error={feed.detailError}
                            retry={feed.retryDetail}
                            disabled={feed.rateLimited || feed.detailLoading}
                            detail
                        />
                        {selected && (
                            <>
                                <p className="text-sm font-bold text-clinic-ink">
                                    {formatAuditTimestamp(
                                        selected.occurred_at,
                                        timeZone,
                                    )}
                                </p>
                                <RecordContext record={selected} />
                                <p className="text-xs text-clinic-muted">
                                    Actor names reflect the current account
                                    name. Mutation request IDs refer to the
                                    original action.
                                </p>
                                {feed.detail.requestId && (
                                    <p className="break-all text-xs text-clinic-muted">
                                        This detail read request ID:{' '}
                                        {feed.detail.requestId}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </AppointmentDialog>
            )}
        </section>
    )
}
export default AuditLogViewer
