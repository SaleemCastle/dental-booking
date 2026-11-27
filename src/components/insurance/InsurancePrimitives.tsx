import React, { FormEvent, ReactNode, useState } from 'react'
import { normalizeAxiosError } from '../../lib/api'

export interface InsuranceField {
    name: string
    label: string
    kind?: 'text' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'select' | 'boolean'
    required?: boolean
    clearable?: boolean
    min?: number
    max?: number
    maxLength?: number
    pattern?: string
    options?: Array<{ value: string; label: string }>
    placeholder?: string
    help?: string
}

const fieldClass =
    'mt-1 block w-full rounded-md border border-clinic-line bg-white px-3 py-2 text-sm text-clinic-ink shadow-sm focus:border-clinic-blue focus:ring-clinic-blue/20 disabled:bg-clinic-canvas'
const buttonClass =
    'rounded-md border border-clinic-line bg-white px-3 py-2 text-sm font-semibold text-clinic-ink hover:border-clinic-blue hover:text-clinic-blue disabled:cursor-not-allowed disabled:opacity-50'
const primaryClass =
    'rounded-md bg-clinic-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50'

export const InsuranceButton = ({
    children,
    onClick,
    disabled,
}: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
}) => (
    <button type="button" className={buttonClass} onClick={onClick} disabled={disabled}>
        {children}
    </button>
)

export const InsuranceCard = ({
    title,
    children,
    description,
}: {
    title: string
    children: ReactNode
    description?: string
}) => (
    <section className="space-y-4 rounded-lg border border-clinic-line bg-white p-4 shadow-sm sm:p-5">
        <header>
            <h3 className="text-base font-extrabold text-clinic-ink">{title}</h3>
            {description && <p className="mt-1 text-sm text-clinic-muted">{description}</p>}
        </header>
        {children}
    </section>
)

export const InsuranceForm = ({
    fields,
    onSubmit,
    submitLabel,
    note,
    resetOnSuccess = true,
}: {
    fields: InsuranceField[]
    onSubmit: (input: Record<string, string | number | boolean | null>) => Promise<void>
    submitLabel: string
    note?: ReactNode
    resetOnSuccess?: boolean
}) => {
    const [values, setValues] = useState<Record<string, string>>({})
    const [error, setError] = useState('')
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
    const [busy, setBusy] = useState(false)

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (busy) return
        setError('')
        setFieldErrors({})
        const payload: Record<string, string | number | boolean | null> = {}
        for (const field of fields) {
            const value = values[field.name]?.trim() ?? ''
            if (field.clearable && values[`${field.name}__clear`] === 'true') {
                payload[field.name] = null
                continue
            }
            if (!value) continue
            if (field.kind === 'number') {
                const numeric = Number(value)
                if (!Number.isSafeInteger(numeric) || (field.min != null && numeric < field.min)) {
                    setFieldErrors({ [field.name]: ['Enter a valid whole number.'] })
                    return
                }
                payload[field.name] = numeric
            } else if (field.kind === 'boolean') {
                payload[field.name] = value === 'true'
            } else {
                payload[field.name] = field.kind === 'datetime-local'
                    ? new Date(value).toISOString()
                    : value
            }
        }
        setBusy(true)
        try {
            await onSubmit(payload)
            if (resetOnSuccess) setValues({})
        } catch (failure) {
            const apiError = normalizeAxiosError(failure)
            setError(apiError.message)
            setFieldErrors(apiError.errors ?? {})
        } finally {
            setBusy(false)
        }
    }

    return (
        <form onSubmit={event => void submit(event)} className="space-y-4" noValidate={false}>
            {note && <p className="rounded-md border border-clinic-line bg-clinic-canvas p-3 text-xs text-clinic-muted">{note}</p>}
            {error && <p role="alert" className="rounded-md border border-rose-200 bg-clinic-rose p-3 text-sm text-rose-800">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
                {fields.map(field => (
                    <label key={field.name} className={`block text-sm font-semibold text-clinic-ink ${field.kind === 'textarea' ? 'sm:col-span-2' : ''}`}>
                        {field.label}{field.required ? ' *' : ''}
                        {field.kind === 'textarea' ? (
                            <textarea
                                name={field.name}
                                required={field.required}
                                maxLength={field.maxLength}
                                value={values[field.name] ?? ''}
                                placeholder={field.placeholder}
                                className={fieldClass}
                                rows={3}
                                onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.value }))}
                            />
                        ) : field.kind === 'select' || field.kind === 'boolean' ? (
                            <select
                                name={field.name}
                                required={field.required}
                                value={values[field.name] ?? ''}
                                className={fieldClass}
                                onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.value }))}>
                                <option value="">Select…</option>
                                {(field.options ?? (field.kind === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : [])).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        ) : (
                            <input
                                name={field.name}
                                type={field.kind ?? 'text'}
                                required={field.required}
                                min={field.min}
                                max={field.max}
                                maxLength={field.maxLength}
                                pattern={field.pattern}
                                value={values[field.name] ?? ''}
                                placeholder={field.placeholder}
                                className={fieldClass}
                                onChange={event => setValues(previous => ({ ...previous, [field.name]: event.target.value }))}
                            />
                        )}
                        {field.help && <span className="mt-1 block text-xs font-normal text-clinic-muted">{field.help}</span>}
                        {field.clearable && <span className="mt-2 flex items-center gap-2 text-xs font-normal text-clinic-muted"><input type="checkbox" checked={values[`${field.name}__clear`] === 'true'} onChange={event => setValues(previous => ({ ...previous, [`${field.name}__clear`]: event.target.checked ? 'true' : '' }))} />Clear the stored value</span>}
                        {fieldErrors[field.name]?.map((message, index) => <span key={index} className="mt-1 block text-xs font-normal text-rose-700">{message}</span>)}
                    </label>
                ))}
            </div>
            <button type="submit" className={primaryClass} disabled={busy}>
                {busy ? 'Saving…' : submitLabel}
            </button>
        </form>
    )
}

const dateValue = (record: Record<string, unknown>) =>
    ['recorded_at', 'created_at', 'occurred_at', 'checked_at', 'insurer_response_at', 'proposed_at']
        .map(key => record[key])
        .find(value => typeof value === 'string') as string | undefined

const actorValue = (record: Record<string, unknown>) =>
    record.actor_name ?? record.recorder_name ?? record.created_by_name ?? record.actor_id ?? record.recorder_id ?? record.created_by

export const InsuranceTimeline = ({
    records,
    empty,
    renderRecord,
}: {
    records: Array<Record<string, unknown>>
    empty: string
    renderRecord: (record: Record<string, unknown>) => ReactNode
}) => {
    if (!records.length) return <p role="status" className="rounded-md border border-dashed border-clinic-line p-4 text-sm text-clinic-muted">{empty}</p>
    const ordered = [...records].sort((left, right) => {
        const a = Date.parse(dateValue(left) ?? '')
        const b = Date.parse(dateValue(right) ?? '')
        return (Number.isNaN(a) ? 0 : a) - (Number.isNaN(b) ? 0 : b)
    })
    return (
        <ol className="divide-y divide-clinic-line">
            {ordered.map((record, index) => {
                const id = typeof record.id === 'number' ? record.id : index
                const date = dateValue(record)
                const actor = actorValue(record)
                return (
                    <li key={`${id}-${index}`} className="py-3 first:pt-0 last:pb-0">
                        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-clinic-muted">
                            {date && <time dateTime={date}>{date}</time>}
                            {actor != null && <span>Recorded by staff {String(actor)}</span>}
                        </div>
                        {renderRecord(record)}
                    </li>
                )
            })}
        </ol>
    )
}

export const recordText = (record: Record<string, unknown>, ...keys: string[]) =>
    keys.map(key => record[key]).find(value => typeof value === 'string' || typeof value === 'number')

export const formatRecord = (record: Record<string, unknown>, keys: Array<[string, string]>) => (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {keys.map(([key, label]) => {
            const value = record[key]
            if (value === undefined || value === null || value === '') return null
            return <div key={key}><dt className="text-xs font-semibold text-clinic-muted">{label}</dt><dd className="break-words text-clinic-ink">{String(value)}</dd></div>
        })}
    </dl>
)

export const randomCommandKey = () => globalThis.crypto.randomUUID()
