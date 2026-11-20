import React from 'react'
import { FiCheck, FiClock, FiAlertCircle } from 'react-icons/fi'
import {
    ConversationMessage,
    ConversationParticipant,
    deliveryLabel,
    messageSenderIdentity,
} from '../../services/messaging'
import UserAvatar from '../UserAvatar'

export default function MessageBubble({
    message,
    participants,
    user,
}: {
    message: ConversationMessage
    participants: ConversationParticipant[]
    user: { id?: number; name?: unknown } | null
}) {
    const sender = messageSenderIdentity(message, participants, user)
    const date = new Date(message.created_at)
    const validDate = !Number.isNaN(date.getTime())
    const fullTime = validDate
        ? date.toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : 'Timestamp unavailable'
    const state =
        message.delivery_state === 'available'
            ? 'Available'
            : message.delivery_state === 'awaiting_portal'
            ? 'Awaiting portal · not delivered or read'
            : deliveryLabel(message.delivery_state)
    const StateIcon =
        message.delivery_state === 'available'
            ? FiCheck
            : message.delivery_state === 'failed'
            ? FiAlertCircle
            : FiClock
    return (
        <li
            data-message-id={message.id}
            data-direction={sender.isOwn ? 'outgoing' : 'incoming'}
            className={`flex items-start gap-2.5 sm:gap-3 ${
                sender.isOwn ? 'flex-row-reverse' : ''
            }`}>
            <UserAvatar name={sender.name} photoUrl={sender.photoUrl} />
            <div
                className={`min-w-0 max-w-[calc(100%-3.25rem)] sm:max-w-[80%] ${
                    sender.isOwn ? 'items-end' : 'items-start'
                } flex flex-col`}>
                <div
                    className={`mb-1.5 flex flex-wrap items-center gap-2 ${
                        sender.isOwn ? 'justify-end' : ''
                    }`}>
                    <span
                        data-sender-name
                        className="text-xs font-bold text-clinic-ink">
                        {sender.name}
                    </span>
                    {sender.isOwn && (
                        <span className="text-[10px] text-clinic-muted">
                            You
                        </span>
                    )}
                </div>
                <div
                    className={`min-w-0 max-w-full rounded-2xl px-4 py-3 shadow-sm ${
                        sender.isOwn
                            ? 'rounded-tr-sm bg-clinic-blue text-white'
                            : 'rounded-tl-sm border border-clinic-line bg-white text-clinic-ink'
                    }`}>
                    {message.kind && message.kind !== 'message' && (
                        <p className="mb-1 text-xs font-bold capitalize">
                            {message.kind}
                            {message.supersedes_id
                                ? ` · Refers to message #${message.supersedes_id}`
                                : ''}
                        </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                        {message.redacted || message.body === null
                            ? 'Message body withheld / redacted'
                            : message.body}
                    </p>
                    {message.reason && (
                        <p className="mt-2 text-xs">Reason: {message.reason}</p>
                    )}
                </div>
                <div
                    className={`mt-1.5 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-clinic-muted ${
                        sender.isOwn ? 'justify-end' : ''
                    }`}>
                    <time dateTime={message.created_at} title={fullTime}>
                        {validDate
                            ? date.toLocaleTimeString(undefined, {
                                  hour: 'numeric',
                                  minute: '2-digit',
                              })
                            : fullTime}
                    </time>
                    <span
                        className="inline-flex items-center gap-1"
                        title={deliveryLabel(message.delivery_state)}>
                        <StateIcon aria-hidden="true" className="h-3 w-3" />
                        {state}
                    </span>
                    <details className="relative">
                        <summary className="cursor-pointer rounded hover:text-clinic-blue focus-visible:ring-2 focus-visible:ring-clinic-blue">
                            Details
                        </summary>
                        <p className="mt-1 rounded-lg border border-clinic-line bg-white p-2 text-xs">
                            Message #{message.id} · {fullTime} ·{' '}
                            {deliveryLabel(message.delivery_state)}
                        </p>
                    </details>
                </div>
            </div>
        </li>
    )
}
