// All API traffic is intercepted. No clinic messages or consent records are written.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.MESSAGING_TEST_URL || 'http://localhost:3016'
const apiOrigin = process.env.MESSAGING_TEST_API_URL || 'http://localhost:8000'
let actor = 'dentist',
    actorUser = 2,
    granted = true,
    failSend = false,
    mismatch = false
let browser
const requests = [],
    history = []
const staff = {
    id: 2,
    name: 'Jamie Clinician',
    avatar_url: '/logo/pure_pearl.svg',
    roles: [{ slug: 'dentist' }],
    permissions: [
        'messaging.internal.receive',
        'messaging.internal.send',
        'messaging.patient.send',
        'messaging.preferences.manage',
    ],
}
const participants = [
    {
        id: 1,
        user_id: 2,
    },
    { id: 2, patient_id: 23, patient: { id: 23, name: 'Morgan Patient' } },
]
const threads = [
    {
        id: 7,
        subject: 'Care follow-up',
        patient_id: 23,
        use_case: 'care',
        participants,
        created_at: '2026-11-11T10:00:00Z',
    },
    {
        id: 8,
        subject: 'Staff handover',
        use_case: 'internal',
        patient_id: null,
        participants: [
            participants[0],
            {
                id: 3,
                user_id: 3,
                user: {
                    id: 3,
                    name: 'Taylor Staff',
                    roles: [{ slug: 'receptionist' }],
                },
            },
        ],
        created_at: '2026-11-11T09:00:00Z',
    },
    {
        id: 9,
        subject: 'Admin broadcast',
        use_case: 'internal',
        patient_id: null,
        participants: [
            participants[0],
            {
                id: 4,
                user_id: 1,
                user: {
                    id: 1,
                    name: 'Clinic Admin',
                    roles: [{ slug: 'admin' }],
                },
            },
        ],
        created_at: '2026-11-11T08:00:00Z',
    },
]
const onRequest = async ({ method, url, payload }) => {
    requests.push({ method, path: url.pathname, query: url.search, payload })
    if (url.pathname === '/api/user')
        return {
            data: {
                ...staff,
                id: actorUser,
                name: actorUser === 2 ? 'Jamie Clinician' : 'Taylor Staff',
                avatar_url: actorUser === 2 ? '/logo/pure_pearl.svg' : null,
                current_tenant_id: 37,
                email_verified_at: '2026-10-01',
                roles: [{ slug: actor }],
                permissions:
                    actor === 'wildcard'
                        ? ['*']
                        : actor === 'patient'
                        ? staff.permissions
                        : staff.permissions,
            },
        }
    if (url.pathname === '/api/tenants')
        return {
            data: {
                tenants: [
                    {
                        id: 37,
                        name: 'Default Clinic',
                        slug: 'default',
                        active: true,
                    },
                ],
            },
        }
    if (url.pathname === '/api/patients') return { data: { patients: [] } }
    if (url.pathname === '/api/dashboard/summary')
        return {
            data: {
                bookedToday: 0,
                waitingRoom: 0,
                treatmentsDone: 0,
                unpaidInvoiceAmount: 0,
                collectionRate: 0,
                todayAppointments: [],
                staffWorklist: [],
            },
        }
    if (url.pathname === '/api/tasks') return { data: { tasks: [] } }
    if (url.pathname === '/api/appointments')
        return { data: { appointments: [] } }
    if (url.pathname === '/api/conversation-threads' && method === 'GET')
        return {
            data: {
                threads: threads.filter(thread =>
                    thread.subject
                        .toLowerCase()
                        .includes(
                            (
                                url.searchParams.get('search') || ''
                            ).toLowerCase(),
                        ),
                ),
            },
            meta: { pagination: { current_page: 1, last_page: 1 } },
        }
    if (url.pathname === '/api/conversation-threads' && method === 'POST')
        return { status: 201, data: { thread: threads[1] } }
    if (url.pathname === '/api/users')
        return {
            data: {
                users: [
                    staff,
                    { ...staff, id: 3, name: 'Taylor Staff', avatar_url: null },
                    {
                        id: 1,
                        name: 'Clinic Admin',
                        roles: [{ slug: 'admin' }],
                        permissions: staff.permissions,
                    },
                ],
            },
        }
    if (url.pathname.endsWith('/communication-consents/current'))
        return {
            data: {
                consent: {
                    patient_id: 23,
                    purpose: 'clinical',
                    scope: 'follow_up',
                    channel: 'in_app',
                    allowed: granted,
                    reason: granted ? 'consent_granted' : 'consent_withdrawn',
                    status: granted ? 'granted' : 'withdrawn',
                    version: granted ? 1 : 2,
                    text_version: 'care-v2',
                },
            },
        }
    const detail = url.pathname.match(/^\/api\/conversation-threads\/(\d+)$/)
    if (detail)
        return {
            data: {
                thread: threads.find(thread => thread.id === Number(detail[1])),
            },
        }
    if (url.pathname.endsWith('/confirmations')) {
        assert.equal(payload.send_confirmed, undefined)
        assert.equal(payload.consent_acknowledged, undefined)
        return {
            data: {
                confirmation_token: 'opaque-token',
                expires_at: new Date(Date.now() + 300000).toISOString(),
                patient_id: mismatch ? 999 : 23,
                use_case: 'care',
                body: payload.body,
            },
        }
    }
    if (url.pathname.endsWith('/messages')) {
        if (method === 'GET')
            return {
                data: {
                    messages: history.filter(
                        message =>
                            message.thread_id ===
                            Number(url.pathname.split('/')[3]),
                    ),
                },
                meta: { pagination: { last_page: 1 } },
            }
        if (!granted && url.pathname.includes('/7/'))
            return {
                status: 403,
                bodyBase64: Buffer.from(
                    JSON.stringify({
                        success: false,
                        statusCode: 403,
                        code: 'COMMUNICATION_CONSENT_BLOCKED',
                        message: 'Consent withdrawn',
                        errors: {
                            consent: {
                                allowed: false,
                                reason: 'consent_withdrawn',
                            },
                        },
                    }),
                ).toString('base64'),
                code: 'COMMUNICATION_CONSENT_BLOCKED',
                message: 'Consent withdrawn',
                errors: {
                    consent: { allowed: false, reason: 'consent_withdrawn' },
                },
            }
        if (failSend) {
            failSend = false
            return { status: 503, message: 'Temporary send failure' }
        }
        const patient = url.pathname.includes('/7/')
        if (patient) {
            assert.equal(payload.send_confirmed, true)
            assert.equal(payload.consent_acknowledged, true)
            assert.equal(payload.confirmation_token, 'opaque-token')
        }
        const message = {
            id: history.length + 1,
            thread_id: Number(url.pathname.split('/')[3]),
            body: payload.body,
            sender_id: 1,
            actor_id: 2,
            created_at: '2026-11-11T10:05:00Z',
            delivery_state: patient ? 'awaiting_portal' : 'available',
        }
        history.push(message)
        return { status: 201, data: { message } }
    }
    throw new Error(`Unexpected endpoint: ${method} ${url.pathname}`)
}
async function run() {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { evaluate, send, wait, click, delay } = browser
    const text = value =>
        `document.body.innerText.includes(${JSON.stringify(value)})`
    const sendButton = `Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Confirm and send to patient')`
    const sends = () =>
        requests.filter(
            r => r.method === 'POST' && r.path.endsWith('/messages'),
        )
    const fill = async (selector, value) => {
        await evaluate(
            `(() => { const e = document.querySelector(${JSON.stringify(
                selector,
            )}); Object.getOwnPropertyDescriptor(${
                selector === 'textarea'
                    ? 'HTMLTextAreaElement'
                    : 'HTMLInputElement'
            }.prototype, 'value').set.call(e, ${JSON.stringify(
                value,
            )}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`,
        )
        await delay(50)
    }
    const open = async subject => {
        await wait(
            `Array.from(document.querySelectorAll('aside button')).find(b => b.textContent.includes(${JSON.stringify(
                subject,
            )}))`,
        )
        await evaluate(
            `Array.from(document.querySelectorAll('aside button')).find(b => b.textContent.includes(${JSON.stringify(
                subject,
            )})).click()`,
        )
        await wait(text(subject))
        await wait('document.querySelector("article")')
    }
    const reload = async () => {
        await send('Page.navigate', {
            url: `${origin}/?tab=messages&check=${Date.now()}`,
        })
        await wait('document.querySelector("nav")')
    }
    const acknowledge = async () => {
        await evaluate(
            `document.querySelectorAll('[role="dialog"] input[type="checkbox"]').forEach(e => e.click())`,
        )
        await delay(50)
    }
    await reload()
    await open('Care follow-up')
    await wait(text('Granted'))
    await fill('textarea', 'Review your care instructions.')
    await click('Review patient message')
    await wait('document.querySelector("[role=dialog]")')
    assert.equal(sends().length, 0, 'Review never sends')
    assert.equal(await evaluate(`${sendButton}.disabled`), true)
    assert.ok(await evaluate(text('Morgan Patient · Patient #23')))
    await click('Back to conversation')
    assert.equal(
        await evaluate('document.querySelector("textarea").disabled'),
        false,
        'Cancellation permits editing before any attempt',
    )
    await click('Review patient message')
    await wait('document.querySelector("[role=dialog]")')
    assert.equal(
        await evaluate('document.querySelector("[role=dialog] input").checked'),
        false,
    )
    await acknowledge()
    granted = false // Withdrawal after review must still be enforced by the server.
    await click('Confirm and send to patient')
    await wait(text('Send blocked: current patient consent'))
    await wait(text('Blocked: consent_withdrawn'))
    assert.equal(history.length, 0)
    assert.equal(
        await evaluate('document.querySelector("form button").disabled'),
        true,
    )
    granted = true
    await click('Refresh conversation')
    await wait(text('Granted'))
    mismatch = true
    await click('Review patient message')
    await wait(text('Confirmation does not match'))
    assert.equal(
        await evaluate('Boolean(document.querySelector("[role=dialog]"))'),
        false,
    )
    mismatch = false
    await click('Review patient message')
    await wait('document.querySelector("[role=dialog]")')
    await acknowledge()
    failSend = true
    await click('Confirm and send to patient')
    await wait(text('Temporary send failure'))
    const key = sends().at(-1).payload.idempotency_key
    assert.equal(
        await evaluate('document.querySelector("textarea").disabled'),
        true,
    )
    await click('Review retry')
    await wait('document.querySelector("[role=dialog]")')
    await acknowledge()
    await click('Confirm and send to patient')
    await wait(text('Message recorded.'))
    await wait(
        'document.querySelector("article [data-sender-name]")?.textContent === "Jamie Clinician"',
    )
    assert.equal(await evaluate(text('Participant #undefined')), false)
    assert.equal(sends().at(-1).payload.idempotency_key, key)
    assert.equal(history.length, 1)
    await wait(text('not delivered or read'))
    await click('Back to inbox')
    await open('Admin broadcast')
    await wait(text('Read only.'))
    assert.equal(
        await evaluate('Boolean(document.querySelector("textarea"))'),
        false,
    )
    await click('Back to inbox')
    await click('New conversation')
    await wait(text('Taylor Staff'))
    assert.equal(
        await evaluate(
            'document.querySelector("[role=dialog]").innerText.includes("Clinic Admin")',
        ),
        false,
    )
    await click('Close new conversation')
    await fill('input[type=search]', 'handover')
    await wait('document.querySelectorAll("aside li").length === 1')
    assert.ok(requests.some(r => r.query.includes('search=handover')))
    await open('Staff handover')
    await wait('document.querySelector("textarea")')
    await fill('textarea', 'Internal handover')
    await click('Send internal message')
    await wait(text('Message recorded. Available to clinic participants'))
    assert.equal(sends().at(-1).payload.send_confirmed, undefined)
    history.push({
        id: history.length + 1,
        thread_id: 8,
        body: 'Reply from Taylor',
        sender_id: 3,
        actor_id: 3,
        created_at: '2026-11-11T10:06:00Z',
        delivery_state: 'available',
    })
    await click('Refresh conversation')
    const labels = `Array.from(document.querySelectorAll('article [data-sender-name]')).map(p => p.textContent.trim())`
    await wait(
        'document.querySelectorAll("article li[data-message-id]").length === 2',
    )
    assert.deepEqual(await evaluate(labels), [
        'Jamie Clinician',
        'Taylor Staff',
    ])
    assert.equal(
        await evaluate(
            'document.querySelector("li[data-direction=outgoing] [data-sender-name]").textContent',
        ),
        'Jamie Clinician',
    )
    assert.equal(
        await evaluate(
            'document.querySelector("li[data-direction=incoming] [data-avatar]").textContent',
        ),
        'TS',
    )
    await wait(
        'document.querySelector("li[data-direction=outgoing] [data-avatar] img")?.complete',
    )
    assert.ok(
        await evaluate(
            'document.querySelector("li[data-direction=outgoing] [data-avatar] img").naturalWidth > 0',
        ),
    )
    const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
    })
    require('node:fs').writeFileSync(
        '.next-messaging-dev/messenger-desktop.png',
        Buffer.from(shot.data, 'base64'),
    )
    await evaluate(
        'document.querySelector("li[data-direction=outgoing] [data-avatar] img").dispatchEvent(new Event("error"))',
    )
    await wait(
        'document.querySelector("li[data-direction=outgoing] [data-avatar]").textContent === "JC"',
    )
    // A cookie/account change must not turn a draft into another user's send.
    await fill('textarea', 'Draft under Jamie account')
    actorUser = 3
    const beforeAccountChange = sends().length
    await click('Send internal message')
    await wait(text('Your signed-in account or clinic changed.'))
    assert.equal(sends().length, beforeAccountChange)
    await click('Reload clinic session')
    await wait(text('Open a conversation to view its history'))
    await open('Staff handover')
    await wait(
        'document.querySelectorAll("article li[data-message-id]").length === 2',
    )
    assert.deepEqual(await evaluate(labels), [
        'Jamie Clinician',
        'Taylor Staff',
    ])
    assert.equal(
        await evaluate(
            'document.querySelector("li[data-direction=outgoing] [data-sender-name]").textContent',
        ),
        'Taylor Staff',
    )
    await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    })
    assert.equal(
        await evaluate('document.documentElement.scrollWidth <= innerWidth'),
        true,
    )
    const mobileShot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
    })
    require('node:fs').writeFileSync(
        '.next-messaging-dev/messenger-mobile.png',
        Buffer.from(mobileShot.data, 'base64'),
    )
    await click('Back to inbox')
    await wait('document.querySelector("aside input")')
    actor = 'admin'
    actorUser = 2
    await reload()
    await click('New conversation')
    await wait('document.querySelector("[role=dialog]")')
    assert.equal(
        await evaluate(
            'document.querySelector("[role=dialog]").innerText.includes("Patient-facing")',
        ),
        false,
    )
    await click('Close new conversation')
    assert.equal(
        await evaluate(
            'document.querySelector("aside").innerText.includes("Care follow-up")',
        ),
        false,
    )
    actor = 'wildcard'
    const before = requests.filter(r => r.path === '/api/conversation-threads')
        .length
    await reload()
    await delay(500)
    assert.equal(
        await evaluate(
            `Boolean(document.querySelector('section[aria-label="Clinic messaging"]'))`,
        ),
        false,
    )
    assert.equal(
        requests.filter(r => r.path === '/api/conversation-threads').length,
        before,
    )
    assert.deepEqual(browser.errors, [])
    console.log(
        'Messaging browser safeguards, retry, permissions and mobile checks passed.',
    )
}
run()
    .catch(error => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        if (browser) await browser.close()
    })
