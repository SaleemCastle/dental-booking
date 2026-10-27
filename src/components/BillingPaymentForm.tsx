import React, { FormEvent, useRef, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiFieldErrors, normalizeAxiosError } from '../lib/api'
import {
    displayMoney,
    newPaymentKey,
    paymentMethods,
    validatePayment,
} from '../lib/billing'
import {
    Invoice,
    NewPayment,
    Payment,
    PaymentMethod,
    recordPayment,
} from '../services/billing'
import AppointmentDialog, {
    appointmentButtonClass as button,
    appointmentInputClass as input,
    appointmentPrimaryClass as primary,
} from './AppointmentDialog'
import BillingFeedback from './BillingFeedback'

export default function BillingPaymentForm({
    invoice,
    canWrite,
    onClose,
    onSaved,
}: {
    invoice?: Invoice
    canWrite: boolean
    onClose: () => void
    onSaved: (payment: Payment) => void
}) {
    const { currentTenant } = useAuthSession()
    const [invoiceId, setInvoiceId] = useState(String(invoice?.id ?? ''))
    const [amount, setAmount] = useState('')
    const [currency, setCurrency] = useState(invoice?.currency ?? '')
    const [method, setMethod] = useState<PaymentMethod>('cash')
    const [reference, setReference] = useState('')
    const [receipt, setReceipt] = useState('')
    const [paidAt, setPaidAt] = useState('')
    const [pending, setPending] = useState<NewPayment | null>(null)
    const [busy, setBusy] = useState(false)
    const saving = useRef(false)
    const [message, setMessage] = useState('')
    const [errors, setErrors] = useState<ApiFieldErrors>({})
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (saving.current || !canWrite || !currentTenant) return
        let payload = pending
        if (!payload) {
            if (paidAt && Number.isNaN(new Date(paidAt).getTime())) {
                setErrors({ paid_at: ['Enter a valid payment time.'] })
                return
            }
            payload = {
                invoice_id: Number(invoiceId),
                amount,
                currency,
                payment_method: method,
                idempotency_key: newPaymentKey(),
                reference: reference || null,
                receipt_number: receipt || null,
                ...(paidAt ? { paid_at: new Date(paidAt).toISOString() } : {}),
            }
            const next = validatePayment(payload, invoice)
            setErrors(next)
            setMessage('')
            if (Object.keys(next).length) return
        }
        saving.current = true
        setBusy(true)
        setPending(payload)
        setMessage('')
        setErrors({})
        try {
            onSaved(
                await recordPayment(payload, { tenantId: currentTenant.id }),
            )
        } catch (error) {
            const failure = normalizeAxiosError(error)
            setErrors(failure.errors)
            // A lost/5xx response may have committed. Freeze the exact payload
            // and key for retry, even if the invoice has since become paid.
            if (failure.statusCode === 0 || failure.statusCode >= 500)
                setMessage(
                    'The outcome is unconfirmed. Retry this same payment to check or complete it safely. Keep this dialog open.',
                )
            else {
                setPending(null)
                setMessage(failure.message)
            }
        } finally {
            saving.current = false
            setBusy(false)
        }
    }
    const close = () => {
        if (
            !pending ||
            window.confirm(
                'This payment may already be recorded. Check invoice payment history before starting another payment. Close this dialog?',
            )
        )
            onClose()
    }
    return (
        <AppointmentDialog
            title="Record settled payment"
            onClose={close}
            busy={busy}
            closeLabel="Close payment form">
            <form className="space-y-5 p-6" onSubmit={submit}>
                <p className="text-sm text-clinic-muted">
                    Record funds already received. Card means an already-settled
                    payment. Use only transaction or receipt identifiers below.
                </p>
                {invoice && (
                    <p className="rounded-md bg-clinic-sky p-3 text-sm font-bold">
                        {invoice.invoice_number} · Balance{' '}
                        {displayMoney(invoice.balance, invoice.currency)}
                    </p>
                )}
                <BillingFeedback message={message} errors={errors} />
                <fieldset
                    disabled={busy || Boolean(pending) || !canWrite}
                    className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
                    {!invoice && (
                        <label className="text-sm font-bold">
                            Invoice ID
                            <input
                                name="invoice_id"
                                type="number"
                                min="1"
                                step="1"
                                required
                                value={invoiceId}
                                className={input}
                                onChange={event =>
                                    setInvoiceId(event.target.value)
                                }
                            />
                        </label>
                    )}
                    <label className="text-sm font-bold">
                        Amount
                        <input
                            name="amount"
                            inputMode="decimal"
                            required
                            value={amount}
                            className={input}
                            onChange={event => setAmount(event.target.value)}
                        />
                    </label>
                    <label className="text-sm font-bold">
                        Currency
                        <input
                            name="currency"
                            required
                            maxLength={3}
                            pattern="[A-Z]{3}"
                            readOnly={Boolean(invoice)}
                            value={currency}
                            className={input}
                            onChange={event =>
                                setCurrency(event.target.value.toUpperCase())
                            }
                        />
                    </label>
                    <label className="text-sm font-bold">
                        Payment method
                        <select
                            name="payment_method"
                            value={method}
                            className={input}
                            onChange={event =>
                                setMethod(event.target.value as PaymentMethod)
                            }>
                            {Object.entries(paymentMethods).map(
                                ([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ),
                            )}
                        </select>
                    </label>
                    <label className="text-sm font-bold">
                        Paid at (optional, local time)
                        <input
                            name="paid_at"
                            type="datetime-local"
                            value={paidAt}
                            className={input}
                            onChange={event => setPaidAt(event.target.value)}
                        />
                        <span className="mt-1 block text-xs text-clinic-muted">
                            Leave blank to use server time.
                        </span>
                    </label>
                    <label className="text-sm font-bold">
                        Reference (optional)
                        <input
                            name="reference"
                            maxLength={255}
                            value={reference}
                            className={input}
                            onChange={event => setReference(event.target.value)}
                        />
                    </label>
                    <label className="text-sm font-bold">
                        Receipt number (optional)
                        <input
                            name="receipt_number"
                            maxLength={255}
                            value={receipt}
                            className={input}
                            onChange={event => setReceipt(event.target.value)}
                        />
                    </label>
                </fieldset>
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={close}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className={primary}
                        disabled={busy || !canWrite}>
                        {busy
                            ? 'Recording...'
                            : pending
                            ? 'Retry same payment'
                            : 'Record payment'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
