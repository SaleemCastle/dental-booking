// All backend traffic is intercepted; no live clinic is created or changed.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.PLATFORM_TEST_URL || 'http://localhost:3000'
const apiOrigin = process.env.PLATFORM_TEST_API_URL || 'http://localhost:8000'
const requests = []
let operator = true,
    signedIn = true,
    clinicMode = false,
    provisionFailure = 422,
    browser
let tenant = {
    id: 51,
    name: 'Independent Clinic',
    slug: 'independent',
    active: true,
    status: 'active',
    timezone: 'America/Bogota',
    currency: 'COP',
    contact_email: 'clinic@example.com',
}
const onRequest = async ({ method, url, payload, headers }) => {
    requests.push({ method, path: url.pathname, payload, headers })
    if (url.pathname === '/api/user')
        return signedIn
            ? {
                  data: {
                      id: 91,
                      name: 'Account',
                      current_tenant_id: clinicMode ? 51 : undefined,
                      roles: [{ slug: 'admin' }],
                      permissions: clinicMode ? ['settings.view'] : ['*'],
                  },
              }
            : { status: 401 }
    if (url.pathname === '/sanctum/csrf-cookie') return {}
    if (url.pathname === '/api/tenants')
        return {
            data: {
                tenants: [{ ...tenant, id: 2, name: 'Foreign Clinic' }, tenant],
            },
        }
    if (url.pathname === '/login') {
        signedIn = true
        return {}
    }
    if (url.pathname.startsWith('/api/platform/') && !operator)
        return { status: 403 }
    if (url.pathname === '/api/platform/tenants') {
        if (method === 'POST') {
            if (provisionFailure)
                return {
                    status: provisionFailure,
                    message:
                        provisionFailure === 422
                            ? 'Please correct admin email.'
                            : 'Temporary failure.',
                    errors: { 'admin.email': ['Use a new identity.'] },
                }
            return { status: 200, data: { tenant, initial_admin_id: 72 } }
        }
        return {
            data: { tenants: [tenant] },
            meta: { pagination: { currentPage: 1, lastPage: 1 } },
        }
    }
    if (url.pathname === '/api/platform/tenants/51') return { data: { tenant } }
    if (url.pathname === '/api/platform/tenants/51/status') {
        tenant = {
            ...tenant,
            active: payload.status === 'active',
            status: payload.status,
        }
        return { data: { tenant } }
    }
    throw new Error(`Unexpected clinic request: ${method} ${url.pathname}`)
}
;(async () => {
    browser = await openBrowser({ origin, apiOrigin, onRequest })
    const { send, evaluate, wait, click } = browser
    const text = value =>
        `document.body?.innerText.includes(${JSON.stringify(value)})`
    const navigate = path => send('Page.navigate', { url: `${origin}${path}` })
    await navigate('/platform')
    await wait(text('Provision a clinic'))
    await evaluate(
        `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Independent Clinic')).click()`,
    )
    await wait(text('Suspend clinic'))
    await click('Suspend clinic')
    await click('Confirm suspension')
    await wait(text('Independent Clinic is suspended.'))
    await click('Activate clinic')
    await click('Confirm activation')
    await wait(text('Independent Clinic is active.'))
    const fill = () =>
        evaluate(
            `(() => { const values = { name:'New Clinic', slug:'new-clinic', contact_email:'new@example.com', 'admin.name':'New Admin', 'admin.email':'admin@example.com', 'admin.password':'Unique-password-123' }; for (const [name,value] of Object.entries(values)) document.querySelector('input[name="'+name+'"]').value = value; })()`,
        )
    await fill()
    await click('Provision clinic')
    await wait(text('Use a new identity.'))
    assert.equal(
        await evaluate(
            `document.querySelector('input[name="admin.email"]').matches(':disabled')`,
        ),
        false,
    )
    provisionFailure = 500
    await click('Provision clinic')
    await wait(text('Temporary failure.'))
    assert.equal(
        await evaluate(
            `document.querySelector('input[name="admin.email"]').matches(':disabled')`,
        ),
        true,
    )
    const original = requests
        .filter(request => request.method === 'POST')
        .at(-1).payload
    provisionFailure = 0
    await click('Retry original request')
    await wait(text('Original provisioning recovered'))
    assert.deepEqual(
        requests.filter(request => request.method === 'POST').at(-1).payload,
        original,
    )
    assert.equal(
        await evaluate(
            `document.querySelector('input[name="admin.password"]').value`,
        ),
        '',
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
    operator = false
    await navigate('/platform')
    await wait(text('An active platform operator grant is required.'))
    assert.equal(
        await evaluate(text('Provision a clinic')),
        false,
        'Clinic admin wildcard grants no platform controls',
    )
    assert.equal(
        await evaluate(text('Independent Clinic')),
        false,
        'No cached profile after revocation',
    )
    operator = true
    await click('Retry access check')
    await wait(text('Provision a clinic'))
    signedIn = false
    await navigate('/platform')
    await wait(text('Platform operator sign in'))
    assert.equal(await evaluate('location.pathname'), '/platform/login')
    await evaluate(
        `(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; for (const [type,value] of [['email','operator@example.com'],['password','Operator-secret-123']]) { const input = document.querySelector('input[type="'+type+'"]'); setter.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); } })()`,
    )
    await click('Login')
    await wait(text('Provision a clinic'))
    assert.equal(await evaluate('location.pathname'), '/platform')
    assert.ok(
        requests.every(
            request =>
                !Object.keys(request.headers).some(
                    key => key.toLowerCase() === 'x-tenant-id',
                ),
        ),
    )
    assert.ok(
        !requests.some(request => request.path === '/api/tenants'),
        'No clinic membership discovery in platform workflow',
    )
    clinicMode = true
    operator = false
    const beforeClinic = requests.length
    await navigate('/?tab=settings&tenant_id=2')
    await wait(text('Clinic profile and preferences'))
    await wait(text('America/Bogota'))
    assert.equal(await evaluate(text('Foreign Clinic')), false)
    assert.equal(
        await evaluate(
            text('Clinic profile updates are currently unavailable.'),
        ),
        true,
    )
    assert.equal(await evaluate(text('Provision a clinic')), false)
    assert.equal(await evaluate(text('Suspend clinic')), false)
    assert.ok(
        !requests
            .slice(beforeClinic)
            .some(request => request.path.startsWith('/api/platform/')),
        'Clinic settings never probe platform APIs',
    )
    assert.deepEqual(browser.errors, [])
    console.log(
        'Platform browser checks passed: access separation, profiles, status, validation, exact retries, password clearing, mobile and login redirect.',
    )
})()
    .catch(error => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await browser?.close()
    })
