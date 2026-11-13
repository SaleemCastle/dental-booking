import { apiClient, PaginationMeta } from '../lib/api'
import { getUserAvatarUrl } from '../lib/user-avatar'

export interface ConversationParticipant {
    id: number
    user_id?: number | null
    patient_id?: number | null
    name?: string
    user?: {
        id: number
        name: string
        roles?: Array<{ slug: string }>
        avatar_url?: string | null
        profile_photo_url?: string | null
    }
    patient?: {
        id: number
        first_name?: string
        last_name?: string
        name?: string
    }
}
export interface MessagingStaffIdentity {
    id: number
    name: string
    avatar_url?: string
    roles?: Array<{ slug?: string } | string>
}
export const getMessagingStaff = async (): Promise<
    MessagingStaffIdentity[]
> => {
    const { users } = await apiClient.getData<{
        users: MessagingStaffIdentity[]
    }>('/api/users')
    return users.map(identity => ({
        id: identity.id,
        name: identity.name,
        roles: identity.roles,
        avatar_url: getUserAvatarUrl(identity),
    }))
}
export const isMessagingSessionCurrent = async (expected: {
    id?: number
    current_tenant_id?: number
}) => {
    const actual = await apiClient.getData<{
        id?: number
        current_tenant_id?: number
    }>('/api/user')
    return (
        Number.isSafeInteger(expected.id) &&
        Number.isSafeInteger(expected.current_tenant_id) &&
        actual?.id === expected.id &&
        actual.current_tenant_id === expected.current_tenant_id
    )
}
export const resolveStaffParticipants = (
    participants: ConversationParticipant[],
    staff: MessagingStaffIdentity[],
) =>
    participants.map(participant => {
        const identity = staff.find(user => user.id === participant.user_id)
        return identity
            ? {
                  ...participant,
                  name: identity.name,
                  user: {
                      ...participant.user,
                      id: identity.id,
                      name: identity.name,
                      avatar_url:
                          identity.avatar_url ??
                          getUserAvatarUrl(participant.user),
                      roles:
                          identity.roles?.map(role =>
                              typeof role === 'string'
                                  ? { slug: role }
                                  : { slug: role.slug ?? '' },
                          ) ?? participant.user?.roles,
                  },
              }
            : participant
    })
export interface ConversationThread {
    id: number
    subject: string
    patient_id?: number | null
    use_case?:
        | 'internal'
        | 'care'
        | 'billing'
        | 'appointments'
        | 'general'
        | null
    participants?: ConversationParticipant[]
    updated_at?: string
    created_at?: string
    last_message_id?: number
}
export interface ConversationMessage {
    id: number
    body: string | null
    sender_id?: number
    actor_id?: number
    sender_participant_id?: number
    sender?: { name?: string }
    sender_participant?: ConversationParticipant
    created_at: string
    delivery_state: string
    kind?: string
    supersedes_id?: number | null
    reason?: string | null
    redacted?: boolean
}
export interface MessagePayload {
    body: string
    idempotency_key: string
}
export interface MessageConfirmation {
    confirmation_token: string
    expires_at: string
    patient: {
        id: number
        name?: string
        first_name?: string
        last_name?: string
    }
    use_case: string
    body: string
}
export interface ConsentDecision {
    allowed: boolean
    reason: string
    patient_id: number
    purpose: string
    scope: string
    channel: string
    status?: string | null
    version?: number | null
    consent_id?: number | null
    text_version?: string | null
}
export const consentScope = (useCase: ConversationThread['use_case']) => {
    switch (useCase) {
        case 'care':
            return { purpose: 'clinical', scope: 'follow_up' }
        case 'billing':
            return { purpose: 'transactional', scope: 'billing' }
        case 'appointments':
            return { purpose: 'transactional', scope: 'appointments' }
        case 'general':
            return { purpose: 'general', scope: 'non_essential' }
        default:
            throw new Error('This conversation has no supported consent scope.')
    }
}
export const patientIdForThread = (thread: ConversationThread) => {
    const patientIds = [
        thread.patient_id,
        ...(thread.participants ?? []).map(p => p.patient_id),
    ]
    if (
        patientIds.some(
            id => id != null && (!Number.isSafeInteger(id) || Number(id) <= 0),
        )
    )
        throw new Error('Patient identity is invalid. Reload the conversation.')
    const ids = new Set(
        [
            thread.patient_id,
            ...(thread.participants ?? []).map(p => p.patient_id),
        ].filter((id): id is number => typeof id === 'number' && id > 0),
    )
    if (ids.size > 1)
        throw new Error(
            'Patient context is inconsistent. Reload the conversation.',
        )
    const patientId = Array.from(ids)[0] ?? null
    if (thread.use_case && thread.use_case !== 'internal' && !patientId)
        throw new Error('Patient identity is missing. Reload the conversation.')
    if (thread.use_case === 'internal' && patientId)
        throw new Error(
            'Internal conversation has an unexpected patient identity. Reload the conversation.',
        )
    return patientId
}
export const participantName = (p: ConversationParticipant) =>
    p.name ||
    p.user?.name ||
    p.patient?.name ||
    [p.patient?.first_name, p.patient?.last_name].filter(Boolean).join(' ') ||
    (p.patient_id ? `Patient #${p.patient_id}` : `Staff #${p.user_id ?? p.id}`)
export const messageSenderName = (
    message: ConversationMessage,
    participants: ConversationParticipant[],
    currentUser?: { id?: number; name?: unknown } | null,
) => {
    // sender_id is a conversation participant ID; actor_id is a user ID.
    // Keep these namespaces separate, including when their numbers overlap.
    const senderId =
        message.sender_id ??
        message.sender_participant_id ??
        message.sender_participant?.id
    const sender =
        participants.find(p => p.id === senderId) ?? message.sender_participant
    const actorId = sender ? sender.user_id : message.actor_id
    // Prefer a shared identity over the viewing account's name so every
    // participant sees the same attribution for this message.
    const senderName =
        sender?.name || sender?.user?.name || message.sender?.name
    if (senderName) return senderName
    if (
        actorId != null &&
        actorId === currentUser?.id &&
        typeof currentUser.name === 'string' &&
        currentUser.name.trim()
    )
        return currentUser.name
    if (sender) return participantName(sender)
    if (message.sender?.name) return message.sender.name
    if (actorId != null) return `Staff #${actorId}`
    return senderId != null ? `Participant #${senderId}` : 'Sender unavailable'
}
export const messageSenderIdentity = (
    message: ConversationMessage,
    participants: ConversationParticipant[],
    currentUser?: { id?: number; name?: unknown } | null,
) => {
    const senderId =
        message.sender_id ??
        message.sender_participant_id ??
        message.sender_participant?.id
    const sender =
        participants.find(participant => participant.id === senderId) ??
        message.sender_participant
    const actorId = sender ? sender.user_id : message.actor_id
    const isOwn = actorId != null && actorId === currentUser?.id
    return {
        name: messageSenderName(message, participants, currentUser),
        isOwn,
        photoUrl:
            getUserAvatarUrl(sender?.user) ??
            (isOwn ? getUserAvatarUrl(currentUser) : undefined),
    }
}
export const deliveryLabel = (state: string) =>
    ({
        available: 'Available to clinic participants',
        awaiting_portal:
            'Recorded — awaiting patient portal (not delivered or read)',
        failed: 'Delivery failed',
        pending: 'Pending',
    }[state] ?? `Delivery state: ${state || 'unknown'}`)
export const threadRevision = (thread: ConversationThread) =>
    String(
        thread.last_message_id ??
            thread.updated_at ??
            thread.created_at ??
            thread.id,
    )
const pagination = (meta?: PaginationMeta) => {
    const value = (meta?.pagination ?? meta ?? {}) as PaginationMeta
    return {
        ...value,
        lastPage: Number(value.lastPage ?? value.last_page ?? 1),
    }
}
export const getConversations = async (search: string, page: number) => {
    const response = await apiClient.get<{ threads: ConversationThread[] }>(
        '/api/conversation-threads',
        { params: { search: search || undefined, page, per_page: 25 } },
    )
    return { threads: response.data.threads, meta: pagination(response.meta) }
}
export const getConversation = async (id: number) => {
    const { thread } = await apiClient.getData<{ thread: ConversationThread }>(
        `/api/conversation-threads/${id}`,
    )
    if (thread?.id !== id)
        throw new Error(
            'Conversation identity does not match. Reload the inbox.',
        )
    patientIdForThread(thread)
    return thread
}
export const createConversation = async (payload: {
    subject: string
    user_ids?: number[]
    patient_id?: number
    use_case?: string
}) =>
    (
        await apiClient.postData<{ thread: ConversationThread }>(
            '/api/conversation-threads',
            payload,
        )
    ).thread
export const getConversationMessages = async (id: number, page: number) => {
    const response = await apiClient.get<{ messages: ConversationMessage[] }>(
        `/api/conversation-threads/${id}/messages`,
        { params: { page, per_page: 25 } },
    )
    return { messages: response.data.messages, meta: pagination(response.meta) }
}
export const prepareMessage = async (
    id: number,
    payload: MessagePayload,
): Promise<MessageConfirmation> => {
    const confirmation = await apiClient.postData<
        Omit<MessageConfirmation, 'patient'> & {
            patient_id?: number
            patient?: MessageConfirmation['patient']
        }
    >(`/api/conversation-threads/${id}/confirmations`, payload)
    const ids = [confirmation.patient_id, confirmation.patient?.id].filter(
        id => id != null,
    )
    if (
        !ids.length ||
        ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(ids).size !== 1
    )
        throw new Error(
            'Confirmation patient identity is missing or inconsistent. Reload the conversation.',
        )
    return { ...confirmation, patient: { ...confirmation.patient, id: ids[0] } }
}
export const sendConversationMessage = async (
    id: number,
    payload: MessagePayload,
    confirmation?: MessageConfirmation,
) =>
    (
        await apiClient.postData<{ message: ConversationMessage }>(
            `/api/conversation-threads/${id}/messages`,
            {
                ...payload,
                ...(confirmation
                    ? {
                          confirmation_token: confirmation.confirmation_token,
                          send_confirmed: true,
                          consent_acknowledged: true,
                      }
                    : {}),
            },
        )
    ).message
export const getCurrentConsent = async (
    patientId: number,
    useCase: ConversationThread['use_case'],
) => {
    const scope = consentScope(useCase)
    const { consent } = await apiClient.getData<{ consent: ConsentDecision }>(
        `/api/patients/${patientId}/communication-consents/current`,
        {
            params: { ...scope, channel: 'in_app' },
        },
    )
    if (
        consent?.patient_id !== patientId ||
        consent.purpose !== scope.purpose ||
        consent.scope !== scope.scope ||
        consent.channel !== 'in_app' ||
        typeof consent.allowed !== 'boolean'
    )
        throw new Error(
            'Consent decision does not match this patient, purpose and channel. Sending is blocked.',
        )
    return consent
}
