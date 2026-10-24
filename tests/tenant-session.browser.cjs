// Every backend request is intercepted; this test changes no live clinic data.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.TENANT_SESSION_TEST_URL || 'http://localhost:3000'
const apiOrigin =
    process.env.TENANT_SESSION_TEST_API_URL || 'http://localhost:8000'
const requests = []
let clinicId = 37,
    sessionFailure = 0,
    actionFailure = 0,
    memberOnly = false,
    ordinaryDenial = false
let missingMembership = false,
    membershipFailure = 0,
    browser
const clinic = () => ({
    id: clinicId,
    name: `Verified Clinic ${clinicId}`,
    slug: 'default-clinic',
    active: true,
})
const onRequest = async ({ method, url, payload, headers }) => {
    requests.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        payload,
        headers,
    })
    if (url.pathname === '/api/user')
        return sessionFailure
            ? { status: sessionFailure }
            : {
                  data: {
                      id: 91,
                      name: 'Clinic member',
                      current_tenant_id: clinicId,
                      email_verified_at: '2026-10-21',
                      roles: memberOnly
                          ? []
                          : [{ id: 7, slug: 'admin', name: 'Administrator' }],
                      permissions: memberOnly
                          ? []
                          : ['treatments.view', 'appointments.view'],
                      role: 'Platform Super Admin',
                      isSuperAdmin: true,
                      abilities: ['*'],
                  },
              }
    if (url.pathname === '/api/tenants')
        return membershipFailure
            ? { status: membershipFailure }
            : {
                  data: {
                      tenants: [
                          {
                              id: 2,
                              name: 'First Membership Clinic',
                              slug: 'other',
                              active: true,
                          },
                          ...(missingMembership ? [] : [clinic()]),
                      ],
                  },
              }
    if (url.pathname === '/api/treatments')
        return {
            data: {
                treatments: [
                    {
                        id: 1,
                        name: `Cleaning in clinic ${clinicId}`,
                        category: 'Dental',
                        description: null,
                        duration_minutes: 30,
                        price: '50.00',
                        active: true,
                    },
                ],
            },
        }
    if (url.pathname === '/api/appointments') {
        if (actionFailure) {
            sessionFailure = actionFailure
            return { status: actionFailure }
        }
        if (ordinaryDenial) return { status: 403, message: 'Operation denied.' }
        return { data: { appointments: [] } }
    }
    if (url.pathname === '/logout') {
        sessionFailure = 401
        return {}
    }
    throw new Error(`Unexpected API request: ${method} ${url.pathname}`)
}
;(async () => {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, wait, click, delay } = browser
    const text = value =>
        `document.body?.innerText.includes(${JSON.stringify(value)})`
    const nav = tab => `document.querySelector('a[href="/?tab=${tab}"]')`
    const navigateTab = async tab => {
        await wait(nav(tab))
        await evaluate(`${nav(tab)}.click()`)
    }
    const reload = () =>
        send('Page.navigate', {
            url: `${origin}/?tab=treatments&tenant_id=2&tenantId=2`,
        })
    await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `localStorage.setItem('tenant_id', '2'); localStorage.setItem('auth:user', JSON.stringify({ current_tenant_id: 2, permissions: ['*'] }));`,
    })
    await reload()
    await wait(text('Cleaning in clinic 37'))
    assert.equal(
        await evaluate(
            `document.querySelector('[aria-label="Current clinic"]').textContent`,
        ),
        'Verified Clinic 37',
    )
    assert.equal(await evaluate(text('Clinic Admin')), true)
    assert.equal(await evaluate(text('Platform Super Admin')), false)
    assert.equal(await evaluate(text('First Membership Clinic')), false)
    assert.equal(await evaluate(text('Avionna Clinic')), false)
    assert.equal(
        await evaluate(
            `Boolean(document.querySelector('[aria-label="Select clinic"], [aria-label="Select tenant"]'))`,
        ),
        false,
    )

    // Policy denials recheck the session but do not sign out or select a clinic.
    ordinaryDenial = true
    const checksBefore = requests.filter(item => item.path === '/api/user')
        .length
    await navigateTab('calendar')
    await wait(text('Operation denied.'))
    await delay(500)
    assert.ok(
        requests.filter(item => item.path === '/api/user').length >
            checksBefore,
    )
    assert.equal(await evaluate(text('Clinic access unavailable')), false)
    assert.equal(await evaluate(`location.pathname`), '/')
    ordinaryDenial = false
    await navigateTab('treatments')
    await wait(text('Cleaning in clinic 37'))

    // Membership revocation is discovered centrally from a real API 403.
    actionFailure = 403
    await navigateTab('calendar')
    await wait(text('Clinic access unavailable'))
    assert.equal(
        await evaluate(`Boolean(document.querySelector('nav'))`),
        false,
    )
    assert.equal(await evaluate(text('Cleaning in clinic 37')), false)
    assert.equal(await evaluate(`location.pathname`), '/')
    const deniedRequests = requests.length
    await delay(400)
    assert.equal(
        requests.length,
        deniedRequests,
        'No retry or fallback loop after clinic denial',
    )

    // Recovery uses fresh server context, with no cached clinic list or grants.
    actionFailure = sessionFailure = 0
    clinicId = 42
    await click('Try again')
    await wait(text('Verified Clinic 42'))
    await navigateTab('treatments')
    await wait(text('Cleaning in clinic 42'))
    assert.equal(await evaluate(text('Cleaning in clinic 37')), false)

    // An account with membership alone gets a clinic shell and sign-out only.
    memberOnly = true
    await evaluate(`window.dispatchEvent(new Event('api:forbidden'))`)
    await wait(text('No modules are available'))
    assert.equal(
        await evaluate(`document.querySelectorAll('aside nav a').length`),
        0,
    )
    assert.equal(await evaluate(text('Verified Clinic 42')), true)
    await click('Account menu')
    await click('Log out')
    await wait(`location.pathname === '/login'`)
    assert.equal(await evaluate(`localStorage.getItem('auth:user')`), null)

    // Initial tenant denial never falls back to discovery or a different ID.
    memberOnly = false
    sessionFailure = 403
    requests.length = 0
    await reload()
    await wait(text('Clinic access unavailable'))
    assert.deepEqual(
        requests.map(item => item.path),
        ['/api/user'],
    )
    await send('Page.navigate', { url: `${origin}/forgot-password` })
    await wait(`document.querySelector('input[type="email"]')`)
    assert.equal(await evaluate(text('Clinic access unavailable')), false)
    await send('Page.navigate', { url: `${origin}/password-reset/test-token` })
    await wait(`document.querySelector('input[type="password"]')`)
    assert.equal(await evaluate(text('Clinic access unavailable')), false)
    await reload()
    await wait(text('Clinic access unavailable'))
    await click('Sign out')
    await wait(`location.pathname === '/login'`)

    // Failed refreshes cannot leave previously granted clinic data visible.
    sessionFailure = 0
    await reload()
    await wait(text('Cleaning in clinic 42'))
    sessionFailure = 500
    await evaluate(`window.dispatchEvent(new Event('api:forbidden'))`)
    await wait(text('Unable to load your clinic'))
    assert.equal(await evaluate(text('Cleaning in clinic 42')), false)
    sessionFailure = 0
    await click('Try again')
    await wait(text('Cleaning in clinic 42'))

    // Missing membership metadata and discovery failures block safely.
    missingMembership = true
    await evaluate(`window.dispatchEvent(new Event('api:forbidden'))`)
    await wait(text('Unable to load your clinic'))
    missingMembership = false
    membershipFailure = 500
    const membershipAttempts = requests.filter(
        item => item.path === '/api/tenants',
    ).length
    await click('Try again')
    for (
        let attempt = 0;
        attempt < 100 &&
        requests.filter(item => item.path === '/api/tenants').length ===
            membershipAttempts;
        attempt++
    )
        await delay(20)
    assert.ok(
        requests.filter(item => item.path === '/api/tenants').length >
            membershipAttempts,
    )
    await wait(text('Unable to load your clinic'))
    await wait(
        `Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Try again' && !button.disabled)`,
    )
    membershipFailure = 0
    await click('Try again')
    await wait(text('Cleaning in clinic 42'))

    actionFailure = 401
    await navigateTab('calendar')
    await wait(`location.pathname === '/login'`)
    for (const request of requests) {
        assert.ok(
            !Object.keys(request.headers).some(
                key => key.toLowerCase() === 'x-tenant-id',
            ),
        )
        assert.ok(
            !('tenant_id' in request.query) && !('tenantId' in request.query),
        )
        assert.ok(
            !request.payload ||
                (!('tenant_id' in request.payload) &&
                    !('tenantId' in request.payload)),
        )
    }
    assert.deepEqual(browser.errors, [])
    console.log(
        'Clinic session browser checks passed: verified shell, scoped grants, revocation, recovery, cache reset, 401/403/500 and no client tenant selection.',
    )
})()
    .catch(error => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await browser?.close()
    })
