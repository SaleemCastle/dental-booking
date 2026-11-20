import React, { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useAuthSession } from '../context/AuthSessionContext'
import { getMessagingPermissions } from '../lib/permissions'
import { normalizeAxiosError } from '../lib/api'
import {
    ConversationThread,
    getConversations,
    threadRevision,
    getMessagingStaff,
    resolveStaffParticipants,
    participantName,
} from '../services/messaging'
import UserAvatar from './UserAvatar'
import { getUserAvatarUrl } from '../lib/user-avatar'
import { FiMessageCircle, FiPlus, FiRefreshCw } from 'react-icons/fi'
import ConversationDetail from './messaging/ConversationDetail'
import NewConversation from './messaging/NewConversation'
import {
    appointmentButtonClass as button,
    appointmentInputClass as input,
    appointmentPrimaryClass as primary,
} from './AppointmentDialog'

export default function MessagingWorkspace() {
    const { user, status } = useAuthSession()
    const access = getMessagingPermissions(user)
    const enabled =
        status === 'authenticated' &&
        (access.internalSend || access.internalReceive || access.patientSend)
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')
    const [page, setPage] = useState(1)
    const [type, setType] = useState('all')
    const [readFilter, setReadFilter] = useState('all')
    const [read, setRead] = useState<Record<number, string>>({})
    const [selected, setSelected] = useState<number | null>(null)
    const [creating, setCreating] = useState(false)
    const heading = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
        const timer = setTimeout(() => {
            setQuery(search.trim())
            setPage(1)
        }, 300)
        return () => clearTimeout(timer)
    }, [search])
    const feed = useSWR(
        enabled ? ['conversations', user, query, page] : null,
        () => getConversations(query, page),
        { shouldRetryOnError: false },
    )
    const staff = useSWR(
        enabled ? ['messaging-staff-identities', user] : null,
        getMessagingStaff,
        { shouldRetryOnError: false },
    )
    const isPatient = (thread: ConversationThread) =>
        Boolean(
            thread.patient_id || thread.participants?.some(p => p.patient_id),
        )
    const visible = (feed.error ? [] : feed.data?.threads ?? []).filter(
        thread => {
            const patient = isPatient(thread)
            const wasRead = read[thread.id] === threadRevision(thread)
            return (
                (!patient || access.patientSend) &&
                (patient || access.internalReceive || access.internalSend) &&
                (type === 'all' || (type === 'patient') === patient) &&
                (readFilter === 'all' || (readFilter === 'read') === wasRead)
            )
        },
    )
    const markRead = (id: number) => {
        const item = feed.data?.threads.find(thread => thread.id === id)
        if (item)
            setRead(previous => ({ ...previous, [id]: threadRevision(item) }))
    }
    if (!enabled)
        return (
            <p className="p-6" role="status">
                Messaging access is not available for your clinic role.
            </p>
        )
    return (
        <section className="space-y-5 p-4 sm:p-6" aria-label="Clinic messaging">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-clinic-ink">
                        Messages
                    </h1>
                    <p className="text-sm text-clinic-muted">
                        Clinic conversations · In-app channel
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        className={`${button} inline-flex items-center gap-2 !rounded-full`}
                        onClick={() => void feed.mutate()}>
                        <FiRefreshCw aria-hidden="true" />
                        Refresh inbox
                    </button>
                    {(access.internalSend || access.patientSend) && (
                        <button
                            className={`${primary} inline-flex items-center gap-2 !rounded-full`}
                            onClick={() => setCreating(true)}>
                            <FiPlus aria-hidden="true" />
                            New conversation
                        </button>
                    )}
                </div>
            </header>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
                <aside
                    className={`rounded-2xl border border-clinic-line bg-white p-4 shadow-sm ${
                        selected ? 'hidden lg:block' : ''
                    }`}
                    aria-label="Staff inbox">
                    <label className="block text-sm font-bold">
                        Search subjects
                        <input
                            type="search"
                            className={input}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </label>
                    <div className="my-3 grid grid-cols-2 gap-2">
                        <label className="text-sm">
                            Conversation type
                            <select
                                className={input}
                                value={type}
                                onChange={e => setType(e.target.value)}>
                                <option value="all">All types</option>
                                <option value="internal">Internal</option>
                                {access.patientSend && (
                                    <option value="patient">
                                        Patient-facing
                                    </option>
                                )}
                            </select>
                        </label>
                        <label className="text-sm">
                            Read state
                            <select
                                className={input}
                                value={readFilter}
                                onChange={e => setReadFilter(e.target.value)}>
                                <option value="all">All states</option>
                                <option value="unread">Unread here</option>
                                <option value="read">Read here</option>
                            </select>
                        </label>
                    </div>
                    <p className="mb-3 text-xs text-clinic-muted">
                        Read state tracks opened conversations in this session
                        only. Filters apply to this page. No patient read
                        receipts.
                    </p>
                    {feed.error ? (
                        <p role="alert">
                            {normalizeAxiosError(feed.error).message}{' '}
                            <button
                                className={button}
                                onClick={() => void feed.mutate()}>
                                Retry inbox
                            </button>
                        </p>
                    ) : !feed.data ? (
                        <p role="status">Loading inbox…</p>
                    ) : (
                        <>
                            {feed.isValidating && (
                                <p role="status">Refreshing…</p>
                            )}
                            {!visible.length && (
                                <p className="py-4" role="status">
                                    No conversations match this page.
                                </p>
                            )}
                            <ul className="space-y-2">
                                {visible.map(thread => {
                                    const participants = resolveStaffParticipants(
                                        thread.participants ?? [],
                                        staff.error ? [] : staff.data ?? [],
                                    )
                                    const recipient = participants.find(
                                        p => p.user_id !== user?.id,
                                    )
                                    const recipientLabel = participants
                                        .filter(p => p.user_id !== user?.id)
                                        .map(participantName)
                                        .join(', ')
                                    return (
                                        <li key={thread.id}>
                                            <button
                                                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-clinic-blue ${
                                                    selected === thread.id
                                                        ? 'border-clinic-blue/20 bg-clinic-sky'
                                                        : 'border-transparent hover:bg-clinic-canvas'
                                                }`}
                                                onClick={() => {
                                                    setSelected(thread.id)
                                                    requestAnimationFrame(() =>
                                                        heading.current?.focus(),
                                                    )
                                                }}
                                                aria-current={
                                                    selected === thread.id
                                                        ? 'true'
                                                        : undefined
                                                }>
                                                <UserAvatar
                                                    name={
                                                        recipient
                                                            ? participantName(
                                                                  recipient,
                                                              )
                                                            : thread.subject
                                                    }
                                                    photoUrl={getUserAvatarUrl(
                                                        recipient?.user,
                                                    )}
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="mb-1 flex items-center justify-between gap-2 text-[9px] font-bold tracking-wide text-clinic-muted">
                                                        {isPatient(thread)
                                                            ? 'PATIENT-FACING'
                                                            : 'INTERNAL'}{' '}
                                                        ·{' '}
                                                        {read[thread.id] ===
                                                        threadRevision(thread)
                                                            ? 'Read here'
                                                            : 'Unread here'}
                                                    </span>
                                                    <span className="block break-words text-sm font-bold text-clinic-ink">
                                                        {thread.subject}
                                                    </span>
                                                    {recipientLabel && (
                                                        <span className="mt-1 block truncate text-xs text-clinic-muted">
                                                            {recipientLabel}
                                                        </span>
                                                    )}
                                                    {thread.patient_id &&
                                                        access.patientSend && (
                                                            <span className="text-xs">
                                                                Patient #
                                                                {
                                                                    thread.patient_id
                                                                }
                                                            </span>
                                                        )}
                                                </span>
                                                {read[thread.id] !==
                                                    threadRevision(thread) && (
                                                    <span
                                                        aria-hidden="true"
                                                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-clinic-blue"
                                                    />
                                                )}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                            <div className="mt-4 flex items-center justify-between gap-2">
                                <button
                                    className={button}
                                    disabled={page <= 1}
                                    onClick={() => setPage(value => value - 1)}>
                                    Previous
                                </button>
                                <span className="text-sm">Page {page}</span>
                                <button
                                    className={button}
                                    disabled={
                                        page >= (feed.data.meta.lastPage ?? 1)
                                    }
                                    onClick={() => setPage(value => value + 1)}>
                                    Next
                                </button>
                            </div>
                        </>
                    )}
                </aside>
                <div
                    className={`min-w-0 rounded-2xl border border-clinic-line bg-white p-4 shadow-sm sm:p-5 ${
                        selected ? '' : 'hidden lg:block'
                    }`}>
                    {selected ? (
                        <ConversationDetail
                            key={selected}
                            id={selected}
                            headingRef={heading}
                            onBack={() => setSelected(null)}
                            onRead={() => markRead(selected)}
                            onSent={() => void feed.mutate()}
                        />
                    ) : (
                        <div className="flex min-h-[520px] flex-col items-center justify-center px-6 text-center">
                            <span className="mb-5 rounded-full bg-clinic-sky p-5 text-clinic-blue">
                                <FiMessageCircle
                                    aria-hidden="true"
                                    className="h-8 w-8"
                                />
                            </span>
                            <h2 className="mb-2 text-lg font-bold text-clinic-ink">
                                Your clinic, connected
                            </h2>
                            <p className="max-w-xs text-sm text-clinic-muted">
                                Open a conversation to view its history and
                                compose a message.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {creating && (
                <NewConversation
                    onClose={() => setCreating(false)}
                    onCreated={thread => {
                        setCreating(false)
                        setSelected(thread.id)
                        void feed.mutate()
                    }}
                />
            )}
        </section>
    )
}
