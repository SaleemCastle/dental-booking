import React, { useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { getBillingPermissions } from '../lib/permissions'
import { normalizeAxiosError } from '../lib/api'
import {
    CommunicationHistoryEvent,
    communicationRequest,
    deliveryLabels,
} from '../services/communications'
import { appointmentButtonClass as button } from './AppointmentDialog'

export default function CommunicationHistory({
    invoiceId,
}: {
    invoiceId: number
}) {
    const { user, currentTenant } = useAuthSession()
    const [page, setPage] = useState(1)
    const allowed = getBillingPermissions(user).canViewInvoices
    const { data, error, mutate } = useSWR(
        currentTenant && allowed
            ? [
                  'invoice-communications',
                  currentTenant.id,
                  user,
                  invoiceId,
                  page,
              ]
            : null,
        () =>
            communicationRequest<CommunicationHistoryEvent[]>(
                currentTenant.id,
                'get',
                `/api/invoices/${invoiceId}/communications`,
                undefined,
                { page },
            ),
        { shouldRetryOnError: false },
    )
    if (!allowed) return null
    const meta =
        (data?.meta?.pagination as typeof data.meta | undefined) ?? data?.meta
    const last = Number(meta?.last_page ?? meta?.lastPage ?? 1)
    return (
        <section
            aria-label="Communication delivery history"
            className="space-y-3 border-t border-clinic-line pt-5">
            <h3 className="font-extrabold">Communication delivery history</h3>
            <p className="text-sm text-clinic-muted">
                Sent means the provider accepted the message. Only supported
                providers confirm delivery; email has no inbox confirmation.
            </p>
            <button
                type="button"
                className={button}
                onClick={() => void mutate()}>
                Refresh delivery history
            </button>
            {error ? (
                <p role="alert">{normalizeAxiosError(error).message}</p>
            ) : !data ? (
                <p role="status">Loading communications…</p>
            ) : !Array.isArray(data.data) ? (
                <p role="alert">Communication history could not be read.</p>
            ) : !data.data.length ? (
                <p>No communications recorded for this invoice.</p>
            ) : (
                <ul className="space-y-3">
                    {data.data.map(event => (
                        <li
                            key={event.id}
                            className="rounded-lg border border-clinic-line p-4">
                            <p className="font-semibold">{event.event_type}</p>
                            <p className="text-sm">
                                {event.created_at} ·{' '}
                                {event.trigger ?? 'Recorded event'}
                            </p>
                            {event.selection_outcome && (
                                <p className="text-sm">
                                    Selection: {event.selection_outcome}
                                </p>
                            )}
                            <ul>
                                {event.deliveries?.map(delivery => (
                                    <li
                                        key={delivery.id}
                                        className="mt-2 text-sm">
                                        {delivery.channel.toUpperCase()} ·{' '}
                                        {deliveryLabels[delivery.status] ??
                                            'Unrecognized status'}
                                        {delivery.attempt_count != null &&
                                            ` · ${delivery.attempt_count} attempt(s)`}
                                        {delivery.accepted_at &&
                                            ` · Accepted: ${delivery.accepted_at}`}
                                        {delivery.delivered_at &&
                                            ` · Delivered: ${delivery.delivered_at}`}
                                        {delivery.failure_reason && (
                                            <p>
                                                Reason:{' '}
                                                {delivery.failure_reason}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
            <nav
                aria-label="Communication history pages"
                className="flex items-center gap-3">
                <button
                    className={button}
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}>
                    Previous
                </button>
                <span>Page {page}</span>
                <button
                    className={button}
                    disabled={!data || !!error || page >= last}
                    onClick={() => setPage(page + 1)}>
                    Next
                </button>
            </nav>
            <p className="text-sm text-clinic-muted">
                Resend is unavailable: the notification service has no
                authorized resend endpoint. Investigate unknown outcomes with
                the operator before any new communication.
            </p>
        </section>
    )
}
