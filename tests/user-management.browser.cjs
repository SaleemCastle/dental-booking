// Uses intercepted API fixtures; never writes to the real clinic backend.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.USER_MANAGEMENT_TEST_URL || 'http://localhost:3000'
const apiOrigin =
    process.env.USER_MANAGEMENT_TEST_API_URL || 'http://localhost:8000'
const permissions = [
    { id: 1, name: 'View patients', slug: 'patients.view' },
    { id: 2, name: 'View appointments', slug: 'appointments.view' },
    { id: 3, name: 'Update patients', slug: 'patients.update' },
]
let roles = [
    'admin',
    'dentist',
    'hygienist',
    'receptionist',
    'billing',
    'auditor',
].map((slug, index) => ({
    id: index + 1,
    slug,
    name: slug[0].toUpperCase() + slug.slice(1),
    is_system: true,
    permissions:
        index === 0 ? permissions : index === 1 ? [permissions[0]] : [],
}))
let users = [
    {
        id: 1,
        name: 'Clinic Admin',
        email: 'admin@clinic.test',
        email_verified_at: '2026-10-19',
        roles: [roles[0]],
    },
    {
        id: 2,
        name: 'Jessie Doe',
        email: 'jessie@clinic.test',
        email_verified_at: null,
        roles: [roles[1], roles[2]],
    },
]
let actor = 'admin',
    listFailure = 0,
    mutationFailure = 0,
    browser,
    revoke = false,
    detailFailure = 0
let releaseDetail,
    holdDetail = false
const requests = []
const session = () =>
    actor === 'admin'
        ? { ...users[0], permissions: ['dashboard.view'] }
        : {
              id: 90,
              name: `Reader ${actor}`,
              email_verified_at: '2026-10-19',
              permissions: ['dashboard.view', '*'],
              roles:
                  actor === 'name-only'
                      ? [{ name: 'admin', slug: 'dentist' }]
                      : actor === 'string-role'
                      ? ['admin']
                      : [{ slug: actor }],
          }
const onRequest = async ({ method, url, payload }) => {
    requests.push({ method, path: url.pathname, payload })
    if (url.pathname === '/api/user')
        return actor === 'guest' ? { status: 401 } : { data: session() }
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
    if (url.pathname === '/api/patients') return { data: { patients: [] } }
    if (url.pathname === '/api/appointments')
        return { data: { appointments: [] } }
    if (url.pathname === '/api/users' && method === 'GET') {
        if (revoke) {
            actor = 'receptionist'
            revoke = false
            return { status: 403, message: 'Access revoked.' }
        }
        await new Promise(resolve => setTimeout(resolve, 120))
        return listFailure
            ? {
                  status: listFailure,
                  message: 'User list unavailable.',
                  requestId: 'failed-user-list',
              }
            : { data: { users } }
    }
    if (url.pathname === '/api/roles' && method === 'GET')
        return { data: { roles } }
    if (url.pathname === '/api/permissions') return { data: { permissions } }
    const detail = url.pathname.match(/^\/api\/users\/(\d+)$/)
    if (detail) {
        const snapshot = structuredClone(
            users.find(user => user.id === Number(detail[1])),
        )
        if (holdDetail)
            await new Promise(resolve => {
                releaseDetail = resolve
            })
        return detailFailure
            ? { status: detailFailure, message: 'User details unavailable.' }
            : { data: { user: snapshot } }
    }
    const userRoles = url.pathname.match(/^\/api\/users\/(\d+)\/roles$/)
    const rolePermissions = url.pathname.match(
        /^\/api\/roles\/(\d+)\/permissions$/,
    )
    if (userRoles || rolePermissions) {
        assert.equal(method, 'PUT')
        if (mutationFailure)
            return {
                status: mutationFailure,
                message: 'Assignment rejected.',
                errors: {
                    [userRoles ? 'role_ids' : 'permission_ids']: [
                        'Keep required access.',
                    ],
                },
                requestId: 'failed-role-update',
            }
        if (userRoles) {
            const target = users.find(user => user.id === Number(userRoles[1]))
            target.roles = roles.filter(role =>
                payload.role_ids.includes(role.id),
            )
            return { data: { user: target } }
        }
        const role = roles.find(role => role.id === Number(rolePermissions[1]))
        role.permissions = permissions.filter(permission =>
            payload.permission_ids.includes(permission.id),
        )
        return { data: { role } }
    }
    throw new Error(`Unexpected endpoint: ${method} ${url.pathname}`)
}
async function run() {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { evaluate, send, wait, click, select, delay } = browser
    const panel = `document.querySelector('section[aria-label="User & Role Management"]')`
    const dialog = `document.querySelector('[role="dialog"]')`
    const nav = `Array.from(document.querySelectorAll('nav a')).find(link => new URL(link.href).searchParams.get('tab') === 'user_management')`
    const text = value =>
        `${panel}?.innerText.includes(${JSON.stringify(value)})`
    const dialogText = value =>
        `${dialog}?.innerText.includes(${JSON.stringify(value)})`
    const writes = () => requests.filter(item => item.method === 'PUT')
    const reads = () =>
        requests.filter(item =>
            /^\/api\/(users|roles|permissions)/.test(item.path),
        )
    const field = label =>
        `Array.from(document.querySelectorAll('label')).find(label => label.textContent.startsWith(${JSON.stringify(
            label,
        )}))?.querySelector('input,select')`
    const checkbox = slug =>
        `Array.from(${dialog}.querySelectorAll('label')).find(label => label.querySelector('span > span')?.textContent === ${JSON.stringify(
            slug[0].toUpperCase() + slug.slice(1),
        )}).querySelector('input')`
    const toggle = async slug => {
        await evaluate(`${checkbox(slug)}.click()`)
        await delay(50)
    }
    const fill = async (label, value) => {
        await evaluate(
            `(() => { const element = ${field(
                label,
            )}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(
                value,
            )}); element.dispatchEvent(new Event('input', { bubbles: true })); })()`,
        )
        await delay(50)
    }
    const reload = async (allowed = true) => {
        await send('Page.navigate', {
            url: `${origin}/?tab=user_management&check=${Date.now()}`,
        })
        if (actor === 'guest') {
            await wait(`location.pathname === '/login'`)
            return
        }
        await wait('document.querySelector("nav")')
        if (allowed) {
            await wait(nav)
            await evaluate(`${nav}.click()`)
            await wait(text('jessie@clinic.test'))
        } else await delay(300)
    }
    await reload()
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('tbody tr').length`),
        2,
    )
    await fill('Search users', 'JESSIE@')
    assert.equal(
        await evaluate(`${panel}.querySelectorAll('tbody tr').length`),
        1,
    )
    await fill('Search users', 'no-one')
    await wait(text('No users match these filters.'))
    await click('Clear user filters')
    await evaluate(
        `(() => { const element = ${field(
            'Role',
        )}; element.value = 'dentist'; element.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    )
    await wait(`${panel}.querySelectorAll('tbody tr').length === 1`)
    await evaluate(
        `(() => { const element = ${field(
            'Status',
        )}; element.value = 'Email verified'; element.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    )
    await wait(text('No users match these filters.'))
    await click('Clear user filters')
    await click('Manage roles for jessie@clinic.test')
    await wait(dialogText('Jessie Doe'))
    assert.equal(await evaluate(`${checkbox('dentist')}.checked`), true)
    assert.equal(await evaluate(`${checkbox('hygienist')}.checked`), true)
    assert.equal(await evaluate(`${checkbox('admin')}.checked`), false)
    await toggle('receptionist')
    await click('Review role changes')
    assert.equal(writes().length, 0, 'Review must not mutate')
    await click('Back to editing')
    assert.equal(await evaluate(`${checkbox('receptionist')}.checked`), true)
    mutationFailure = 422
    await click('Review role changes')
    await click('Confirm role changes')
    await wait(dialogText('Keep required access.'))
    await wait(dialogText('failed-role-update'))
    assert.equal(
        await evaluate(`${checkbox('receptionist')}.checked`),
        true,
        'Validation errors preserve the draft',
    )
    mutationFailure = 0
    await click('Review role changes')
    await click('Confirm role changes')
    await wait(`!${dialog}`)
    await wait(text('Roles updated for Jessie Doe.'))
    assert.deepEqual(writes().at(-1).payload.role_ids, [2, 3, 4])
    await click('Manage roles for jessie@clinic.test')
    await wait(dialogText('Jessie Doe'))
    for (const role of ['dentist', 'hygienist', 'receptionist'])
        await toggle(role)
    await click('Review role changes')
    await click('Confirm role changes')
    await wait(`!${dialog}`)
    await wait(text('No roles'))
    assert.deepEqual(writes().at(-1).payload.role_ids, [])
    await click('Manage roles for admin@clinic.test')
    await wait(dialogText('Clinic Admin'))
    assert.equal(await evaluate(`${checkbox('admin')}.disabled`), true)
    await wait(dialogText('Required or last administrator'))
    await click('Close role editor')
    // Grant a second admin, then verify removal is permitted with confirmation.
    await click('Manage roles for jessie@clinic.test')
    await wait(dialogText('Jessie Doe'))
    await toggle('admin')
    await click('Review role changes')
    await click('Confirm role changes')
    await wait(`!${dialog}`)
    await click('Roles & permissions (6)')
    await click('Edit permissions for dentist')
    await wait(dialogText('Permissions for Dentist'))
    assert.ok(
        await evaluate(
            `Boolean(${dialog}.querySelector('[aria-label="Remove patients.view"]'))`,
        ),
    )
    // Exercise actual drag/drop handlers with the same DataTransfer object.
    await evaluate(`(() => {
        const source = ${dialog}.querySelector('[aria-label="Add appointments.view"]');
        const transfer = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
        const target = ${dialog}.querySelector('[aria-label="Assigned permissions"]');
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    })()`)
    await wait(
        `${dialog}.querySelector('[aria-label="Remove appointments.view"]')`,
    )
    // Enter operates the same assignment control and preserves keyboard focus.
    await evaluate(
        `${dialog}.querySelector('[aria-label="Remove patients.view"]').focus()`,
    )
    await wait(
        `document.activeElement?.getAttribute('aria-label') === 'Remove patients.view'`,
    )
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        text: '\r',
        unmodifiedText: '\r',
        windowsVirtualKeyCode: 13,
    })
    await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
    })
    await wait(`${dialog}.querySelector('[aria-label="Add patients.view"]')`)
    assert.equal(
        await evaluate(`document.activeElement.getAttribute('aria-label')`),
        'Add patients.view',
    )
    const beforePermissionWrite = writes().length
    await click('Review permission changes')
    assert.equal(writes().length, beforePermissionWrite)
    await wait(dialogText('every user with the Dentist role'))
    await click('Confirm permission changes')
    await wait(`!${dialog}`)
    await wait(text('Permissions updated for Dentist.'))
    assert.deepEqual(writes().at(-1).payload, { permission_ids: [2] })
    await click('Edit permissions for dentist')
    await wait(
        `${dialog}.querySelector('[aria-label="Remove appointments.view"]')`,
    )
    // Tab remains trapped in the dialog; Escape closes and restores focus.
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
    })
    await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
    })
    assert.equal(
        await evaluate(`${dialog}.contains(document.activeElement)`),
        true,
    )
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
    })
    await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
    })
    await wait(`!${dialog}`)
    await click('Users (2)')
    await send('Emulation.setDeviceMetricsOverride', {
        width: 375,
        height: 812,
        deviceScaleFactor: 1,
        mobile: true,
    })
    await delay(100)
    assert.equal(
        await evaluate('document.documentElement.scrollWidth <= innerWidth'),
        true,
        'Mobile overflow is contained within the table',
    )
    await click('Manage roles for jessie@clinic.test')
    await wait(dialogText('Jessie Doe'))
    assert.equal(
        await evaluate('document.documentElement.scrollWidth <= innerWidth'),
        true,
    )
    await click('Close role editor')
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
    })
    detailFailure = 404
    await click('Manage roles for jessie@clinic.test')
    await wait(dialogText('User details unavailable.'))
    detailFailure = 0
    await click('Retry user details')
    await wait(dialogText('Jessie Doe'))
    await click('Close role editor')
    holdDetail = true
    await click('Manage roles for jessie@clinic.test')
    for (let i = 0; i < 100 && !releaseDetail; i++) await delay(20)
    assert.ok(releaseDetail)
    await click('Close role editor')
    holdDetail = false
    releaseDetail()
    await delay(200)
    assert.equal(await evaluate(`Boolean(${dialog})`), false)
    for (const status of [500, 422]) {
        listFailure = status
        await click('Refresh users and roles')
        await wait(text('failed-user-list'))
        assert.equal(
            await evaluate(`${panel}.querySelectorAll('tbody tr').length`),
            0,
        )
        listFailure = 0
        await click('Retry management data')
        await wait(text('jessie@clinic.test'))
    }
    // Self-demotion refreshes the canonical session and removes protected UI.
    await click('Manage roles for admin@clinic.test')
    await wait(dialogText('Clinic Admin'))
    assert.equal(await evaluate(`${checkbox('admin')}.disabled`), false)
    await toggle('admin')
    await toggle('dentist')
    await click('Review role changes')
    await wait(dialogText('Removing admin will close management access.'))
    await click('Confirm role changes')
    await wait(`!(${nav}) && !(${panel}) && !(${dialog})`)
    assert.deepEqual(
        users[0].roles.map(role => role.slug),
        ['dentist'],
    )
    users[0].roles = [roles[0]]
    for (const mode of [
        'dentist',
        'hygienist',
        'receptionist',
        'billing',
        'auditor',
        'wildcard',
        'name-only',
        'string-role',
        'guest',
    ]) {
        actor = mode
        const before = reads().length
        await reload(false)
        assert.equal(await evaluate(`Boolean(${nav})`), false, mode)
        assert.equal(await evaluate(`Boolean(${panel})`), false, mode)
        assert.equal(reads().length, before, mode)
    }
    actor = 'admin'
    await reload()
    const originalUsers = users
    users = []
    await click('Refresh users and roles')
    await wait(text('No application users found.'))
    users = originalUsers
    await click('Refresh users and roles')
    await wait(text('jessie@clinic.test'))
    revoke = true
    await click('Refresh users and roles')
    await wait(`!(${nav}) && !(${panel})`)
    assert.equal(
        await evaluate(
            `document.body.innerText.includes('jessie@clinic.test')`,
        ),
        false,
    )
    assert.deepEqual(browser.errors, [])
    console.log(
        'User management browser checks passed: filters, six roles, preselection, confirmations, updates/removal, last-admin guard, 422/404/errors/retry, drag/drop, keyboard/focus, mobile, stale cancellation, self-demotion and non-admin/revoked access.',
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
