import React, { FormEvent, useRef, useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    decimalMoney,
    displayMoney,
    maxInvoiceMinor,
    moneyMinor,
} from '../lib/billing'
import {
    getTreatmentPlanPermissions,
    getUserPermissionSet,
} from '../lib/permissions'
import {
    createInvoice,
    Invoice,
    NewInvoiceItem,
    updateInvoice,
} from '../services/billing'
import {
    getTreatmentPlan,
    getTreatmentPlans,
} from '../services/treatment-plans'
import { getActiveTreatments } from '../services/treatments'
import AppointmentDialog, {
    appointmentButtonClass as button,
    appointmentInputClass as input,
    appointmentPrimaryClass as primary,
} from './AppointmentDialog'
import BillingFeedback from './BillingFeedback'
import AppointmentPatientSelector from './AppointmentPatientSelector'

type Line = {
    key: number
    source: 'catalog' | 'plan' | 'custom'
    id: string
    description: string
    price: string
    quantity: string
}
const emptyLine = (key: number): Line => ({
    key,
    source: 'custom',
    id: '',
    description: '',
    price: '',
    quantity: '1',
})
export default function InvoiceForm({
    patient,
    invoice,
    canWrite,
    onClose,
    onSaved,
}: {
    patient?: Patient
    invoice?: Invoice
    canWrite: boolean
    onClose: () => void
    onSaved: (invoice: Invoice) => void
}) {
    const { user, currentTenant } = useAuthSession()
    const [patientId, setPatientId] = useState(String(patient?.id ?? ''))
    const [number, setNumber] = useState(invoice?.invoice_number ?? '')
    const [currency, setCurrency] = useState('')
    const [due, setDue] = useState(invoice?.due_date?.slice(0, 10) ?? '')
    const [appointment, setAppointment] = useState('')
    const [lines, setLines] = useState<Line[]>([emptyLine(1)])
    const sequence = useRef(1)
    const [planPage, setPlanPage] = useState(1)
    const [planId, setPlanId] = useState('')
    const [busy, setBusy] = useState(false)
    const saving = useRef(false)
    const [message, setMessage] = useState('')
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const grants = getUserPermissionSet(user)
    const catalog = useSWR(
        !invoice && grants.has('treatments.view')
            ? ['billing-catalog', user]
            : null,
        getActiveTreatments,
        { shouldRetryOnError: false },
    )
    const plans = useSWR(
        !invoice &&
            getTreatmentPlanPermissions(user).canView &&
            Number(patientId) > 0
            ? ['billing-plans', user, patientId, planPage]
            : null,
        () =>
            getTreatmentPlans(Number(patientId), {
                page: planPage,
                per_page: 15,
            }),
        { shouldRetryOnError: false },
    )
    const plan = useSWR(
        !invoice && planId ? ['billing-plan', user, patientId, planId] : null,
        async () => {
            const result = await getTreatmentPlan(Number(planId))
            if (result.patient_id !== Number(patientId))
                throw new Error(
                    'Treatment plan is unavailable for this patient.',
                )
            return result
        },
        { shouldRetryOnError: false },
    )
    const planItems =
        !plan.error && plan.data?.status !== 'cancelled'
            ? plan.data?.items?.filter(item => item.status !== 'cancelled') ??
              []
            : []
    const treatments = catalog.error
        ? []
        : catalog.data?.filter(item => item.active) ?? []
    const patchLine = (key: number, change: Partial<Line>) =>
        setLines(current =>
            current.map(line =>
                line.key === key ? { ...line, ...change } : line,
            ),
        )
    const price = (line: Line) =>
        line.source === 'custom'
            ? line.price
            : line.source === 'catalog'
            ? treatments.find(item => String(item.id) === line.id)?.price
            : planItems.find(item => String(item.id) === line.id)
                  ?.estimated_price
    const total = lines.reduce<number | null>((sum, line) => {
        const minor = moneyMinor(price(line) ?? '')
        const quantity = Number(line.quantity)
        return sum === null ||
            minor === null ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 10000
            ? null
            : sum + minor * quantity
    }, 0)
    const save = async (event: FormEvent) => {
        event.preventDefault()
        if (!canWrite || !currentTenant || saving.current) return
        const next: ApiFieldErrors = {}
        if (!number.trim()) next.invoice_number = ['Enter an invoice number.']
        if (!invoice) {
            if (
                !Number.isSafeInteger(Number(patientId)) ||
                Number(patientId) <= 0
            )
                next.patient_id = ['Enter a valid patient ID.']
            if (!/^[A-Z]{3}$/.test(currency))
                next.currency = ['Enter an uppercase three-letter currency.']
            if (
                appointment &&
                (!Number.isSafeInteger(Number(appointment)) ||
                    Number(appointment) <= 0)
            )
                next.appointment_id = ['Enter a valid appointment ID.']
            if (
                !lines.length ||
                lines.length > 100 ||
                total === null ||
                total > maxInvoiceMinor
            )
                next.items = [
                    'Complete 1 to 100 lines. The invoice total cannot exceed 99,999,999.99.',
                ]
            lines.forEach((line, index) => {
                if (
                    line.source === 'custom'
                        ? !line.description.trim()
                        : !line.id || !price(line)
                )
                    next[`items.${index}`] = [
                        'Choose a valid source or enter a custom description and price.',
                    ]
            })
        }
        setErrors(next)
        setMessage('')
        if (Object.keys(next).length) return
        saving.current = true
        setBusy(true)
        try {
            const options = { tenantId: currentTenant.id }
            const saved = invoice
                ? await updateInvoice(
                      invoice.id,
                      { invoice_number: number.trim(), due_date: due || null },
                      options,
                  )
                : await createInvoice(
                      {
                          patient_id: Number(patientId),
                          appointment_id: appointment
                              ? Number(appointment)
                              : null,
                          invoice_number: number.trim(),
                          currency,
                          due_date: due || null,
                          items: lines.map(
                              (line): NewInvoiceItem => ({
                                  quantity: Number(line.quantity),
                                  ...(line.source === 'catalog'
                                      ? { treatment_id: Number(line.id) }
                                      : line.source === 'plan'
                                      ? {
                                            treatment_plan_item_id: Number(
                                                line.id,
                                            ),
                                        }
                                      : {
                                            description: line.description.trim(),
                                            unit_price: line.price,
                                        }),
                              }),
                          ),
                      },
                      options,
                  )
            onSaved(saved)
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setMessage(failure.message)
            setErrors(failure.errors)
        } finally {
            saving.current = false
            setBusy(false)
        }
    }
    return (
        <AppointmentDialog
            title={invoice ? 'Edit draft invoice' : 'Create draft invoice'}
            onClose={onClose}
            busy={busy}
            closeLabel="Close invoice form">
            <form onSubmit={save} className="space-y-5 p-6">
                <BillingFeedback message={message} errors={errors} />
                <fieldset
                    disabled={busy || !canWrite}
                    className="space-y-5 disabled:opacity-60">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {!invoice && !patient && grants.has('patients.view') ? (
                            <AppointmentPatientSelector
                                value={patientId}
                                onChange={value => {
                                    setPatientId(value)
                                    setPlanId('')
                                    setPlanPage(1)
                                    setLines([emptyLine(++sequence.current)])
                                }}
                                disabled={busy || !canWrite}
                                errors={errors.patient_id}
                            />
                        ) : (
                            !invoice && (
                                <label className="text-sm font-bold">
                                    Patient ID
                                    <input
                                        name="patient_id"
                                        aria-label="Patient ID"
                                        required
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={patientId}
                                        disabled={Boolean(patient)}
                                        className={input}
                                        onChange={event => {
                                            setPatientId(event.target.value)
                                            setPlanId('')
                                            setPlanPage(1)
                                            setLines([
                                                emptyLine(++sequence.current),
                                            ])
                                        }}
                                    />
                                    {patient && (
                                        <span className="mt-1 block text-xs text-clinic-muted">
                                            {patient.firstName}{' '}
                                            {patient.lastName}
                                        </span>
                                    )}
                                </label>
                            )
                        )}
                        <label className="text-sm font-bold">
                            Invoice number
                            <input
                                name="invoice_number"
                                required
                                value={number}
                                className={input}
                                onChange={event =>
                                    setNumber(event.target.value)
                                }
                            />
                        </label>
                        {!invoice && (
                            <label className="text-sm font-bold">
                                Currency
                                <input
                                    name="currency"
                                    required
                                    pattern="[A-Z]{3}"
                                    maxLength={3}
                                    placeholder="USD"
                                    value={currency}
                                    className={input}
                                    onChange={event =>
                                        setCurrency(
                                            event.target.value.toUpperCase(),
                                        )
                                    }
                                />
                            </label>
                        )}
                        <label className="text-sm font-bold">
                            Due date (optional)
                            <input
                                name="due_date"
                                type="date"
                                value={due}
                                className={input}
                                onChange={event => setDue(event.target.value)}
                            />
                        </label>
                        {!invoice && (
                            <label className="text-sm font-bold">
                                Appointment ID (optional)
                                <input
                                    name="appointment_id"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={appointment}
                                    className={input}
                                    onChange={event =>
                                        setAppointment(event.target.value)
                                    }
                                />
                                <span className="mt-1 block text-xs text-clinic-muted">
                                    Must belong to this patient.
                                </span>
                            </label>
                        )}
                    </div>
                    {invoice ? (
                        <p className="rounded-md bg-clinic-sky p-4 text-sm">
                            Saved line items cannot be edited. Void this unpaid
                            invoice and create a replacement to correct services
                            or prices.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm text-clinic-muted">
                                Catalog and plan prices use the selected
                                currency. The server captures their current
                                names and prices when saved. Saved lines cannot
                                be edited.
                            </p>
                            {getTreatmentPlanPermissions(user).canView && (
                                <div className="rounded-md border border-clinic-line p-3">
                                    <label className="text-sm font-bold">
                                        Treatment plan
                                        <select
                                            aria-label="Treatment plan"
                                            value={planId}
                                            className={input}
                                            onChange={event => {
                                                setPlanId(event.target.value)
                                                setLines(current =>
                                                    current.filter(
                                                        line =>
                                                            line.source !==
                                                            'plan',
                                                    ),
                                                )
                                            }}>
                                            <option value="">
                                                Choose a plan for plan-sourced
                                                lines
                                            </option>
                                            {!plans.error &&
                                                plans.data?.plans
                                                    .filter(
                                                        item =>
                                                            item.status !==
                                                            'cancelled',
                                                    )
                                                    .map(item => (
                                                        <option
                                                            key={item.id}
                                                            value={item.id}>
                                                            {item.title}
                                                        </option>
                                                    ))}
                                        </select>
                                    </label>
                                    {plans.isValidating && (
                                        <p role="status" className="text-sm">
                                            Loading treatment plans...
                                        </p>
                                    )}
                                    {plans.error && (
                                        <div>
                                            <BillingFeedback message="Unable to load treatment plans." />
                                            <button
                                                type="button"
                                                className={button}
                                                onClick={() =>
                                                    void plans.mutate()
                                                }>
                                                Retry plans
                                            </button>
                                        </div>
                                    )}
                                    {(plans.data?.meta.lastPage ?? 1) > 1 && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <button
                                                type="button"
                                                className={button}
                                                disabled={planPage <= 1}
                                                onClick={() =>
                                                    setPlanPage(
                                                        value => value - 1,
                                                    )
                                                }>
                                                Previous plans
                                            </button>
                                            <span className="text-xs">
                                                Page {planPage}
                                            </span>
                                            <button
                                                type="button"
                                                className={button}
                                                disabled={
                                                    planPage >=
                                                    Number(
                                                        plans.data.meta
                                                            .lastPage,
                                                    )
                                                }
                                                onClick={() =>
                                                    setPlanPage(
                                                        value => value + 1,
                                                    )
                                                }>
                                                Next plans
                                            </button>
                                        </div>
                                    )}
                                    {plan.isValidating && (
                                        <p role="status" className="text-sm">
                                            Loading plan items...
                                        </p>
                                    )}
                                    {plan.error && (
                                        <div>
                                            <BillingFeedback message="Unable to load plan items." />
                                            <button
                                                type="button"
                                                className={button}
                                                onClick={() =>
                                                    void plan.mutate()
                                                }>
                                                Retry plan items
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {catalog.error && (
                                <div>
                                    <BillingFeedback message="Unable to load the treatment catalog." />
                                    <button
                                        type="button"
                                        className={button}
                                        onClick={() => void catalog.mutate()}>
                                        Retry catalog
                                    </button>
                                </div>
                            )}
                            {catalog.isValidating && (
                                <p role="status" className="text-sm">
                                    Loading catalog...
                                </p>
                            )}
                            {lines.map((line, index) => (
                                <fieldset
                                    key={line.key}
                                    className="space-y-3 rounded-md border border-clinic-line p-4">
                                    <legend className="px-1 text-sm font-bold">
                                        Line {index + 1}
                                    </legend>
                                    <label className="block text-sm">
                                        Source
                                        <select
                                            aria-label={`Line ${
                                                index + 1
                                            } source`}
                                            className={input}
                                            value={line.source}
                                            onChange={event =>
                                                patchLine(line.key, {
                                                    source: event.target
                                                        .value as Line['source'],
                                                    id: '',
                                                    description: '',
                                                    price: '',
                                                })
                                            }>
                                            <option value="custom">
                                                Custom service
                                            </option>
                                            <option
                                                value="catalog"
                                                disabled={!treatments.length}>
                                                Active catalog treatment
                                            </option>
                                            <option
                                                value="plan"
                                                disabled={!planItems.length}>
                                                Treatment plan item
                                            </option>
                                        </select>
                                    </label>
                                    {line.source === 'custom' ? (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="text-sm">
                                                Description
                                                <input
                                                    aria-label={`Line ${
                                                        index + 1
                                                    } description`}
                                                    required
                                                    value={line.description}
                                                    className={input}
                                                    onChange={event =>
                                                        patchLine(line.key, {
                                                            description:
                                                                event.target
                                                                    .value,
                                                        })
                                                    }
                                                />
                                            </label>
                                            <label className="text-sm">
                                                Unit price
                                                <input
                                                    aria-label={`Line ${
                                                        index + 1
                                                    } unit price`}
                                                    required
                                                    inputMode="decimal"
                                                    value={line.price}
                                                    className={input}
                                                    onChange={event =>
                                                        patchLine(line.key, {
                                                            price:
                                                                event.target
                                                                    .value,
                                                        })
                                                    }
                                                />
                                            </label>
                                        </div>
                                    ) : (
                                        <label className="block text-sm">
                                            Treatment
                                            <select
                                                aria-label={`Line ${
                                                    index + 1
                                                } treatment`}
                                                required
                                                value={line.id}
                                                className={input}
                                                onChange={event =>
                                                    patchLine(line.key, {
                                                        id: event.target.value,
                                                    })
                                                }>
                                                <option value="">
                                                    Choose treatment
                                                </option>
                                                {(line.source === 'catalog'
                                                    ? treatments.map(item => ({
                                                          id: item.id,
                                                          name: item.name,
                                                          price: item.price,
                                                      }))
                                                    : planItems.map(item => ({
                                                          id: item.id,
                                                          name:
                                                              item.treatment_name,
                                                          price:
                                                              item.estimated_price,
                                                      }))
                                                ).map(item => (
                                                    <option
                                                        key={item.id}
                                                        value={item.id}>
                                                        {item.name} —{' '}
                                                        {displayMoney(
                                                            item.price,
                                                            currency ||
                                                                'Currency',
                                                        )}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                    <div className="flex items-end justify-between gap-3">
                                        <label className="text-sm">
                                            Quantity
                                            <input
                                                aria-label={`Line ${
                                                    index + 1
                                                } quantity`}
                                                required
                                                type="number"
                                                min="1"
                                                max="10000"
                                                step="1"
                                                value={line.quantity}
                                                className={input}
                                                onChange={event =>
                                                    patchLine(line.key, {
                                                        quantity:
                                                            event.target.value,
                                                    })
                                                }
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            className={button}
                                            disabled={lines.length <= 1}
                                            aria-label={`Remove line ${
                                                index + 1
                                            }`}
                                            onClick={() =>
                                                setLines(current =>
                                                    current.filter(
                                                        item =>
                                                            item.key !==
                                                            line.key,
                                                    ),
                                                )
                                            }>
                                            Remove
                                        </button>
                                    </div>
                                </fieldset>
                            ))}
                            <button
                                type="button"
                                className={button}
                                disabled={lines.length >= 100}
                                onClick={() =>
                                    setLines(current => [
                                        ...current,
                                        emptyLine(++sequence.current),
                                    ])
                                }>
                                Add line
                            </button>
                            <p className="text-sm font-bold">
                                Estimated total:{' '}
                                {total === null || total > maxInvoiceMinor
                                    ? 'Complete valid lines'
                                    : displayMoney(
                                          decimalMoney(total),
                                          currency || 'Currency',
                                      )}
                            </p>
                        </>
                    )}
                </fieldset>
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className={primary}
                        disabled={busy || !canWrite}>
                        {busy
                            ? 'Saving...'
                            : invoice
                            ? 'Save draft details'
                            : 'Create draft'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
