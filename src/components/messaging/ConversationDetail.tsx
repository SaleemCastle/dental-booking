import React, { RefObject, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../../context/AuthSessionContext'
import {
    getMessagingPermissions,
    getUserPermissionSet,
} from '../../lib/permissions'
import { normalizeAxiosError } from '../../lib/api'
import {
    ConsentDecision,
    MessageConfirmation,
    MessagePayload,
    consentScope,
    deliveryLabel,
    getConversation,
    getConversationMessages,
    getCurrentConsent,
    getMessagingStaff,
    isMessagingSessionCurrent,
    resolveStaffParticipants,
    participantName,
    patientIdForThread,
    prepareMessage,
    sendConversationMessage,
} from '../../services/messaging'
import { getPatient } from '../../services/patients'
import MessageBubble from './MessageBubble'
import UserAvatar from '../UserAvatar'
import { getUserAvatarUrl } from '../../lib/user-avatar'
import { FiArrowLeft, FiRefreshCw, FiSend } from 'react-icons/fi'
import AppointmentDialog, {
    appointmentButtonClass as button,
    appointmentInputClass as input,
    appointmentPrimaryClass as primary,
} from '../AppointmentDialog'

type Review = {
    payload: MessagePayload
    confirmation: MessageConfirmation
    consent?: ConsentDecision
}
const timestamp = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? 'Timestamp unavailable'
        : date.toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
}

export default function ConversationDetail({
    id,
    onBack,
    onRead,
    onSent,
    headingRef,
}: {
    id: number
    onBack: () => void
    onRead: () => void
    onSent: () => void
    headingRef: RefObject<HTMLHeadingElement>
}) {
    const { user, status, refreshSession } = useAuthSession()
    const access = getMessagingPermissions(user)
    const enabled =
        status === 'authenticated' &&
        (access.internalSend || access.internalReceive || access.patientSend)
    const thread = useSWR(
        enabled ? ['conversation', user, id] : null,
        () => getConversation(id),
        { shouldRetryOnError: false },
    )
    const [page, setPage] = useState(1)
    const [body, setBody] = useState('')
    const [operation, setOperation] = useState<MessagePayload | null>(null)
    const [review, setReview] = useState<Review | null>(null)
    const [confirmed, setConfirmed] = useState(false)
    const [acknowledged, setAcknowledged] = useState(false)
    const [busy, setBusy] = useState(false)
    const lock = useRef(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [sessionChanged, setSessionChanged] = useState(false)
    const [now, setNow] = useState(Date.now())
    const onReadRef = useRef(onRead)
    onReadRef.current = onRead
    let patientId: number | null = null
    let contextError = ''
    try {
        if (thread.data) patientId = patientIdForThread(thread.data)
    } catch (cause) {
        contextError = (cause as Error).message
    }
    const patient = Boolean(patientId)
    const canRead =
        enabled &&
        !contextError &&
        Boolean(thread.data) &&
        !thread.error &&
        (patient
            ? access.patientSend
            : access.internalReceive || access.internalSend)
    const messages = useSWR(
        canRead ? ['conversation-messages', user, id, page] : null,
        () => getConversationMessages(id, page),
        { shouldRetryOnError: false },
    )
    const staff = useSWR(
        canRead ? ['messaging-staff-identities', user] : null,
        getMessagingStaff,
        { shouldRetryOnError: false },
    )
    const consent = useSWR(
        canRead && patientId && access.consentManage
            ? ['conversation-consent', user, patientId, thread.data?.use_case]
            : null,
        () => getCurrentConsent(patientId!, thread.data!.use_case),
        { shouldRetryOnError: false },
    )
    const patientDetail = useSWR(
        canRead && patientId && getUserPermissionSet(user).has('patients.view')
            ? ['conversation-patient', user, patientId]
            : null,
        () => getPatient(patientId!),
        { shouldRetryOnError: false },
    )
    useEffect(() => {
        if (canRead && messages.data && !messages.error) onReadRef.current()
    }, [canRead, messages.data, messages.error])
    useEffect(() => {
        if (!review) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [review])
    const participants = resolveStaffParticipants(
        thread.data?.participants ?? [],
        staff.error ? [] : staff.data ?? [],
    )
    const patientParticipant = participants.find(
        p => p.patient_id === patientId,
    )
    const patientName =
        patientDetail.data && !patientDetail.error
            ? `${patientDetail.data.firstName} ${patientDetail.data.lastName}`
            : patientParticipant
            ? participantName(patientParticipant)
            : `Patient #${patientId}`
    const destination = patient
        ? `${patientName} · Patient #${patientId}`
        : participants
              .filter(p => p.user_id !== user?.id)
              .map(participantName)
              .join(', ')
    // Invited staff cannot reply to an administrator, even when send is granted.
    const containsAdmin = participants.some(p =>
        p.user?.roles?.some(role => role.slug === 'admin'),
    )
    const canSend =
        canRead &&
        !sessionChanged &&
        (patient
            ? access.patientSend
            : access.internalSend && (access.admin || !containsAdmin)) &&
        Boolean(participants.length && destination)
    const consentBlocked =
        patient &&
        access.consentManage &&
        (!consent.data ||
            consent.data.allowed !== true ||
            Boolean(consent.error))
    const expired = Boolean(
        review &&
            (!Number.isFinite(Date.parse(review.confirmation.expires_at)) ||
                now >= Date.parse(review.confirmation.expires_at)),
    )
    const refresh = () => {
        void thread.mutate()
        void messages.mutate()
        if (patientId && access.consentManage) void consent.mutate()
        if (patientId && getUserPermissionSet(user).has('patients.view'))
            void patientDetail.mutate()
    }
    const report = (cause: unknown) => {
        const failure = normalizeAxiosError(cause)
        setError(
            failure.code === 'COMMUNICATION_CONSENT_BLOCKED'
                ? 'Send blocked: current patient consent is missing, declined, withdrawn or revoked. Review the consent ledger before trying again.'
                : [
                      failure.message,
                      ...Object.values(failure.errors).flat(),
                  ].join(' '),
        )
        if (failure.statusCode === 403 || failure.statusCode === 404) refresh()
    }
    const send = async (
        payload: MessagePayload,
        confirmation?: MessageConfirmation,
    ) => {
        if (lock.current || !canSend || consentBlocked) return
        setOperation(payload)
        lock.current = true
        setBusy(true)
        setError('')
        setNotice('')
        try {
            if (!(await isMessagingSessionCurrent(user!))) {
                setSessionChanged(true)
                throw new Error(
                    'Your signed-in account or clinic changed. This message was not sent. Reload the clinic session before continuing. Use separate browser profiles to test two accounts.',
                )
            }
            const result = await sendConversationMessage(
                id,
                payload,
                confirmation,
            )
            setBody('')
            setOperation(null)
            setReview(null)
            setNotice(
                `Message recorded. ${deliveryLabel(result.delivery_state)}.`,
            )
            // Reload the current history page; never append a duplicate retry.
            void messages.mutate().catch(() => undefined)
            onSent()
        } catch (cause) {
            setReview(null)
            const failure = normalizeAxiosError(cause)
            if ([403, 404, 422].includes(failure.statusCode)) setOperation(null)
            report(cause)
        } finally {
            lock.current = false
            setBusy(false)
        }
    }
    const prepare = async (event: React.FormEvent) => {
        event.preventDefault()
        if (lock.current || !canSend || consentBlocked || !body.trim()) return
        const payload = operation ?? {
            body: body.trim(),
            idempotency_key: crypto.randomUUID(),
        }
        if (!patient) {
            await send(payload)
            return
        }
        lock.current = true
        setBusy(true)
        setError('')
        setNotice('')
        try {
            // Fresh lookup is additional UI protection; the server still resolves
            // consent atomically at send time. No grant is inferred here.
            const decision = access.consentManage
                ? await getCurrentConsent(patientId!, thread.data!.use_case)
                : undefined
            if (decision && decision.allowed !== true) {
                await consent.mutate(decision, false)
                throw new Error(
                    `Send blocked: ${
                        decision.reason || 'patient consent is not granted'
                    }.`,
                )
            }
            const confirmation = await prepareMessage(id, payload)
            if (
                confirmation.patient?.id !== patientId ||
                confirmation.body !== payload.body ||
                confirmation.use_case !== thread.data?.use_case ||
                !confirmation.confirmation_token ||
                !Number.isFinite(Date.parse(confirmation.expires_at))
            )
                throw new Error(
                    'Confirmation does not match this patient, purpose or message. Reload the thread before sending.',
                )
            setConfirmed(false)
            setAcknowledged(false)
            setNow(Date.now())
            setReview({ payload, confirmation, consent: decision })
        } catch (cause) {
            report(cause)
        } finally {
            lock.current = false
            setBusy(false)
        }
    }
    if (!canRead)
        return (
            <div className="space-y-3">
                <button className={button} onClick={onBack}>
                    Back to inbox
                </button>
                {thread.error || contextError ? (
                    <p role="alert">
                        {contextError ||
                            normalizeAxiosError(thread.error).message}
                    </p>
                ) : !thread.data ? (
                    <p role="status">Loading conversation…</p>
                ) : (
                    <p role="alert">
                        This conversation is unavailable for your current
                        permissions.
                    </p>
                )}
                <button className={button} onClick={refresh}>
                    Reload conversation
                </button>
            </div>
        )
    const scope =
        patient && thread.data?.use_case
            ? (() => {
                  try {
                      return consentScope(thread.data.use_case)
                  } catch {
                      return null
                  }
              })()
            : null
    return (
        <article className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <button
                    className={`${button} inline-flex items-center gap-2 !rounded-full`}
                    disabled={busy}
                    onClick={onBack}>
                    <FiArrowLeft aria-hidden="true" />
                    Back to inbox
                </button>
                <button
                    className={`${button} inline-flex items-center gap-2 !rounded-full`}
                    disabled={busy}
                    onClick={refresh}>
                    <FiRefreshCw aria-hidden="true" />
                    Refresh conversation
                </button>
            </div>
            <header
                className={`rounded-2xl border p-4 ${
                    patient
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-clinic-line bg-white'
                }`}>
                <p
                    className={`mb-2 inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                        patient
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-clinic-sky text-clinic-blue'
                    }`}>
                    {patient
                        ? 'Patient-facing conversation'
                        : 'Internal clinic conversation'}
                </p>
                <h2
                    ref={headingRef}
                    tabIndex={-1}
                    className="mt-1 break-words text-xl font-extrabold">
                    {thread.data?.subject}
                </h2>
                <p className="mt-2 break-words text-sm">
                    <strong>Recipient:</strong>{' '}
                    {destination || 'Participant context unavailable'}
                </p>
                <p className="text-sm">
                    <strong>Channel:</strong> In-app
                    {patient &&
                        ` · Purpose: ${thread.data?.use_case ?? 'unknown'}`}
                </p>
                {patient && (
                    <p className="mt-2 text-sm">
                        Patient identity is fixed for this thread. Messages are
                        recorded for future patient portal access; no delivery
                        or read receipt is available.
                    </p>
                )}
                <div
                    className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2"
                    aria-label="Conversation participants">
                    {participants.map(participant => (
                        <span
                            key={participant.id}
                            className="inline-flex min-w-0 items-center gap-2 text-xs text-clinic-muted">
                            <UserAvatar
                                name={participantName(participant)}
                                photoUrl={
                                    getUserAvatarUrl(participant.user) ??
                                    (participant.user_id === user?.id
                                        ? getUserAvatarUrl(user)
                                        : undefined)
                                }
                                size="small"
                            />
                            <span className="break-words">
                                {participantName(participant)}
                            </span>
                        </span>
                    ))}
                </div>
            </header>
            {patient && (
                <div
                    className="rounded-md border border-clinic-line p-3 text-sm"
                    aria-label="Patient consent">
                    <strong>
                        Consent ·{' '}
                        {scope
                            ? `${scope.purpose} / ${scope.scope} / in_app`
                            : 'Unsupported purpose'}
                    </strong>
                    {access.consentManage ? (
                        consent.error ? (
                            <p role="alert">
                                Consent could not be reviewed. Sending is
                                blocked.{' '}
                                <button
                                    className={button}
                                    onClick={() => void consent.mutate()}>
                                    Retry consent
                                </button>
                            </p>
                        ) : !consent.data ? (
                            <p role="status">Checking current consent…</p>
                        ) : (
                            <p role="status">
                                {consent.data.allowed
                                    ? 'Granted'
                                    : `Blocked: ${consent.data.reason}`}{' '}
                                · {consent.data.status ?? 'No recorded choice'}
                                {consent.data.version
                                    ? ` · Ledger version ${consent.data.version}`
                                    : ''}
                                {consent.data.text_version
                                    ? ` · Policy ${consent.data.text_version}`
                                    : ''}
                            </p>
                        )
                    ) : (
                        <p>
                            Consent details require
                            messaging.preferences.manage. Your confirmation does
                            not grant patient consent. The server checks the
                            current ledger at send time and blocks any missing
                            or withdrawn grant.
                        </p>
                    )}
                </div>
            )}
            <section
                className="max-h-[55vh] min-h-[260px] overflow-y-auto overscroll-contain rounded-2xl bg-clinic-canvas p-3 sm:p-4"
                aria-label="Conversation history"
                tabIndex={0}
                aria-busy={!messages.data || messages.isValidating}>
                <h3 className="sr-only">
                    Conversation history{' '}
                    <span className="text-xs font-normal text-clinic-muted">
                        · Oldest first · Times in your local timezone
                    </span>
                </h3>
                {messages.error ? (
                    <p role="alert">
                        {normalizeAxiosError(messages.error).message}{' '}
                        <button
                            className={button}
                            onClick={() => void messages.mutate()}>
                            Retry history
                        </button>
                    </p>
                ) : !messages.data ? (
                    <p role="status">Loading history…</p>
                ) : (
                    <>
                        {!messages.data.messages.length && (
                            <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                                <span className="mb-3 rounded-full bg-white p-4 text-clinic-blue">
                                    <FiSend
                                        aria-hidden="true"
                                        className="h-5 w-5"
                                    />
                                </span>
                                <p className="font-bold text-clinic-ink">
                                    No messages yet.
                                </p>
                                <p className="mt-1 max-w-xs text-sm text-clinic-muted">
                                    Start the conversation below. Your
                                    recipients and channel are shown before
                                    sending.
                                </p>
                            </div>
                        )}
                        <ol className="space-y-5 px-1 py-5 sm:px-2">
                            {messages.data.messages.map(
                                (message, index, history) => {
                                    const date = new Date(message.created_at)
                                    const dateLabel = Number.isNaN(
                                        date.getTime(),
                                    )
                                        ? 'Date unavailable'
                                        : date.toLocaleDateString(undefined, {
                                              month: 'long',
                                              day: 'numeric',
                                              year: 'numeric',
                                          })
                                    const previousDate = index
                                        ? new Date(
                                              history[index - 1].created_at,
                                          ).toDateString()
                                        : null
                                    return (
                                        <React.Fragment key={message.id}>
                                            {(!index ||
                                                previousDate !==
                                                    date.toDateString()) && (
                                                <li
                                                    role="presentation"
                                                    className="flex justify-center py-2">
                                                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-clinic-muted shadow-sm">
                                                        {dateLabel}
                                                    </span>
                                                </li>
                                            )}
                                            <MessageBubble
                                                message={message}
                                                participants={participants}
                                                user={user}
                                            />
                                        </React.Fragment>
                                    )
                                },
                            )}
                        </ol>
                        {(messages.data.meta.lastPage ?? 1) > 1 && (
                            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-clinic-line pt-3">
                                <button
                                    className={button}
                                    disabled={page <= 1 || busy}
                                    onClick={() => setPage(value => value - 1)}>
                                    Earlier messages
                                </button>
                                <span className="text-sm">
                                    Page {page} of {messages.data.meta.lastPage}
                                </span>
                                <button
                                    className={button}
                                    disabled={
                                        page >=
                                            (messages.data.meta.lastPage ??
                                                1) || busy
                                    }
                                    onClick={() => setPage(value => value + 1)}>
                                    Later messages
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>
            {notice && (
                <p role="status" className="rounded-md bg-green-50 p-3 text-sm">
                    {notice}
                </p>
            )}
            {error && (
                <p
                    role="alert"
                    className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                    {error}
                </p>
            )}
            {sessionChanged && (
                <button
                    className={button}
                    onClick={() => void refreshSession()}>
                    Reload clinic session
                </button>
            )}
            {canSend ? (
                <form
                    onSubmit={prepare}
                    className="space-y-3 rounded-2xl border border-clinic-line bg-white p-3 shadow-sm sm:p-4">
                    <p className="break-words text-xs text-clinic-muted">
                        <strong>
                            {patient
                                ? 'Patient recipient'
                                : 'Internal recipients'}
                            :
                        </strong>{' '}
                        {destination}
                        <br />
                        <strong>Channel:</strong> In-app
                    </p>
                    <label className="block text-sm font-bold">
                        Message
                        <textarea
                            rows={3}
                            placeholder={
                                patient
                                    ? 'Write a patient message…'
                                    : 'Write a message to your team…'
                            }
                            className={`${input} !rounded-xl !border-0 !bg-clinic-canvas !shadow-none`}
                            value={body}
                            disabled={busy || Boolean(operation)}
                            required
                            onChange={e => setBody(e.target.value)}
                        />
                    </label>
                    {operation && !busy && (
                        <p className="text-sm text-clinic-muted">
                            This exact message and send key are retained until
                            its outcome is known. Retry safely without creating
                            a duplicate. To change the message, first refresh
                            history and resolve this attempt.
                        </p>
                    )}
                    <button
                        className={`${primary} ml-auto flex items-center gap-2 !rounded-full`}
                        disabled={
                            busy ||
                            !body.trim() ||
                            consentBlocked ||
                            Boolean(messages.error) ||
                            !messages.data ||
                            (patient && !scope)
                        }>
                        <FiSend aria-hidden="true" />
                        {busy
                            ? 'Processing…'
                            : operation
                            ? patient
                                ? 'Review retry'
                                : 'Retry same message'
                            : patient
                            ? 'Review patient message'
                            : 'Send internal message'}
                    </button>
                </form>
            ) : (
                <p className="text-sm text-clinic-muted">
                    Read only. Sending requires the appropriate exact grant and
                    an eligible conversation direction. Staff cannot reply to
                    administrator broadcasts.
                </p>
            )}
            {review && (
                <AppointmentDialog
                    title="Confirm patient-facing send"
                    onClose={() => setReview(null)}
                    busy={busy}
                    closeLabel="Close send confirmation">
                    <div className="space-y-4 p-6">
                        <p className="break-words">
                            <strong>Recipient:</strong> {destination}
                        </p>
                        <p>
                            <strong>Channel:</strong> In-app ·{' '}
                            {thread.data?.use_case}
                        </p>
                        <p>
                            <strong>Consent state:</strong>{' '}
                            {review.consent
                                ? `Granted · ledger version ${
                                      review.consent.version ?? 'unknown'
                                  } · ${
                                      review.consent.text_version ??
                                      'policy version unavailable'
                                  }`
                                : 'Not available for your review permission; current consent will be enforced by the server.'}
                        </p>
                        <p className="text-sm">
                            Consent is checked again when sending. Staff
                            confirmation cannot replace patient consent.
                        </p>
                        <blockquote className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-clinic-line p-4">
                            {review.payload.body}
                        </blockquote>
                        <p className="text-xs">
                            Confirmation expires{' '}
                            {timestamp(review.confirmation.expires_at)}.
                        </p>
                        {expired && (
                            <p role="alert" className="text-red-700">
                                Confirmation expired. Close this review and
                                prepare a fresh confirmation.
                            </p>
                        )}
                        <label className="flex items-start gap-3 text-sm">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={confirmed}
                                disabled={busy}
                                onChange={e => setConfirmed(e.target.checked)}
                            />
                            I have checked the final patient identity, in-app
                            channel and message and explicitly confirm this
                            send.
                        </label>
                        <label className="flex items-start gap-3 text-sm">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={acknowledged}
                                disabled={busy}
                                onChange={e =>
                                    setAcknowledged(e.target.checked)
                                }
                            />
                            I acknowledge that the patient must have granted
                            consent for this exact purpose and channel.
                        </label>
                        <div className="flex flex-wrap justify-end gap-3">
                            <button
                                className={button}
                                disabled={busy}
                                onClick={() => setReview(null)}>
                                Back to conversation
                            </button>
                            <button
                                className={primary}
                                disabled={
                                    busy ||
                                    expired ||
                                    !confirmed ||
                                    !acknowledged ||
                                    consentBlocked ||
                                    !canSend
                                }
                                onClick={() => {
                                    if (confirmed && acknowledged && !expired)
                                        void send(
                                            review.payload,
                                            review.confirmation,
                                        )
                                }}>
                                Confirm and send to patient
                            </button>
                        </div>
                    </div>
                </AppointmentDialog>
            )}
        </article>
    )
}
