import React, { useEffect, useRef, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { normalizeAxiosError } from '../lib/api'
import { canSettleInvoice, displayMoney } from '../lib/billing'
import {
    activeCheckoutUrl,
    blocksInvoicePayments,
    newPaymentLinkKey,
    paymentLinkLabels,
    readPaymentLinkKey,
    savePaymentLinkKey,
} from '../lib/payment-links'
import { getBillingPermissions } from '../lib/permissions'
import {
    cancelPaymentLink,
    createPaymentLink,
    getPaymentLink,
    Invoice,
    PaymentLink,
    refreshPaymentLink,
} from '../services/billing'
import AppointmentDialog, {
    appointmentButtonClass as button,
    appointmentPrimaryClass as primary,
} from './AppointmentDialog'
import BillingFeedback from './BillingFeedback'

class CheckoutActionError extends Error {}

const failureMessage = (error: unknown) => {
    if (error instanceof CheckoutActionError) return error.message
    const failure = normalizeAxiosError(error)
    const messages: Record<string, string> = {
        PAYMENT_LINK_IN_PROGRESS:
            'This checkout is still being created. Reload history or retry the same request shortly.',
        PAYMENT_LINK_RECONCILIATION_REQUIRED:
            'The checkout outcome is uncertain. Refresh its status if available, or ask an operator to reconcile it with the provider. Do not start another checkout.',
        PAYMENT_PROVIDER_OPERATION_UNSUPPORTED:
            'This provider does not support cancellation. The checkout remains payable. Resolve it with the provider and refresh its status before recording another payment.',
        PAYMENT_PROVIDER_NOT_CONFIGURED:
            'Online payments are unavailable for this clinic. Ask an administrator to check the provider configuration.',
        PAYMENT_PROVIDER_TIMEOUT:
            'The provider timed out. A checkout may already exist. Reload history and retry only this same request.',
        PAYMENT_PROVIDER_RATE_LIMITED:
            'The provider is busy. Wait before retrying this same request.',
    }
    return (
        messages[failure.code] ||
        (failure.statusCode === 0 || failure.statusCode >= 500
            ? 'The outcome could not be confirmed. Reload history before continuing. Retry creation only with the same request key.'
            : failure.message)
    )
}

export default function InvoicePaymentLinks({
    invoice,
    attempts,
    historyError,
    historyBusy,
    disabled,
    onReload,
    onChanged,
    onBusyChange,
}: {
    invoice: Invoice
    attempts?: PaymentLink[]
    historyError?: unknown
    historyBusy: boolean
    disabled: boolean
    onReload: () => Promise<unknown>
    onChanged: () => void
    onBusyChange: (busy: boolean) => void
}) {
    const { user, currentTenant } = useAuthSession()
    const access = getBillingPermissions(user)
    const [requestKey, setRequestKey] = useState<string | null>(null)
    const [keyReady, setKeyReady] = useState(false)
    const [latest, setLatest] = useState<PaymentLink | null>(null)
    const [busy, setBusy] = useState('')
    const saving = useRef(false)
    const mounted = useRef(true)
    const [message, setMessage] = useState('')
    const [notice, setNotice] = useState('')
    const [page, setPage] = useState(1)
    const [cancelTarget, setCancelTarget] = useState<PaymentLink | null>(null)
    const [resendTarget, setResendTarget] = useState<PaymentLink | null>(null)
    const [emailDraft, setEmailDraft] = useState<string | null>(null)
    useEffect(() => {
        onBusyChange(Boolean(busy || requestKey))
    }, [busy, requestKey, onBusyChange])
    useEffect(() => {
        mounted.current = true
        setRequestKey(readPaymentLinkKey(currentTenant.id, invoice.id))
        setKeyReady(true)
        return () => {
            mounted.current = false
        }
    }, [currentTenant.id, invoice.id])
    const rememberKey = (key: string | null) => {
        setRequestKey(key)
        savePaymentLinkKey(currentTenant.id, invoice.id, key)
    }
    useEffect(() => {
        if (!requestKey || !attempts) return
        const existing = attempts.find(
            attempt => attempt.idempotency_key === requestKey,
        )
        if (existing && !['creating', 'unknown'].includes(existing.status)) {
            setRequestKey(null)
            savePaymentLinkKey(currentTenant.id, invoice.id, null)
        }
    }, [attempts, requestKey, currentTenant.id, invoice.id])
    useEffect(() => {
        if (attempts)
            setLatest(current =>
                current && attempts.some(link => link.id === current.id)
                    ? null
                    : current,
            )
    }, [attempts])
    const records = (attempts || []).map(link =>
        latest?.id === link.id ? latest : link,
    )
    if (latest && !records.some(link => link.id === latest.id))
        records.push(latest)
    const sorted = records.sort((left, right) => right.id - left.id)
    const outstanding = records.some(blocksInvoicePayments)
    const historyUnavailable =
        access.canViewPaymentLinks && (!attempts || Boolean(historyError))
    const locked = disabled || Boolean(busy)
    const canCreate =
        access.canCreatePaymentLink &&
        canSettleInvoice(invoice) &&
        !outstanding &&
        !historyUnavailable &&
        !historyBusy &&
        keyReady
    const lastPage = Math.max(1, Math.ceil(sorted.length / 5))
    const currentPage = Math.min(page, lastPage)

    const perform = async (action: string, call: () => Promise<void>) => {
        if (saving.current || disabled) return
        saving.current = true
        setBusy(action)
        setMessage('')
        setNotice('')
        try {
            await call()
        } catch (error) {
            if (mounted.current) setMessage(failureMessage(error))
        } finally {
            saving.current = false
            if (mounted.current) {
                setBusy('')
            }
        }
    }
    const accept = (link: PaymentLink) => {
        if (link.invoice_id !== invoice.id)
            throw new Error('Payment link is unavailable for this invoice.')
        if (!mounted.current) return
        setLatest(link)
        onChanged()
    }
    const create = () => {
        if (!access.canCreatePaymentLink || (!requestKey && !canCreate)) return
        void perform('Creating checkout...', async () => {
            const key = requestKey || newPaymentLinkKey()
            // Persist before dispatch. An ambiguous response must reuse this key.
            rememberKey(key)
            try {
                const link = await createPaymentLink(
                    invoice.id,
                    { idempotency_key: key },
                    { tenantId: currentTenant.id },
                )
                if (!mounted.current) return
                accept(link)
                if (!['creating', 'unknown'].includes(link.status))
                    rememberKey(null)
                setPage(1)
                setNotice(
                    `Checkout request saved: ${
                        paymentLinkLabels[link.status]
                    }.`,
                )
            } catch (error) {
                if (mounted.current) {
                    const failure = normalizeAxiosError(error)
                    // These rejections occur before a checkout reservation.
                    // Provider/transport failures retain the original key.
                    if (
                        failure.code === 'PAYMENT_PROVIDER_NOT_CONFIGURED' ||
                        [401, 403, 404, 422].includes(failure.statusCode)
                    )
                        rememberKey(null)
                    onChanged()
                }
                throw error
            }
        })
    }
    const refresh = (link: PaymentLink) => {
        if (!access.canRefreshPaymentLink) return
        void perform(`Refreshing checkout #${link.id}...`, async () => {
            const saved = await refreshPaymentLink(link.id, {
                tenantId: currentTenant.id,
            })
            if (!mounted.current) return
            accept(saved)
            setNotice(
                'Payment status refreshed. Invoice balance and settled payments are being reloaded.',
            )
        })
    }
    const cancel = () => {
        if (!cancelTarget || !access.canCancelPaymentLink) return
        const target = cancelTarget
        setCancelTarget(null)
        void perform(`Cancelling checkout #${target.id}...`, async () => {
            const saved = await cancelPaymentLink(target.id, {
                tenantId: currentTenant.id,
            })
            if (!mounted.current) return
            accept(saved)
            setNotice(`Provider confirmed: ${paymentLinkLabels[saved.status]}.`)
        })
    }
    const shareLink = (
        link: PaymentLink,
        action: 'copy' | 'open' | 'resend',
    ) => {
        if (!access.canViewPaymentLinks || saving.current || disabled) return
        // Open synchronously to avoid browser popup blocking, then navigate only
        // after a fresh stored-state read. Returning from checkout never settles.
        const popup =
            action === 'open' ? window.open('about:blank', '_blank') : null
        if (popup) popup.opener = null
        void perform('Checking stored checkout...', async () => {
            try {
                const saved = await getPaymentLink(link.id, {
                    tenantId: currentTenant.id,
                })
                if (!mounted.current) {
                    popup?.close()
                    return
                }
                if (saved.invoice_id !== invoice.id)
                    throw new CheckoutActionError(
                        'Payment link is unavailable.',
                    )
                setLatest(saved)
                // Replace the cached version before reloading it below.
                const url = activeCheckoutUrl(saved)
                if (!url) {
                    onChanged()
                    throw new CheckoutActionError(
                        'This checkout is no longer available. Refresh payment status.',
                    )
                }
                if (action === 'copy') {
                    if (!navigator.clipboard?.writeText)
                        throw new CheckoutActionError(
                            'Clipboard access is unavailable. Select and copy the checkout URL below.',
                        )
                    try {
                        await navigator.clipboard.writeText(url)
                    } catch {
                        throw new CheckoutActionError(
                            'Unable to copy the link. Select and copy the checkout URL below.',
                        )
                    }
                    if (mounted.current) setNotice('Payment link copied.')
                } else if (action === 'open') {
                    if (!popup)
                        throw new CheckoutActionError(
                            'Allow popups to open the hosted checkout, or copy the link.',
                        )
                    popup.location.replace(url)
                    setNotice(
                        'Hosted checkout opened. Refresh payment status after payment; returning here does not confirm payment.',
                    )
                } else {
                    setEmailDraft(
                        `mailto:?subject=${encodeURIComponent(
                            'Payment link',
                        )}&body=${encodeURIComponent(
                            `Please use this secure hosted checkout to make your payment:\n\n${url}`,
                        )}`,
                    )
                    setResendTarget(saved)
                }
            } catch (error) {
                popup?.close()
                throw error
            }
        })
    }

    if (!access.canViewPaymentLinks && !access.canCreatePaymentLink) return null
    return (
        <section
            aria-label="Online payments"
            aria-busy={Boolean(busy)}
            className="space-y-4 border-t border-clinic-line pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-extrabold">Online payments</h3>
                {access.canCreatePaymentLink && (
                    <button
                        type="button"
                        className={primary}
                        disabled={
                            locked || (!requestKey && !canCreate) || !keyReady
                        }
                        onClick={create}>
                        {requestKey
                            ? 'Retry same checkout request'
                            : 'Generate payment link'}
                    </button>
                )}
            </div>
            <p className="text-sm text-clinic-muted">
                Hosted checkout collects the remaining invoice balance. Card
                details are entered on the provider’s page. Only a verified
                payment updates the invoice.
            </p>
            {!canSettleInvoice(invoice) && (
                <p className="text-sm">
                    Payment links require an issued invoice with an outstanding
                    balance.
                </p>
            )}
            {outstanding && canSettleInvoice(invoice) && (
                <p className="rounded-md bg-clinic-amber p-3 text-sm">
                    An existing checkout must be resolved before generating
                    another link, recording a new manual payment or voiding this
                    invoice. Refresh its status; a displayed expiry time alone
                    does not disable checkout.
                </p>
            )}
            {requestKey && (
                <p className="rounded-md bg-clinic-amber p-3 text-sm">
                    A creation request is awaiting confirmation. Inspect history
                    and retry the same request to recover its original attempt.
                    Keep this request until the provider outcome is established.
                </p>
            )}
            <BillingFeedback message={message} />
            {busy && (
                <p role="status" className="text-sm">
                    {busy}
                </p>
            )}
            {notice && (
                <p
                    role="status"
                    className="rounded-md bg-clinic-mint p-3 text-sm text-emerald-800">
                    {notice}
                </p>
            )}
            {access.canViewPaymentLinks ? (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h4 className="text-sm font-bold">Checkout attempts</h4>
                        <button
                            type="button"
                            className={button}
                            disabled={locked || historyBusy}
                            onClick={() =>
                                void perform(
                                    'Reloading checkout history...',
                                    async () => {
                                        await onReload()
                                    },
                                )
                            }>
                            Reload link history
                        </button>
                    </div>
                    {historyError ? (
                        <BillingFeedback message="Unable to load checkout history. Reload it before starting another payment." />
                    ) : !attempts ? (
                        <p role="status" className="text-sm">
                            Loading checkout history...
                        </p>
                    ) : !sorted.length ? (
                        <p className="text-sm text-clinic-muted">
                            No payment links created.
                        </p>
                    ) : null}
                    <ul className="space-y-3">
                        {sorted
                            .slice((currentPage - 1) * 5, currentPage * 5)
                            .map(original => {
                                const link =
                                    latest?.id === original.id
                                        ? latest
                                        : original
                                const url = activeCheckoutUrl(link)
                                const settled =
                                    link.status === 'completed' &&
                                    invoice.status === 'paid'
                                const terminal = [
                                    'expired',
                                    'cancelled',
                                    'failed',
                                ].includes(link.status)
                                return (
                                    <li
                                        key={link.id}
                                        aria-label={`Checkout attempt ${link.id}`}
                                        className="space-y-3 rounded-md border border-clinic-line p-4 text-sm">
                                        <div className="flex flex-wrap justify-between gap-2">
                                            <strong>
                                                {displayMoney(
                                                    link.amount,
                                                    link.currency,
                                                )}
                                            </strong>
                                            <span
                                                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                                    settled
                                                        ? 'bg-clinic-mint text-emerald-800'
                                                        : terminal
                                                        ? 'bg-clinic-rose text-rose-800'
                                                        : 'bg-clinic-sky text-clinic-blue'
                                                }`}>
                                                {settled
                                                    ? 'Paid'
                                                    : paymentLinkLabels[
                                                          link.status
                                                      ] ||
                                                      'Unrecognized status'}
                                            </span>
                                        </div>
                                        <p className="text-clinic-muted">
                                            Attempt #{link.id} · {link.provider}{' '}
                                            · Created{' '}
                                            {new Date(
                                                link.created_at,
                                            ).toLocaleString()}
                                        </p>
                                        {link.expires_at && (
                                            <p>
                                                Provider expiry:{' '}
                                                {new Date(
                                                    link.expires_at,
                                                ).toLocaleString()}
                                                . Refresh to confirm.
                                            </p>
                                        )}
                                        {link.status === 'completed' &&
                                            !settled && (
                                                <p>
                                                    Checkout completed. Verify
                                                    settlement by refreshing
                                                    payment status and checking
                                                    settled payments below.
                                                </p>
                                            )}
                                        {link.status === 'pending' && (
                                            <p>
                                                Payment is pending. No
                                                settlement is confirmed by this
                                                state.
                                            </p>
                                        )}
                                        {link.status === 'unknown' && (
                                            <p>
                                                Operator reconciliation is
                                                required if provider refresh
                                                cannot establish the checkout
                                                outcome.
                                            </p>
                                        )}
                                        {url && (
                                            <label className="block text-xs font-bold">
                                                Checkout URL
                                                <input
                                                    aria-label={`Checkout URL for attempt ${link.id}`}
                                                    readOnly
                                                    value={url}
                                                    className="mt-1 block w-full rounded-md border-clinic-line text-sm"
                                                    onFocus={event =>
                                                        event.currentTarget.select()
                                                    }
                                                />
                                            </label>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            {url && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={button}
                                                        disabled={locked}
                                                        onClick={() =>
                                                            shareLink(
                                                                link,
                                                                'copy',
                                                            )
                                                        }>
                                                        Copy link
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={button}
                                                        disabled={locked}
                                                        onClick={() =>
                                                            shareLink(
                                                                link,
                                                                'open',
                                                            )
                                                        }>
                                                        Open checkout
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={button}
                                                        disabled={locked}
                                                        onClick={() =>
                                                            shareLink(
                                                                link,
                                                                'resend',
                                                            )
                                                        }>
                                                        Resend link
                                                    </button>
                                                </>
                                            )}
                                            {access.canRefreshPaymentLink && (
                                                <button
                                                    type="button"
                                                    className={button}
                                                    disabled={locked}
                                                    onClick={() =>
                                                        refresh(link)
                                                    }>
                                                    Refresh payment status
                                                </button>
                                            )}
                                            {access.canCancelPaymentLink &&
                                                !terminal &&
                                                link.status !== 'completed' && (
                                                    <button
                                                        type="button"
                                                        className={`${button} text-rose-700`}
                                                        disabled={locked}
                                                        onClick={() =>
                                                            setCancelTarget(
                                                                link,
                                                            )
                                                        }>
                                                        Cancel link
                                                    </button>
                                                )}
                                        </div>
                                    </li>
                                )
                            })}
                    </ul>
                    {lastPage > 1 && (
                        <nav
                            aria-label="Payment link pagination"
                            className="flex flex-wrap items-center justify-end gap-3 text-sm">
                            <button
                                type="button"
                                className={button}
                                disabled={locked || currentPage <= 1}
                                onClick={() => setPage(currentPage - 1)}>
                                Previous links
                            </button>
                            <span>
                                Page {currentPage} of {lastPage}
                            </span>
                            <button
                                type="button"
                                className={button}
                                disabled={locked || currentPage >= lastPage}
                                onClick={() => setPage(currentPage + 1)}>
                                Next links
                            </button>
                        </nav>
                    )}
                </>
            ) : (
                <p className="text-sm text-clinic-muted">
                    Checkout history and sharing require payment-link read
                    access. The server checks existing attempts before creation.
                </p>
            )}
            {cancelTarget && (
                <AppointmentDialog
                    title="Cancel payment link?"
                    onClose={() => setCancelTarget(null)}
                    closeLabel="Close link cancellation">
                    <div className="space-y-4 p-6">
                        <p className="text-sm">
                            Request cancellation of checkout #{cancelTarget.id}?
                            It remains payable until the provider confirms
                            cancellation. HandyPay currently does not support
                            cancellation through this action.
                        </p>
                        <button
                            type="button"
                            className={button}
                            onClick={() => setCancelTarget(null)}>
                            Keep link
                        </button>{' '}
                        <button
                            type="button"
                            className={primary}
                            disabled={locked}
                            onClick={cancel}>
                            Confirm cancellation
                        </button>
                    </div>
                </AppointmentDialog>
            )}
            {resendTarget && emailDraft && (
                <AppointmentDialog
                    title="Resend payment link"
                    onClose={() => setResendTarget(null)}
                    closeLabel="Close resend payment link">
                    <div className="space-y-4 p-6 text-sm">
                        <p>
                            Open an email draft containing this existing
                            checkout link, then choose the recipient and send it
                            in your email app. No message has been sent.
                        </p>
                        <a
                            href={emailDraft}
                            className={primary}
                            onClick={() => setResendTarget(null)}>
                            Open email draft
                        </a>
                    </div>
                </AppointmentDialog>
            )}
        </section>
    )
}
