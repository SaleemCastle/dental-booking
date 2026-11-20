import React, { useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../../context/AuthSessionContext'
import { getMessagingPermissions } from '../../lib/permissions'
import { apiClient, normalizeAxiosError } from '../../lib/api'
import { AuthUser } from '../../lib/auth-session'
import {
    ConversationThread,
    createConversation,
} from '../../services/messaging'
import AppointmentDialog, {
    appointmentButtonClass as button,
    appointmentInputClass as input,
    appointmentPrimaryClass as primary,
} from '../AppointmentDialog'
import AppointmentPatientSelector from '../AppointmentPatientSelector'

interface Recipient extends AuthUser {
    id: number
    name: string
}
export default function NewConversation({
    onClose,
    onCreated,
}: {
    onClose: () => void
    onCreated: (thread: ConversationThread) => void
}) {
    const { user } = useAuthSession()
    const access = getMessagingPermissions(user)
    const [type, setType] = useState(
        access.internalSend ? 'internal' : 'patient',
    )
    const [subject, setSubject] = useState('')
    const [recipients, setRecipients] = useState<number[]>([])
    const [patient, setPatient] = useState('')
    const [useCase, setUseCase] = useState('care')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const directory = useSWR(
        type === 'internal' && access.internalSend
            ? ['messaging-directory', user]
            : null,
        () => apiClient.getData<{ users: Recipient[] }>('/api/users'),
        { shouldRetryOnError: false },
    )
    // Directory permissions are advisory; thread creation rechecks eligibility.
    const choices = (directory.error ? [] : directory.data?.users ?? []).filter(
        candidate => {
            if (candidate.id === user?.id) return false
            const roleGrants =
                candidate.roles?.flatMap(role =>
                    typeof role === 'object' ? role.permissions ?? [] : [],
                ) ?? []
            const permission = getMessagingPermissions({
                ...candidate,
                current_tenant_id: user?.current_tenant_id,
                permissions: candidate.permissions ?? roleGrants,
            })
            return !permission.admin && permission.internalReceive
        },
    )
    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        try {
            const thread = await createConversation({
                subject: subject.trim(),
                ...(type === 'patient'
                    ? { patient_id: Number(patient), use_case: useCase }
                    : { user_ids: recipients }),
            })
            onCreated(thread)
        } catch (cause) {
            const failure = normalizeAxiosError(cause)
            setError(
                [failure.message, ...Object.values(failure.errors).flat()].join(
                    ' ',
                ),
            )
        } finally {
            setBusy(false)
        }
    }
    return (
        <AppointmentDialog
            title="New conversation"
            onClose={onClose}
            busy={busy}
            closeLabel="Close new conversation">
            <form className="space-y-4 p-6" onSubmit={submit}>
                <p className="text-sm text-clinic-muted">
                    Choose the destination. Creating a conversation does not
                    send a message.
                </p>
                {error && (
                    <p role="alert" className="text-red-700">
                        {error}
                    </p>
                )}
                <label className="block font-bold">
                    Conversation type
                    <select
                        className={input}
                        value={type}
                        disabled={busy}
                        onChange={e => {
                            setType(e.target.value)
                            setError('')
                        }}>
                        {access.internalSend && (
                            <option value="internal">
                                Internal · clinic staff
                            </option>
                        )}
                        {access.patientSend && (
                            <option value="patient">
                                Patient-facing · in-app
                            </option>
                        )}
                    </select>
                </label>
                <label className="block font-bold">
                    Subject
                    <input
                        required
                        maxLength={200}
                        className={input}
                        value={subject}
                        disabled={busy}
                        onChange={e => setSubject(e.target.value)}
                    />
                </label>
                {type === 'patient' && access.patientSend ? (
                    <>
                        <AppointmentPatientSelector
                            value={patient}
                            onChange={setPatient}
                            disabled={busy}
                        />
                        <label className="block font-bold">
                            Purpose
                            <select
                                className={input}
                                value={useCase}
                                disabled={busy}
                                onChange={e => setUseCase(e.target.value)}>
                                <option value="care">
                                    Care · clinical follow-up
                                </option>
                                <option value="billing">
                                    Billing · transactional
                                </option>
                            </select>
                        </label>
                        <p className="text-sm">
                            Patient identity is fixed when the thread opens.
                            Only in-app is supported; messages await future
                            portal access.
                        </p>
                    </>
                ) : (
                    <fieldset disabled={busy}>
                        <legend className="font-bold">
                            Staff recipients (up to 20)
                        </legend>
                        {directory.error ? (
                            <p role="alert">
                                Unable to load eligible staff.{' '}
                                <button
                                    type="button"
                                    className={button}
                                    onClick={() => void directory.mutate()}>
                                    Retry staff
                                </button>
                            </p>
                        ) : !directory.data ? (
                            <p role="status">Loading eligible staff…</p>
                        ) : (
                            <>
                                {!choices.length && (
                                    <p role="status">
                                        No eligible staff in the returned
                                        directory. Exact internal receive grants
                                        and current clinic roles are required.
                                    </p>
                                )}
                                <div className="max-h-56 space-y-2 overflow-y-auto">
                                    {choices.map(candidate => (
                                        <label
                                            key={candidate.id}
                                            className="flex items-center gap-3 p-2">
                                            <input
                                                type="checkbox"
                                                checked={recipients.includes(
                                                    candidate.id,
                                                )}
                                                disabled={
                                                    busy ||
                                                    (!recipients.includes(
                                                        candidate.id,
                                                    ) &&
                                                        recipients.length >= 20)
                                                }
                                                onChange={e =>
                                                    setRecipients(previous =>
                                                        e.target.checked
                                                            ? [
                                                                  ...previous,
                                                                  candidate.id,
                                                              ]
                                                            : previous.filter(
                                                                  id =>
                                                                      id !==
                                                                      candidate.id,
                                                              ),
                                                    )
                                                }
                                            />
                                            {candidate.name} · Staff #
                                            {candidate.id}
                                        </label>
                                    ))}
                                </div>
                            </>
                        )}
                        <p className="mt-2 text-xs text-clinic-muted">
                            Staff-to-admin messages are unavailable. The server
                            validates every participant.
                        </p>
                    </fieldset>
                )}
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className={primary}
                        disabled={
                            busy ||
                            !subject.trim() ||
                            (type === 'patient'
                                ? !access.patientSend || !patient
                                : !access.internalSend ||
                                  !recipients.length ||
                                  Boolean(directory.error))
                        }>
                        {busy ? 'Opening…' : 'Open conversation'}
                    </button>
                </div>
            </form>
        </AppointmentDialog>
    )
}
