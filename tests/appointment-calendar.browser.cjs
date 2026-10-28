// Advanced scheduling regression checks with intercepted API responses.
const assert = require('node:assert/strict')
const { openBrowser } = require('./browser-session.cjs')
const origin = process.env.APPOINTMENT_TEST_URL || 'http://localhost:3000'
const apiOrigin =
    process.env.APPOINTMENT_TEST_API_URL || 'http://localhost:8000'
const day = '2026-11-03'
const providers = [
    { id: 21, name: 'Alex Rivera' },
    { id: 22, name: 'Sam Lee' },
]
const rooms = [
    {
        id: 51,
        name: 'Room A',
        chairs: [{ id: 41, room_id: 51, name: 'Chair A' }],
    },
]
const makeRow = (id, dentist_id, startsAt, status = 'scheduled') => ({
    id,
    dentist_id,
    startsAt,
    status,
    patient_id: 11,
    room_id: 51,
    chair_id: 41,
    treatment_id: null,
    duration_minutes: 30,
    appointment_type: 'Consultation',
    description: 'Visit',
    patientName: 'Jane Doe',
    dentistName: providers.find(item => item.id === dentist_id).name,
    roomName: 'Room A',
    chairName: 'Chair A',
})
const rows = [
    makeRow(11, 21, `${day}T09:00:00Z`),
    makeRow(12, 22, `${day}T09:00:00Z`),
    makeRow(13, 21, `${day}T09:00:00Z`, 'cancelled'),
    makeRow(14, 21, '2026-11-02T23:45:00Z'),
    makeRow(15, 21, `${day}T23:45:00Z`),
]
let sessionMode = 'staff',
    listFailure = false,
    availabilityFailure = false,
    rejectWrite = false
const writes = [],
    requests = []
const availability = id => ({
    dentist_id: id,
    timezone: 'UTC',
    configured: id === 21,
    weekly_hours:
        id === 21
            ? [{ day_of_week: 2, start_time: '09:00', end_time: '17:00' }]
            : [],
    breaks:
        id === 21
            ? [{ day_of_week: 2, start_time: '12:00', end_time: '13:00' }]
            : [],
    exceptions:
        id === 21
            ? [
                  { date: '2026-11-04', working_hours: [], breaks: [] },
                  {
                      date: '2026-11-05',
                      working_hours: [
                          { start_time: '10:00', end_time: '15:00' },
                      ],
                      breaks: [],
                  },
              ]
            : [],
})

async function main() {
    const browser = await openBrowser({
        origin,
        apiOrigin,
        onRequest: async request => {
            const { url, method, payload } = request
            requests.push(request)
            if (url.pathname === '/api/user')
                return {
                    data: {
                        id: 90,
                        current_tenant_id: 37,
                        email_verified_at: day,
                        roles: [{ slug: 'staff' }],
                        permissions: [
                            'appointments.view',
                            'patients.view',
                            ...(sessionMode === 'viewer'
                                ? []
                                : [
                                      'appointments.create',
                                      'appointments.update',
                                  ]),
                            ...(sessionMode === 'no-availability'
                                ? []
                                : ['provider_availabilities.view']),
                        ],
                    },
                }
            if (url.pathname === '/api/tenants')
                return {
                    data: {
                        tenants: [
                            {
                                id: 37,
                                name: 'Test Clinic',
                                slug: 'test',
                                active: true,
                            },
                        ],
                    },
                }
            if (url.pathname === '/api/dentists')
                return { data: { dentists: providers } }
            if (url.pathname === '/api/appointment-locations')
                return { data: { rooms } }
            if (url.pathname === '/api/patients')
                return {
                    data: {
                        patients: [
                            { id: 11, firstName: 'Jane', lastName: 'Doe' },
                        ],
                    },
                }
            if (/^\/api\/dentists\/\d+\/availability$/.test(url.pathname))
                return availabilityFailure
                    ? { status: 500, message: 'Availability unavailable.' }
                    : {
                          data: {
                              availability: availability(
                                  Number(url.pathname.split('/')[3]),
                              ),
                          },
                      }
            if (url.pathname === '/api/appointments' && method === 'GET')
                return listFailure
                    ? { status: 500, message: 'Calendar unavailable.' }
                    : {
                          data: {
                              appointments: rows.filter(row =>
                                  row.startsAt.startsWith(
                                      url.searchParams.get('date'),
                                  ),
                              ),
                          },
                      }
            if (
                ['POST', 'PATCH'].includes(method) &&
                /^\/api\/appointments(?:\/\d+)?$/.test(url.pathname)
            ) {
                writes.push(request)
                if (rejectWrite)
                    return {
                        status: 422,
                        message: 'Provider is unavailable.',
                        errors: {
                            dentist_id: ['Outside provider working hours.'],
                            appointment_date_time: ['Choose another time.'],
                        },
                    }
                const row =
                    method === 'PATCH'
                        ? rows.find(
                              row =>
                                  row.id === Number(url.pathname.split('/')[3]),
                          )
                        : makeRow(
                              16,
                              payload.dentist_id,
                              payload.appointment_date_time,
                          )
                Object.assign(row, payload, {
                    startsAt: payload.appointment_date_time ?? row.startsAt,
                })
                if (method === 'POST') rows.push(row)
                return { data: { appointment: row } }
            }
            if (/^\/api\/appointments\/\d+$/.test(url.pathname))
                return {
                    data: {
                        appointment: rows.find(
                            row =>
                                row.id === Number(url.pathname.split('/')[3]),
                        ),
                    },
                }
            throw new Error(`Unexpected API request: ${method} ${url.pathname}`)
        },
    })
    const { send, evaluate, wait, click, select } = browser
    const input = (selector, value) =>
        evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(
            value,
        )});
        el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
    const appointment = id =>
        `document.querySelector('[aria-label^="View appointment ${id} "]')`
    const close = async () => {
        await click('Close appointment')
        await wait(`!document.querySelector('[role="dialog"]')`)
    }
    const load = async () => {
        await send('Page.navigate', { url: `${origin}/?tab=calendar` })
        await wait(`document.querySelector('#schedule-date')`)
        await input('#schedule-date', day)
        await wait(appointment(11))
    }
    try {
        await load()
        assert.ok(
            await evaluate(`Boolean(${appointment(14)} && ${appointment(15)})`),
            'Overnight carry-in and late appointments are visible',
        )
        assert.equal(
            await evaluate(`${appointment(11)}.style.width`),
            'calc(50% - 6px)',
        )
        assert.notEqual(
            await evaluate(`${appointment(11)}.style.left`),
            await evaluate(`${appointment(13)}.style.left`),
        )
        await select('#schedule-provider', '21')
        await wait(
            `document.querySelector('[aria-label="Working 09:00 to 17:00"]')`,
        )
        assert.ok(
            await evaluate(
                `Boolean(document.querySelector('[aria-label="Break 12:00 to 13:00"]'))`,
            ),
        )
        assert.equal(await evaluate(`${appointment(12)} !== null`), false)
        await click('Week')
        await wait(
            `document.querySelector('[aria-label="Week calendar, times in UTC"] [aria-label="Working 10:00 to 15:00"]')`,
        )
        assert.equal(
            await evaluate(
                `document.querySelectorAll('[aria-label="Provider unavailable all day"]').length`,
            ),
            5,
        )
        assert.ok(
            await evaluate(
                `Boolean(document.querySelector('[aria-label="Break 12:00 to 13:00"]'))`,
            ),
            'Week view shades recurring breaks',
        )
        assert.equal(
            await evaluate(
                `document.querySelectorAll('[aria-label^="View appointment 15 "]').length`,
            ),
            2,
            'Overnight appointment renders on both dates',
        )
        await click('Next week')
        await wait(
            `document.querySelector('#schedule-date').value === '2026-11-10' && document.body.innerText.includes('No appointments scheduled for this week.')`,
        )
        await click('Previous week')
        await wait(appointment(11))
        await select('#schedule-room', '51')
        await select('#schedule-chair', '41')
        await click(`Create appointment ${day} 10:30`)
        await wait(
            `document.querySelector('#appointment-patient_id option[value="11"]')`,
        )
        assert.deepEqual(
            await evaluate(
                `['appointment_date_time', 'dentist_id', 'room_id', 'chair_id'].map(field => document.querySelector('#appointment-' + field).value)`,
            ),
            [`${day}T10:30`, '21', '51', '41'],
        )
        await select('#appointment-patient_id', '11')
        await input('#appointment-appointment_type', 'Consultation')
        await input('#appointment-description', 'Context booking')
        rejectWrite = true
        await evaluate(
            `document.querySelector('[role="dialog"] form').requestSubmit()`,
        )
        await wait(
            `document.querySelector('#appointment-dentist_id').getAttribute('aria-invalid') === 'true' && document.querySelector('#appointment-appointment_date_time').getAttribute('aria-invalid') === 'true'`,
        )
        assert.equal(rows.length, 5)
        assert.ok(
            await evaluate(
                `document.querySelector('[role="dialog"] [role="alert"]').textContent.includes('Choose another time.')`,
            ),
        )
        rejectWrite = false
        await evaluate(
            `document.querySelector('[role="dialog"] form').requestSubmit()`,
        )
        await wait(
            `document.querySelector('[role="dialog"]')?.textContent.includes('Appointment details') && ${appointment(
                16,
            )}`,
        )
        assert.equal(
            writes[1].payload.appointment_date_time,
            `${day}T10:30:00.000Z`,
        )
        await click('Edit appointment')
        await wait(`document.querySelector('#appointment-description')`)
        await input('#appointment-appointment_date_time', '2026-11-05T10:30')
        await evaluate(
            `document.querySelector('[role="dialog"] form').requestSubmit()`,
        )
        await wait(
            `document.querySelector('[role="dialog"]')?.textContent.includes('Appointment details')`,
        )
        await close()
        assert.equal(
            await evaluate(
                `document.querySelector('[aria-label^="View appointment 16 "]').closest('[data-calendar-date]')?.getAttribute('data-calendar-date')`,
            ),
            '2026-11-05',
        )
        await click('Day')
        await wait(
            `document.querySelector('[aria-label="Day calendar, times in UTC"]')`,
        )
        await input('#schedule-date', day)
        await wait(appointment(11))
        assert.equal(
            await evaluate(`${appointment(16)} !== null`),
            false,
            'Moving an appointment refreshes both day and week caches',
        )
        await select('#schedule-provider', '22')
        await wait(
            `document.body.innerText.includes('No working-hours configuration is saved')`,
        )
        await select('#schedule-status', 'completed')
        await wait(
            `document.body.innerText.includes('No appointments match these filters.')`,
        )
        await select('#schedule-status', '')
        await select('#schedule-provider', '21')
        availabilityFailure = true
        await click('Refresh')
        await wait(
            `document.body.innerText.includes('Availability unavailable.')`,
        )
        assert.equal(
            await evaluate(
                `document.querySelector('[aria-label="Working 09:00 to 17:00"]') !== null`,
            ),
            false,
            'Failed availability refresh hides stale shading',
        )
        availabilityFailure = false
        await click('Retry')
        await wait(
            `document.querySelector('[aria-label="Working 09:00 to 17:00"]')`,
        )
        listFailure = true
        await click('Refresh')
        await wait(`document.body.innerText.includes('Calendar unavailable.')`)
        assert.equal(await evaluate(`${appointment(11)} !== null`), false)
        listFailure = false
        await click('Try again')
        await wait(appointment(11))
        await send('Emulation.setDeviceMetricsOverride', {
            width: 390,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true,
        })
        assert.ok(
            await evaluate(
                `document.documentElement.scrollWidth <= window.innerWidth`,
            ),
            'Mobile layout stays within the viewport',
        )
        await click('Week')
        await wait(
            `document.querySelector('[aria-label="Week calendar, times in UTC"]')`,
        )
        assert.ok(
            await evaluate(
                `(() => { const el = document.querySelector('[aria-label="Week calendar, times in UTC"]'); return el.scrollWidth > el.clientWidth && document.documentElement.scrollWidth <= window.innerWidth; })()`,
            ),
        )
        await click('View day 2026-11-05')
        await wait(
            `document.querySelector('#schedule-date').value === '2026-11-05' && document.querySelector('[aria-label="Day calendar, times in UTC"]')`,
        )
        await click('Today')
        assert.equal(
            await evaluate(`document.querySelector('#schedule-date').value`),
            new Date().toISOString().slice(0, 10),
        )
        sessionMode = 'no-availability'
        const availabilityReads = () =>
            requests.filter(request =>
                request.url.pathname.endsWith('/availability'),
            ).length
        const before = availabilityReads()
        await load()
        await select('#schedule-provider', '21')
        await wait(
            `document.body.innerText.includes('Working hours require availability viewing permission.')`,
        )
        assert.equal(
            availabilityReads(),
            before,
            'Booking permission does not grant availability access',
        )
        sessionMode = 'viewer'
        await load()
        assert.equal(
            await evaluate(
                `Array.from(document.querySelectorAll('button')).some(el => el.textContent.trim() === 'Book appointment')`,
            ),
            false,
        )
        assert.equal(
            await evaluate(
                `document.querySelector('[aria-label="Create appointment ${day} 10:30"]').disabled`,
            ),
            true,
        )
        assert.deepEqual(browser.errors, [])
        console.log(
            'Advanced calendar browser checks passed: day/week, availability/exceptions, overlaps, midnight, context booking/edit, validation, filters, navigation, errors, permissions, and mobile layout.',
        )
    } finally {
        await browser.close()
    }
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
