import React, { FormEvent, useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { normalizeAxiosError } from '../lib/api'
import {
    communicationEvents,
    CommunicationEvent,
    communicationRequest,
    PatientContact,
} from '../services/communications'
import {
    appointmentButtonClass as button,
    appointmentInputClass as input,
} from './AppointmentDialog'

export default function PatientCommunicationContacts({
    patientId,
    canEdit,
}: {
    patientId: number
    canEdit: boolean
}) {
    const { currentTenant, user } = useAuthSession()
    const [channel, setChannel] = useState<'email' | 'sms'>('email')
    const [role, setRole] = useState<'patient' | 'billing_copy'>('patient')
    const [address, setAddress] = useState('')
    const [events, setEvents] = useState<CommunicationEvent[]>([
        'payment.recorded',
        'payment_link.created',
    ])
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [verification, setVerification] = useState<number | null>(null)
    const [method, setMethod] = useState('in_person')
    const [attested, setAttested] = useState(false)
    const base = `/api/patients/${patientId}/contacts`
    const { data, error, mutate } = useSWR(
        currentTenant
            ? ['communication-contacts', currentTenant.id, user, patientId]
            : null,
        () =>
            communicationRequest<PatientContact[]>(
                currentTenant.id,
                'get',
                base,
            ),
        { shouldRetryOnError: false },
    )
    const act = async (
        method: 'post' | 'delete',
        path: string,
        payload?: unknown,
    ) => {
        if (!canEdit || busy || !currentTenant) return
        setBusy(true)
        setMessage('')
        try {
            await communicationRequest(currentTenant.id, method, path, payload)
            setAddress('')
            setVerification(null)
            setAttested(false)
            setMessage(
                'Contact updated. Existing communication events are not replayed.',
            )
            await mutate()
        } catch (err) {
            setMessage(normalizeAxiosError(err).message)
        } finally {
            setBusy(false)
        }
    }
    const create = (event: FormEvent) => {
        event.preventDefault()
        void act('post', base, {
            channel,
            address: address.trim(),
            role,
            authorized_events: events,
        })
    }
    const contacts = Array.isArray(data?.data) ? data.data : []
    return (
        <section
            aria-label="Billing communication contacts"
            className="space-y-4 rounded-xl border border-clinic-line bg-white p-5">
            <h3 className="font-extrabold">Billing communication contacts</h3>
            <p className="text-sm text-clinic-muted">
                Only verified, authorized contacts can receive enabled clinic
                events. Profile and emergency contact details are never used as
                fallbacks.
            </p>
            {message && <p role="status">{message}</p>}
            {error ? (
                <div role="alert">
                    {normalizeAxiosError(error).message}
                    <button className={button} onClick={() => void mutate()}>
                        Retry contacts
                    </button>
                </div>
            ) : !data ? (
                <p role="status">Loading contacts…</p>
            ) : !Array.isArray(data.data) ? (
                <p role="alert">Contacts could not be read.</p>
            ) : (
                <>
                    {(['email', 'sms'] as const).map(value => (
                        <p key={value} className="text-sm">
                            {value.toUpperCase()}:{' '}
                            {contacts.some(
                                contact =>
                                    contact.channel === value &&
                                    contact.verified_at &&
                                    !contact.revoked_at,
                            )
                                ? 'Verified contact available; event authorization and clinic configuration still apply'
                                : 'No verified active contact'}
                        </p>
                    ))}
                    <ul className="space-y-3">
                        {contacts.map(contact => (
                            <li
                                key={contact.id}
                                className="rounded-lg border border-clinic-line p-3">
                                <p className="break-all font-semibold">
                                    {contact.address}
                                </p>
                                <p className="text-sm">
                                    {contact.channel.toUpperCase()} ·{' '}
                                    {contact.role === 'billing_copy'
                                        ? 'Authorized payer / guardian copy'
                                        : 'Patient'}{' '}
                                    ·{' '}
                                    {contact.revoked_at
                                        ? 'Revoked'
                                        : contact.verified_at
                                        ? 'Verified'
                                        : 'Unverified'}
                                </p>
                                <p className="text-sm">
                                    Authorized events:{' '}
                                    {contact.authorized_events.join(', ')}
                                </p>
                                {canEdit && !contact.revoked_at && (
                                    <div className="mt-2 flex gap-2">
                                        {!contact.verified_at && (
                                            <button
                                                className={button}
                                                disabled={busy}
                                                onClick={() => {
                                                    setVerification(contact.id)
                                                    setAttested(false)
                                                }}>
                                                Verify contact
                                            </button>
                                        )}
                                        <button
                                            className={button}
                                            disabled={busy}
                                            onClick={() =>
                                                void act(
                                                    'delete',
                                                    `${base}/${contact.id}`,
                                                )
                                            }>
                                            Revoke contact
                                        </button>
                                    </div>
                                )}
                                {canEdit && verification === contact.id && (
                                    <div className="mt-3 space-y-3">
                                        <label className="block">
                                            Verification method
                                            <select
                                                className={input}
                                                value={method}
                                                onChange={event =>
                                                    setMethod(
                                                        event.target.value,
                                                    )
                                                }>
                                                <option value="in_person">
                                                    In person
                                                </option>
                                                <option value="verified_callback">
                                                    Verified callback
                                                </option>
                                            </select>
                                        </label>
                                        <label className="block text-sm">
                                            <input
                                                type="checkbox"
                                                checked={attested}
                                                onChange={event =>
                                                    setAttested(
                                                        event.target.checked,
                                                    )
                                                }
                                            />{' '}
                                            I verified control of this address
                                            and the patient’s authorization to
                                            disclose billing details for these
                                            events, including the payer/guardian
                                            relationship when applicable.
                                        </label>
                                        <button
                                            className={button}
                                            disabled={busy || !attested}
                                            onClick={() =>
                                                void act(
                                                    'post',
                                                    `${base}/${contact.id}/verify`,
                                                    {
                                                        verification_method: method,
                                                    },
                                                )
                                            }>
                                            Record staff attestation
                                        </button>
                                        <button
                                            className={button}
                                            onClick={() =>
                                                setVerification(null)
                                            }>
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                    {canEdit && (
                        <form
                            onSubmit={create}
                            className="space-y-3 border-t border-clinic-line pt-4">
                            <h4 className="font-bold">
                                Add unverified contact
                            </h4>
                            <label className="block">
                                Channel
                                <select
                                    className={input}
                                    value={channel}
                                    onChange={event => {
                                        setChannel(
                                            event.target
                                                .value as typeof channel,
                                        )
                                        setAddress('')
                                    }}>
                                    <option value="email">Email</option>
                                    <option value="sms">SMS</option>
                                </select>
                            </label>
                            <label className="block">
                                {channel === 'email'
                                    ? 'Email address'
                                    : 'Phone number (E.164, e.g. +15555550100)'}
                                <input
                                    className={input}
                                    type={channel === 'email' ? 'email' : 'tel'}
                                    required
                                    value={address}
                                    pattern={
                                        channel === 'sms'
                                            ? '\\+[1-9][0-9]{1,14}'
                                            : undefined
                                    }
                                    onChange={event =>
                                        setAddress(event.target.value)
                                    }
                                />
                            </label>
                            <label className="block">
                                Recipient role
                                <select
                                    className={input}
                                    value={role}
                                    onChange={event =>
                                        setRole(
                                            event.target.value as typeof role,
                                        )
                                    }>
                                    <option value="patient">Patient</option>
                                    <option value="billing_copy">
                                        Authorized payer / guardian
                                    </option>
                                </select>
                            </label>
                            <fieldset>
                                <legend>Authorized events</legend>
                                {communicationEvents.map(value => (
                                    <label
                                        key={value}
                                        className="block text-sm">
                                        <input
                                            type="checkbox"
                                            checked={events.includes(value)}
                                            onChange={event =>
                                                setEvents(
                                                    event.target.checked
                                                        ? [...events, value]
                                                        : events.filter(
                                                              item =>
                                                                  item !==
                                                                  value,
                                                          ),
                                                )
                                            }
                                        />{' '}
                                        {value}
                                    </label>
                                ))}
                            </fieldset>
                            <button
                                className={button}
                                disabled={busy || !events.length}>
                                Add contact
                            </button>
                        </form>
                    )}
                </>
            )}
        </section>
    )
}
