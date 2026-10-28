import React, { FormEvent, useCallback, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSWRConfig } from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    canSettleInvoice,
    canVoidInvoice,
    decimalMoney,
    displayMoney,
    invoiceStatusLabels,
    moneyMinor,
    paymentMethods,
} from '../lib/billing'
import { getBillingPermissions } from '../lib/permissions'
import { blocksInvoicePayments } from '../lib/payment-links'
import { dashboardSummaryKey } from '../services/dashboard'
import {
    BillingPage,
    getInvoice,
    getInvoices,
    getInvoicePaymentLinkHistory,
    getPatientBillingBalances,
    getPayments,
    Invoice,
    InvoiceStatus,
    Payment,
    updateInvoice,
} from '../services/billing'
import AppointmentDialog, {
    appointmentButtonClass as button,
    appointmentInputClass as input,
    appointmentPrimaryClass as primary,
} from './AppointmentDialog'
import BillingFeedback from './BillingFeedback'
import BillingPaymentForm from './BillingPaymentForm'
import InvoiceForm from './InvoiceForm'
import InvoicePaymentLinks from './InvoicePaymentLinks'
import { isArchivedPatient } from './PatientRowDetails'

const Status = ({ status }: { status: InvoiceStatus }) => (
    <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
            status === 'paid'
                ? 'bg-clinic-mint text-emerald-800'
                : status === 'void'
                ? 'bg-clinic-rose text-rose-800'
                : status === 'partially_paid'
                ? 'bg-clinic-amber text-amber-800'
                : 'bg-clinic-sky text-clinic-blue'
        }`}>
        {invoiceStatusLabels[status]}
    </span>
)
const dateLabel = (value?: string | null) =>
    value ? value.slice(0, 10) : 'Not set'
const paidTime = (value: string) =>
    Number.isNaN(Date.parse(value)) ? value : new Date(value).toLocaleString()
const Pagination = ({
    page,
    last,
    busy,
    onChange,
}: {
    page: number
    last: number
    busy?: boolean
    onChange: (page: number) => void
}) => (
    <nav
        aria-label="Billing pagination"
        className="mt-4 flex flex-wrap items-center justify-end gap-3 text-sm">
        <button
            type="button"
            className={button}
            disabled={busy || page <= 1}
            onClick={() => onChange(page - 1)}>
            Previous
        </button>
        <span>
            Page {page} of {last}
        </span>
        <button
            type="button"
            className={button}
            disabled={busy || page >= last}
            onClick={() => onChange(page + 1)}>
            Next
        </button>
    </nav>
)

function PaymentList({
    invoiceId,
    revision,
}: {
    invoiceId?: number
    revision: number
}) {
    const { user, currentTenant } = useAuthSession()
    const [page, setPage] = useState(1)
    const { data, error, isValidating, mutate } = useSWR<BillingPage<Payment>>(
        currentTenant && getBillingPermissions(user).canViewPayments
            ? [
                  'billing-payments',
                  user,
                  currentTenant.id,
                  invoiceId,
                  page,
                  revision,
              ]
            : null,
        () =>
            getPayments(
                { invoice_id: invoiceId, page },
                { tenantId: currentTenant.id },
            ),
        { shouldRetryOnError: false },
    )
    if (!getBillingPermissions(user).canViewPayments)
        return (
            <p className="text-sm text-clinic-muted">
                Payment history requires payment read access.
            </p>
        )
    return (
        <section aria-label="Payment history" className="space-y-3">
            <h3 className="font-extrabold">Settled payments</h3>
            {error ? (
                <>
                    <BillingFeedback
                        message={normalizeAxiosError(error).message}
                    />
                    <button
                        type="button"
                        className={button}
                        onClick={() => void mutate()}>
                        Retry payments
                    </button>
                </>
            ) : !data ? (
                <p role="status">Loading payments...</p>
            ) : (
                <>
                    {!data.records.length ? (
                        <p className="rounded-md border border-dashed border-clinic-line p-5 text-sm text-clinic-muted">
                            No settled payments recorded.
                        </p>
                    ) : (
                        <ul className="space-y-3">
                            {data.records.map(payment => (
                                <li
                                    key={payment.id}
                                    className="rounded-md border border-clinic-line p-4 text-sm">
                                    <div className="flex flex-wrap justify-between gap-2">
                                        <strong>
                                            {displayMoney(
                                                payment.amount,
                                                payment.currency,
                                            )}
                                        </strong>
                                        <span className="rounded-full bg-clinic-mint px-2 py-1 text-xs font-bold text-emerald-800">
                                            Settled
                                        </span>
                                    </div>
                                    <p className="mt-2">
                                        {paymentMethods[payment.payment_method]}{' '}
                                        · {paidTime(payment.paid_at)}
                                    </p>
                                    <p className="mt-1 text-clinic-muted">
                                        Payment #{payment.id}
                                        {!invoiceId &&
                                            ` · Invoice #${payment.invoice_id}`}
                                    </p>
                                    <dl className="mt-3 grid gap-2 break-words sm:grid-cols-2">
                                        <div>
                                            <dt className="text-xs text-clinic-muted">
                                                Receipt number
                                            </dt>
                                            <dd>
                                                {payment.receipt_number ||
                                                    'Not provided'}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-clinic-muted">
                                                Reference
                                            </dt>
                                            <dd>
                                                {payment.reference ||
                                                    'Not provided'}
                                            </dd>
                                        </div>
                                    </dl>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Pagination
                        page={page}
                        last={Number(data.meta.lastPage)}
                        busy={isValidating}
                        onChange={setPage}
                    />
                </>
            )}
        </section>
    )
}

export default function BillingWorkspace({ patient }: { patient?: Patient }) {
    const { user, status: sessionStatus, currentTenant } = useAuthSession()
    const access = getBillingPermissions(user)
    const ready = sessionStatus === 'authenticated' && Boolean(currentTenant)
    const [section, setSection] = useState<'invoices' | 'payments'>(
        access.canViewInvoices ? 'invoices' : 'payments',
    )
    const [page, setPage] = useState(1)
    const [status, setStatus] = useState<InvoiceStatus | ''>('')
    const [revision, setRevision] = useState(0)
    const [selected, setSelected] = useState<number | null>(null)
    const [editor, setEditor] = useState<'create' | 'edit' | null>(null)
    const [paymentOpen, setPaymentOpen] = useState(false)
    const [paymentTarget, setPaymentTarget] = useState<Invoice | undefined>()
    const [linkBusyInvoice, setLinkBusyInvoice] = useState<number | null>(null)
    const [action, setAction] = useState<'issue' | 'void' | null>(null)
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const saving = useRef(false)
    const [blocked, setBlocked] = useState(false)
    const [message, setMessage] = useState('')
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const [notice, setNotice] = useState('')
    const { mutate } = useSWRConfig()
    const feed = useSWR(
        ready && access.canViewInvoices && section === 'invoices'
            ? [
                  'billing-invoices',
                  user,
                  currentTenant.id,
                  patient?.id,
                  page,
                  status,
                  revision,
              ]
            : null,
        () =>
            getInvoices(
                {
                    patient_id: patient?.id,
                    page,
                    ...(status ? { status } : {}),
                },
                { tenantId: currentTenant.id },
            ),
        { shouldRetryOnError: false },
    )
    const balances = useSWR(
        ready && access.canViewInvoices && patient
            ? [
                  'billing-patient-balance',
                  user,
                  currentTenant.id,
                  patient.id,
                  revision,
              ]
            : null,
        () =>
            getPatientBillingBalances(patient.id, {
                tenantId: currentTenant.id,
            }),
        { shouldRetryOnError: false },
    )
    const detail = useSWR(
        ready && access.canViewInvoices && selected !== null
            ? ['billing-invoice', user, currentTenant.id, selected]
            : null,
        async () => {
            const result = await getInvoice(selected, {
                tenantId: currentTenant.id,
            })
            if (patient && result.patient_id !== patient.id)
                throw new Error('Invoice is unavailable for this patient.')
            return result
        },
        { shouldRetryOnError: false },
    )
    const invoice = !detail.error ? detail.data : undefined
    const links = useSWR(
        ready && invoice && access.canViewPaymentLinks
            ? ['billing-payment-links', user, currentTenant.id, invoice.id]
            : null,
        () =>
            getInvoicePaymentLinkHistory(invoice.id, {
                tenantId: currentTenant.id,
            }),
        { shouldRetryOnError: false },
    )
    const checkoutBlocksPayment = Boolean(
        invoice &&
            (linkBusyInvoice === invoice.id ||
                (access.canViewPaymentLinks &&
                    (!links.data ||
                        links.error ||
                        links.data.some(blocksInvoicePayments)))),
    )
    const updateCheckoutBusy = useCallback(
        (value: boolean) => {
            setLinkBusyInvoice(value ? invoice?.id ?? null : null)
        },
        [invoice?.id],
    )
    const canCreate =
        ready &&
        access.canCreateInvoice &&
        !blocked &&
        (!patient || !isArchivedPatient(patient))
    const canUpdate = ready && access.canUpdateInvoice && !blocked
    const canRecord = ready && access.canRecordPayment && !blocked
    const refresh = () => {
        setPage(1)
        setRevision(value => value + 1)
        void detail.mutate()
        void links.mutate()
        void mutate(dashboardSummaryKey(user)).catch(() => undefined)
    }
    const acceptInvoice = (saved: Invoice) => {
        setEditor(null)
        setSelected(saved.id)
        setNotice(`Invoice ${saved.invoice_number} saved.`)
        refresh()
    }
    const acceptPayment = (saved: Payment) => {
        setPaymentOpen(false)
        setNotice(
            `Payment #${saved.id} recorded: ${displayMoney(
                saved.amount,
                saved.currency,
            )}. Receipt: ${
                saved.receipt_number || 'not provided'
            }. Reference: ${saved.reference || 'not provided'}.`,
        )
        refresh()
    }
    const startAction = (next: 'issue' | 'void') => {
        setAction(next)
        setReason('')
        setMessage('')
        setErrors({})
    }
    const performAction = async (event: FormEvent) => {
        event.preventDefault()
        if (!invoice || !action || !canUpdate || saving.current) return
        if (
            action === 'void' &&
            (!reason.trim() || reason.trim().length > 500)
        ) {
            setErrors({
                void_reason: ['Enter a reason of 1 to 500 characters.'],
            })
            return
        }
        saving.current = true
        setBusy(true)
        setMessage('')
        setErrors({})
        try {
            const saved = await updateInvoice(
                invoice.id,
                action === 'issue'
                    ? { status: 'issued' }
                    : { status: 'void', void_reason: reason.trim() },
                { tenantId: currentTenant.id },
            )
            setAction(null)
            setNotice(
                `Invoice ${saved.invoice_number}: ${
                    invoiceStatusLabels[saved.status]
                }.`,
            )
            refresh()
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setMessage(failure.message)
            setErrors(failure.errors)
            if ([401, 403, 404].includes(failure.statusCode)) setBlocked(true)
            // A competing writer may have settled or voided this invoice.
            void detail.mutate()
            void feed.mutate()
            void balances.mutate()
        } finally {
            saving.current = false
            setBusy(false)
        }
    }
    if (!ready)
        return (
            <p role="status" className="p-5 text-sm">
                Loading billing access...
            </p>
        )
    if (!Object.values(access).some(Boolean))
        return (
            <p className="rounded-md border border-clinic-line bg-white p-5 text-sm text-clinic-muted">
                You do not have billing access for this clinic.
            </p>
        )
    return (
        <section
            aria-label="Billing workspace"
            className={patient ? 'space-y-5' : 'space-y-5 p-4 sm:p-8'}>
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-extrabold text-clinic-ink">
                        {patient ? 'Patient billing' : 'Billing'}
                    </h2>
                    <p className="mt-1 text-sm text-clinic-muted">
                        Invoices, balances and settled payment records
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {canCreate && (
                        <button
                            type="button"
                            className={primary}
                            onClick={() => {
                                setNotice('')
                                setEditor('create')
                            }}>
                            Create invoice
                        </button>
                    )}
                    {!patient && canRecord && !selected && (
                        <button
                            type="button"
                            className={button}
                            onClick={() => {
                                setPaymentTarget(undefined)
                                setPaymentOpen(true)
                            }}>
                            Record settled payment
                        </button>
                    )}
                </div>
            </header>
            {patient && isArchivedPatient(patient) && (
                <p className="rounded-md bg-clinic-amber p-4 text-sm">
                    This patient is archived. Existing invoices can still be
                    settled. New invoices cannot be created.
                </p>
            )}
            {notice && (
                <p
                    role="status"
                    className="break-words rounded-md bg-clinic-mint p-4 text-sm text-emerald-800">
                    {notice}
                </p>
            )}
            {blocked && (
                <BillingFeedback message="Billing actions are unavailable. Refresh your clinic session and reload this workspace." />
            )}
            {patient && access.canViewInvoices && (
                <section
                    aria-label="Patient balance"
                    className="rounded-lg border border-clinic-line bg-white p-5">
                    <h3 className="font-extrabold">Outstanding balance</h3>
                    <p className="mt-1 text-xs text-clinic-muted">
                        All issued invoices, by currency. Drafts and void
                        invoices are excluded.
                    </p>
                    {balances.error ? (
                        <div className="mt-3">
                            <BillingFeedback message="Unable to load the complete patient balance." />
                            <button
                                type="button"
                                className={button}
                                onClick={() => void balances.mutate()}>
                                Retry balance
                            </button>
                        </div>
                    ) : !balances.data ? (
                        <p role="status" className="mt-3 text-sm">
                            Loading complete balance...
                        </p>
                    ) : Object.keys(balances.data).length ? (
                        <div className="mt-4 flex flex-wrap gap-6">
                            {Object.entries(balances.data).map(
                                ([currency, minor]) => (
                                    <p
                                        className="text-xl font-extrabold"
                                        key={currency}>
                                        {displayMoney(
                                            decimalMoney(minor),
                                            currency,
                                        )}
                                    </p>
                                ),
                            )}
                        </div>
                    ) : (
                        <p className="mt-3 text-sm">No issued balance.</p>
                    )}
                </section>
            )}
            {!patient && (
                <nav
                    aria-label="Billing sections"
                    className="flex gap-3 border-b border-clinic-line pb-3">
                    {access.canViewInvoices && (
                        <button
                            type="button"
                            className={
                                section === 'invoices' ? primary : button
                            }
                            onClick={() => {
                                setSection('invoices')
                                setSelected(null)
                            }}>
                            Invoices
                        </button>
                    )}
                    {access.canViewPayments && (
                        <button
                            type="button"
                            className={
                                section === 'payments' ? primary : button
                            }
                            onClick={() => {
                                setSection('payments')
                                setSelected(null)
                            }}>
                            Payments
                        </button>
                    )}
                </nav>
            )}
            {section === 'payments' && !patient && access.canViewPayments && (
                <PaymentList revision={revision} />
            )}
            {access.canViewInvoices && (patient || section === 'invoices') && (
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
                    <section
                        aria-label="Invoice history"
                        className="min-w-0 rounded-lg border border-clinic-line bg-white p-5">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-extrabold">Invoice history</h3>
                            <label className="text-xs font-bold">
                                Status
                                <select
                                    aria-label="Invoice status filter"
                                    value={status}
                                    className={input}
                                    onChange={event => {
                                        setStatus(
                                            event.target.value as
                                                | InvoiceStatus
                                                | '',
                                        )
                                        setPage(1)
                                    }}>
                                    <option value="">All statuses</option>
                                    {Object.entries(invoiceStatusLabels).map(
                                        ([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>
                        </div>
                        {feed.error ? (
                            <>
                                <BillingFeedback
                                    message={
                                        normalizeAxiosError(feed.error).message
                                    }
                                />
                                <button
                                    type="button"
                                    className={button}
                                    onClick={() => void feed.mutate()}>
                                    Retry invoices
                                </button>
                            </>
                        ) : !feed.data ? (
                            <p role="status" className="text-sm">
                                Loading invoices...
                            </p>
                        ) : (
                            <>
                                {!feed.data.records.length ? (
                                    <p className="rounded-md border border-dashed border-clinic-line p-5 text-sm text-clinic-muted">
                                        No invoices found
                                        {status ? ' for this status' : ''}.
                                    </p>
                                ) : (
                                    <ul className="space-y-3">
                                        {feed.data.records.map(item => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    aria-label={`View invoice ${item.invoice_number}`}
                                                    aria-pressed={
                                                        selected === item.id
                                                    }
                                                    onClick={() => {
                                                        setSelected(item.id)
                                                        setNotice('')
                                                    }}
                                                    className={`w-full rounded-md border p-4 text-left transition hover:border-clinic-blue ${
                                                        selected === item.id
                                                            ? 'border-clinic-blue bg-clinic-sky'
                                                            : 'border-clinic-line'
                                                    }`}>
                                                    <div className="flex flex-wrap justify-between gap-2">
                                                        <strong className="break-all text-sm">
                                                            {
                                                                item.invoice_number
                                                            }
                                                        </strong>
                                                        <Status
                                                            status={item.status}
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-xs text-clinic-muted">
                                                        {!patient &&
                                                            `Patient #${item.patient_id} · `}
                                                        Created{' '}
                                                        {dateLabel(
                                                            item.created_at,
                                                        )}
                                                    </p>
                                                    <p className="mt-2 text-sm font-semibold">
                                                        Balance{' '}
                                                        {displayMoney(
                                                            item.balance,
                                                            item.currency,
                                                        )}
                                                    </p>
                                                    <p className="mt-1 text-xs text-clinic-muted">
                                                        Total{' '}
                                                        {displayMoney(
                                                            item.amount_due,
                                                            item.currency,
                                                        )}
                                                    </p>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <Pagination
                                    page={page}
                                    last={Number(feed.data.meta.lastPage)}
                                    busy={feed.isValidating}
                                    onChange={setPage}
                                />
                            </>
                        )}
                    </section>
                    <section
                        aria-label="Invoice details"
                        className="min-w-0 space-y-5 rounded-lg border border-clinic-line bg-white p-5">
                        {!selected ? (
                            <p className="py-8 text-center text-sm text-clinic-muted">
                                Select an invoice to view its lines, balance and
                                payments.
                            </p>
                        ) : detail.error ? (
                            <>
                                <BillingFeedback
                                    message={
                                        normalizeAxiosError(detail.error)
                                            .message
                                    }
                                />
                                <button
                                    type="button"
                                    className={button}
                                    onClick={() => void detail.mutate()}>
                                    Retry invoice details
                                </button>
                            </>
                        ) : !invoice ? (
                            <p role="status" className="text-sm">
                                Loading invoice details...
                            </p>
                        ) : (
                            <>
                                <header className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 className="break-all text-lg font-extrabold">
                                            {invoice.invoice_number}
                                        </h3>
                                        <p className="mt-1 text-xs text-clinic-muted">
                                            Invoice #{invoice.id} · Patient #
                                            {invoice.patient_id}
                                        </p>
                                    </div>
                                    <Status status={invoice.status} />
                                </header>
                                <dl className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <dt className="text-xs text-clinic-muted">
                                            Created
                                        </dt>
                                        <dd>{dateLabel(invoice.created_at)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-clinic-muted">
                                            Due date
                                        </dt>
                                        <dd>{dateLabel(invoice.due_date)}</dd>
                                    </div>
                                    {invoice.appointment_id && (
                                        <div>
                                            <dt className="text-xs text-clinic-muted">
                                                Appointment
                                            </dt>
                                            <dd>#{invoice.appointment_id}</dd>
                                        </div>
                                    )}
                                </dl>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <caption className="mb-2 text-left text-xs text-clinic-muted">
                                            Saved line items ·{' '}
                                            {invoice.currency}
                                        </caption>
                                        <thead className="border-b border-clinic-line text-xs text-clinic-muted">
                                            <tr>
                                                <th className="py-2 pr-3">
                                                    Description
                                                </th>
                                                <th className="py-2 pr-3 text-right">
                                                    Qty
                                                </th>
                                                <th className="py-2 pr-3 text-right">
                                                    Unit price
                                                </th>
                                                <th className="py-2 text-right">
                                                    Total
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoice.items?.map(item => (
                                                <tr
                                                    key={item.id}
                                                    className="border-b border-clinic-line">
                                                    <td className="max-w-xs break-words py-3 pr-3">
                                                        {item.description}
                                                    </td>
                                                    <td className="py-3 pr-3 text-right">
                                                        {item.quantity}
                                                    </td>
                                                    <td className="whitespace-nowrap py-3 pr-3 text-right">
                                                        {item.unit_price}
                                                    </td>
                                                    <td className="whitespace-nowrap py-3 text-right">
                                                        {item.line_total ??
                                                            item.total ??
                                                            decimalMoney(
                                                                (moneyMinor(
                                                                    item.unit_price,
                                                                ) ?? 0) *
                                                                    item.quantity,
                                                            )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <dl className="space-y-2 rounded-md bg-clinic-canvas p-4 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <dt>Original total</dt>
                                        <dd>
                                            {displayMoney(
                                                invoice.amount_due,
                                                invoice.currency,
                                            )}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt>Settled payments</dt>
                                        <dd>
                                            {displayMoney(
                                                invoice.amount_paid,
                                                invoice.currency,
                                            )}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3 border-t border-clinic-line pt-2 font-extrabold">
                                        <dt>Collectible balance</dt>
                                        <dd>
                                            {displayMoney(
                                                invoice.balance,
                                                invoice.currency,
                                            )}
                                        </dd>
                                    </div>
                                </dl>
                                {invoice.status === 'partially_paid' && (
                                    <p className="rounded-md bg-clinic-amber p-3 text-sm">
                                        Partially paid.{' '}
                                        {displayMoney(
                                            invoice.balance,
                                            invoice.currency,
                                        )}{' '}
                                        remains to be settled.
                                    </p>
                                )}
                                {invoice.status === 'void' && (
                                    <p className="break-words rounded-md bg-clinic-rose p-3 text-sm">
                                        Void invoice.{' '}
                                        {invoice.void_reason &&
                                            `Reason: ${invoice.void_reason}`}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {canUpdate && invoice.status === 'draft' && (
                                        <>
                                            <button
                                                type="button"
                                                className={button}
                                                onClick={() =>
                                                    setEditor('edit')
                                                }>
                                                Edit draft details
                                            </button>
                                            <button
                                                type="button"
                                                className={primary}
                                                onClick={() =>
                                                    startAction('issue')
                                                }>
                                                Issue invoice
                                            </button>
                                        </>
                                    )}
                                    {canRecord && canSettleInvoice(invoice) && (
                                        <button
                                            type="button"
                                            className={primary}
                                            disabled={checkoutBlocksPayment}
                                            onClick={() => {
                                                setPaymentTarget(invoice)
                                                setPaymentOpen(true)
                                            }}>
                                            Record payment
                                        </button>
                                    )}
                                    {canUpdate && canVoidInvoice(invoice) && (
                                        <button
                                            type="button"
                                            className={`${button} text-rose-700`}
                                            disabled={checkoutBlocksPayment}
                                            onClick={() => startAction('void')}>
                                            Void invoice
                                        </button>
                                    )}
                                </div>
                                {checkoutBlocksPayment && (
                                    <p className="text-sm text-clinic-muted">
                                        New manual payments and voiding are
                                        paused while checkout history is checked
                                        or a checkout remains unresolved.
                                    </p>
                                )}
                                <InvoicePaymentLinks
                                    key={`${currentTenant.id}-${user.id}-${invoice.id}`}
                                    invoice={invoice}
                                    attempts={links.data}
                                    historyError={links.error}
                                    historyBusy={links.isValidating}
                                    disabled={blocked}
                                    onReload={() => links.mutate()}
                                    onChanged={refresh}
                                    onBusyChange={updateCheckoutBusy}
                                />
                                <PaymentList
                                    key={invoice.id}
                                    invoiceId={invoice.id}
                                    revision={revision}
                                />
                            </>
                        )}
                    </section>
                </div>
            )}
            {editor && (
                <InvoiceForm
                    patient={patient}
                    invoice={editor === 'edit' ? invoice : undefined}
                    canWrite={
                        editor === 'edit'
                            ? canUpdate && invoice?.status === 'draft'
                            : canCreate
                    }
                    onClose={() => setEditor(null)}
                    onSaved={acceptInvoice}
                />
            )}
            {paymentOpen && (
                <BillingPaymentForm
                    invoice={paymentTarget}
                    canWrite={canRecord}
                    onClose={() => setPaymentOpen(false)}
                    onSaved={acceptPayment}
                />
            )}
            {action && invoice && (
                <AppointmentDialog
                    title={
                        action === 'void' ? 'Void invoice?' : 'Issue invoice?'
                    }
                    busy={busy}
                    onClose={() => setAction(null)}
                    closeLabel="Close invoice confirmation">
                    <form className="space-y-4 p-6" onSubmit={performAction}>
                        <p className="text-sm">
                            {action === 'void'
                                ? `Void ${invoice.invoice_number}? Its original total and line history will be retained. This cannot be undone.`
                                : `Issue ${
                                      invoice.invoice_number
                                  } for ${displayMoney(
                                      invoice.amount_due,
                                      invoice.currency,
                                  )}? Draft details will be locked.${
                                      moneyMinor(invoice.amount_due) === 0
                                          ? ' This zero-total invoice will be marked paid immediately.'
                                          : ''
                                  }`}
                        </p>
                        <BillingFeedback message={message} errors={errors} />
                        {action === 'void' && (
                            <label className="block text-sm font-bold">
                                Void reason
                                <textarea
                                    name="void_reason"
                                    required
                                    maxLength={500}
                                    value={reason}
                                    disabled={busy}
                                    className={input}
                                    onChange={event =>
                                        setReason(event.target.value)
                                    }
                                />
                            </label>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className={button}
                                disabled={busy}
                                onClick={() => setAction(null)}>
                                Keep invoice
                            </button>
                            <button
                                type="submit"
                                className={primary}
                                disabled={
                                    busy ||
                                    !canUpdate ||
                                    (action === 'void'
                                        ? !canVoidInvoice(invoice)
                                        : invoice.status !== 'draft')
                                }>
                                {busy
                                    ? 'Saving...'
                                    : action === 'void'
                                    ? 'Confirm void'
                                    : 'Confirm issue'}
                            </button>
                        </div>
                    </form>
                </AppointmentDialog>
            )}
        </section>
    )
}
