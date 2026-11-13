const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, dependencies = {}) {
    const module = { exports: {} }
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            jsx: ts.JsxEmit.React,
        },
    }).outputText
    new Function('module', 'exports', 'require', code)(
        module,
        module.exports,
        id => dependencies[id] ?? require(id),
    )
    return module.exports
}
const constants = load('src/Constants/index.tsx')
const {
    getMessagingPermissions,
    canAccessModuleId,
} = load('src/lib/permissions.ts', { '../Constants': constants })
const staff = {
    id: 2,
    current_tenant_id: 37,
    roles: [{ slug: 'dentist' }],
    permissions: [
        'messaging.internal.send',
        'messaging.internal.receive',
        'messaging.patient.send',
        'messaging.preferences.manage',
    ],
}
assert.equal(getMessagingPermissions(staff).patientSend, true)
assert.equal(canAccessModuleId(staff, 'messages'), true)
for (const permissions of [
    ['*'],
    ['messaging.*'],
    ['*.send'],
    ['messages.view'],
    [],
]) {
    assert.equal(
        canAccessModuleId({ ...staff, permissions }, 'messages'),
        false,
    )
    assert.equal(
        getMessagingPermissions({ ...staff, permissions }).consentManage,
        false,
    )
}
for (const slug of ['admin', 'patient']) {
    const access = getMessagingPermissions({ ...staff, roles: [{ slug }] })
    assert.equal(access.patientSend, false)
    assert.equal(access.consentManage, false)
}
assert.equal(
    getMessagingPermissions({ ...staff, roles: [] }).patientSend,
    false,
)
assert.equal(
    getMessagingPermissions({ ...staff, current_tenant_id: undefined })
        .patientSend,
    false,
)
assert.equal(
    getMessagingPermissions({
        ...staff,
        permissions: ['messaging.patient.send'],
    }).consentManage,
    false,
)
const requests = []
let actualSession = { id: 2, current_tenant_id: 37 }
let confirmationResponse = {
    confirmation_token: 'opaque-token',
    patient_id: 23,
}
const apiClient = {
    postData: async (url, payload) => {
        requests.push({ url, payload })
        return url.endsWith('/confirmations')
            ? confirmationResponse
            : { message: { id: 8 } }
    },
    getData: async (url, config) => {
        requests.push({ url, config })
        if (url === '/api/user') return actualSession
        if (url === '/api/users')
            return {
                users: [
                    { id: 2, name: 'Jamie Clinician' },
                    { id: 3, name: 'Taylor Staff' },
                ],
            }
        return {
            consent: {
                allowed: false,
                reason: 'consent_withdrawn',
                patient_id: 23,
                purpose: 'clinical',
                scope: 'follow_up',
                channel: 'in_app',
            },
        }
    },
    get: async () => ({
        data: { threads: [], messages: [] },
        meta: { pagination: { last_page: 4 } },
    }),
}
const messaging = load('src/services/messaging.ts', {
    '../lib/api': { apiClient },
    '../lib/user-avatar': load('src/lib/user-avatar.ts'),
})
const { getUserInitials, getUserAvatarUrl } = load('src/lib/user-avatar.ts')
assert.equal(getUserInitials('Melissa Van Gogh'), 'MV')
assert.equal(getUserInitials(' Taylor   Staff '), 'TS')
assert.equal(getUserInitials(''), 'A')
assert.equal(
    getUserAvatarUrl({ profile_photo_url: '/storage/profile.jpg' }),
    '/storage/profile.jpg',
)
assert.equal(
    getUserAvatarUrl({ avatar_url: 'https://clinic.test/profile.jpg' }),
    'https://clinic.test/profile.jpg',
)
assert.equal(getUserAvatarUrl({ avatar_url: 'javascript:alert(1)' }), undefined)
assert.deepEqual(messaging.consentScope('care'), {
    purpose: 'clinical',
    scope: 'follow_up',
})
assert.deepEqual(messaging.consentScope('billing'), {
    purpose: 'transactional',
    scope: 'billing',
})
assert.deepEqual(messaging.consentScope('appointments'), {
    purpose: 'transactional',
    scope: 'appointments',
})
assert.deepEqual(messaging.consentScope('general'), {
    purpose: 'general',
    scope: 'non_essential',
})
assert.throws(() => messaging.consentScope('unknown'))
assert.equal(
    messaging.patientIdForThread({
        patient_id: 23,
        participants: [{ patient_id: 23 }],
    }),
    23,
)
assert.throws(() =>
    messaging.patientIdForThread({
        patient_id: 23,
        participants: [{ patient_id: 99 }],
    }),
)
assert.equal(
    messaging.patientIdForThread({ participants: [{ user_id: 2 }] }),
    null,
)
assert.equal(
    messaging.patientIdForThread({
        use_case: 'internal',
        patient_id: null,
        participants: [{ user_id: 2 }, { user_id: 3 }],
    }),
    null,
)
assert.throws(() =>
    messaging.patientIdForThread({
        use_case: 'care',
        patient_id: null,
        participants: [{ user_id: 2 }],
    }),
)
assert.throws(() =>
    messaging.patientIdForThread({ use_case: 'internal', patient_id: 23 }),
)
assert.match(
    messaging.deliveryLabel('awaiting_portal'),
    /not delivered or read/,
)
const bareParticipants = [
    { id: 1, user_id: 2 },
    { id: 2, user_id: 3 },
]
assert.equal(
    messaging.messageSenderName(
        { sender_id: 1, actor_id: 2 },
        bareParticipants,
        { id: 2, name: 'Jamie Clinician' },
    ),
    'Jamie Clinician',
)
assert.equal(
    messaging.messageSenderName(
        { sender_id: 2, actor_id: 3 },
        bareParticipants,
        { id: 2, name: 'Jamie Clinician' },
    ),
    'Staff #3',
    'Participant IDs must not be interpreted as user IDs',
)
assert.equal(
    messaging.messageSenderName(
        { sender_id: 2, actor_id: 2 },
        bareParticipants,
        { id: 2, name: 'Jamie Clinician' },
    ),
    'Staff #3',
    'A matched participant determines sender identity',
)
assert.equal(
    messaging.messageSenderName({ sender_id: 1 }, [
        { id: 1, user_id: 2, user: { id: 2, name: 'Jamie Clinician' } },
    ]),
    'Jamie Clinician',
)
assert.equal(
    messaging.messageSenderName({ sender_participant_id: 1 }, [
        { id: 1, name: 'Legacy sender' },
    ]),
    'Legacy sender',
)
assert.equal(
    messaging.messageSenderName({ actor_id: 2 }, [], {
        id: 2,
        name: 'Jamie Clinician',
    }),
    'Jamie Clinician',
)
assert.equal(
    messaging.messageSenderName({ sender_id: 7 }, []),
    'Participant #7',
)
assert.equal(messaging.messageSenderName({}, []), 'Sender unavailable')
const namedParticipants = messaging.resolveStaffParticipants(bareParticipants, [
    { id: 2, name: 'Jamie Clinician' },
    { id: 3, name: 'Taylor Staff' },
])
for (const viewer of [
    { id: 2, name: 'Jamie Clinician' },
    { id: 3, name: 'Taylor Staff' },
]) {
    assert.equal(
        messaging.messageSenderName(
            { sender_id: 1, actor_id: 2 },
            namedParticipants,
            viewer,
        ),
        'Jamie Clinician',
    )
    assert.equal(
        messaging.messageSenderName(
            { sender_id: 2, actor_id: 3 },
            namedParticipants,
            viewer,
        ),
        'Taylor Staff',
    )
}
async function run() {
    assert.equal((await messaging.getMessagingStaff())[1].name, 'Taylor Staff')
    assert.equal(
        await messaging.isMessagingSessionCurrent({
            id: 2,
            current_tenant_id: 37,
        }),
        true,
    )
    actualSession = { id: 3, current_tenant_id: 37 }
    assert.equal(
        await messaging.isMessagingSessionCurrent({
            id: 2,
            current_tenant_id: 37,
        }),
        false,
    )
    actualSession = { id: 2, current_tenant_id: 38 }
    assert.equal(
        await messaging.isMessagingSessionCurrent({
            id: 2,
            current_tenant_id: 37,
        }),
        false,
    )
    actualSession = { id: 2, current_tenant_id: 37 }
    const payload = {
        body: 'Care instructions',
        idempotency_key: 'stable-retry-key',
    }
    const confirmation = await messaging.prepareMessage(7, payload)
    assert.equal(
        confirmation.patient.id,
        23,
        'Backend patient_id is normalized for confirmation review',
    )
    assert.deepEqual(requests.at(-1), {
        url: '/api/conversation-threads/7/confirmations',
        payload,
    })
    assert.equal(requests.at(-1).payload.send_confirmed, undefined)
    confirmationResponse = {
        confirmation_token: 'opaque-token',
        patient: { id: 23, name: 'Patient' },
    }
    assert.equal((await messaging.prepareMessage(7, payload)).patient.id, 23)
    confirmationResponse = {
        confirmation_token: 'opaque-token',
        patient_id: 23,
        patient: { id: 99 },
    }
    await assert.rejects(
        () => messaging.prepareMessage(7, payload),
        /inconsistent/,
    )
    confirmationResponse = { confirmation_token: 'opaque-token' }
    await assert.rejects(() => messaging.prepareMessage(7, payload), /missing/)
    await messaging.sendConversationMessage(7, payload, confirmation)
    const accepted = requests.at(-1)
    assert.equal(accepted.payload.send_confirmed, true)
    assert.equal(accepted.payload.consent_acknowledged, true)
    assert.equal(accepted.payload.confirmation_token, 'opaque-token')
    await messaging.sendConversationMessage(7, payload, confirmation)
    assert.deepEqual(requests.at(-1), accepted)
    await messaging.sendConversationMessage(8, payload)
    assert.equal(requests.at(-1).payload.confirmation_token, undefined)
    assert.equal((await messaging.getCurrentConsent(23, 'care')).allowed, false)
    assert.deepEqual(requests.at(-1).config.params, {
        purpose: 'clinical',
        scope: 'follow_up',
        channel: 'in_app',
    })
    assert.equal((await messaging.getConversations('', 1)).meta.lastPage, 4)
    assert.equal(
        (await messaging.getConversationMessages(7, 1)).meta.lastPage,
        4,
    )
    console.log(
        'Messaging permission, consent, confirmation and idempotency checks passed.',
    )
}
run().catch(error => {
    console.error(error)
    process.exitCode = 1
})
