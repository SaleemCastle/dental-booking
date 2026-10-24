// Small CDP harness for mocked API regression checks. Requires Node 22+.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

exports.openBrowser = async ({ origin, apiOrigin, onRequest }) => {
    const executable = [
        process.env.BROWSER_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ]
        .filter(Boolean)
        .find(candidate => fs.existsSync(candidate))
    assert.ok(
        executable && typeof WebSocket !== 'undefined',
        'Use Node 22+ with Chrome/Edge/Chromium or set BROWSER_PATH.',
    )
    const profile = fs.mkdtempSync(
        path.join(os.tmpdir(), 'dental-browser-check-'),
    )
    const browser = spawn(
        executable,
        [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--remote-debugging-port=0',
            `--user-data-dir=${profile}`,
            'about:blank',
        ],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    )
    let startupError = ''
    browser.stderr.on('data', chunk => {
        startupError += chunk.toString()
    })
    let socket, send
    const errors = []
    const cancelledRequests = new Set()
    const cleanup = async () => {
        if (socket?.readyState === WebSocket.OPEN) {
            try {
                await send('Browser.close')
            } catch {}
        }
        socket?.close()
        browser.kill()
        const target = path.resolve(profile)
        assert.ok(
            path.dirname(target) === path.resolve(os.tmpdir()) &&
                path.basename(target).startsWith('dental-browser-check-'),
            'Unexpected browser profile path',
        )
        try {
            fs.rmSync(target, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 100,
            })
        } catch {}
    }
    try {
        let port
        for (let attempt = 0; attempt < 150; attempt++) {
            const portFile = path.join(profile, 'DevToolsActivePort')
            if (fs.existsSync(portFile)) {
                port = fs.readFileSync(portFile, 'utf8').split('\n')[0]
                break
            }
            // Windows browser launchers may exit successfully after starting
            // the actual browser process; keep waiting for its debug endpoint.
            if (browser.exitCode !== null && browser.exitCode !== 0)
                throw new Error(
                    `Browser exited with ${browser.exitCode}: ${startupError}`,
                )
            await delay(100)
        }
        assert.ok(port, 'Browser did not start')
        const targets = await (
            await fetch(`http://127.0.0.1:${port}/json`)
        ).json()
        socket = new WebSocket(
            targets.find(target => target.type === 'page').webSocketDebuggerUrl,
        )
        await new Promise((resolve, reject) => {
            socket.onopen = resolve
            socket.onerror = reject
        })
        let sequence = 0
        const pending = new Map()
        send = (method, params = {}) =>
            new Promise((resolve, reject) => {
                const id = ++sequence
                pending.set(id, { resolve, reject })
                socket.send(JSON.stringify({ id, method, params }))
            })
        socket.onclose = () => {
            for (const waiter of pending.values())
                waiter.reject(new Error('Browser connection closed'))
            pending.clear()
        }
        socket.onmessage = async event => {
            const item = JSON.parse(event.data)
            if (item.id) {
                const waiter = pending.get(item.id)
                if (!waiter) return
                pending.delete(item.id)
                item.error
                    ? waiter.reject(new Error(JSON.stringify(item.error)))
                    : waiter.resolve(item.result)
            } else if (item.method === 'Runtime.exceptionThrown')
                errors.push(
                    item.params.exceptionDetails.exception?.description ??
                        item.params.exceptionDetails.text,
                )
            else if (
                item.method === 'Network.loadingFailed' &&
                item.params.canceled
            )
                cancelledRequests.add(item.params.requestId)
            else if (item.method === 'Fetch.requestPaused') {
                const { requestId, request, networkId } = item.params
                try {
                    const result =
                        request.method === 'OPTIONS'
                            ? { status: 204 }
                            : await onRequest({
                                  method: request.method,
                                  headers: request.headers,
                                  url: new URL(request.url),
                                  payload: request.postData
                                      ? JSON.parse(request.postData)
                                      : undefined,
                              })
                    const {
                        status = 200,
                        data = null,
                        meta,
                        errors: fields = {},
                        message = 'OK',
                        requestId: responseRequestId,
                    } = result
                    await send('Fetch.fulfillRequest', {
                        requestId,
                        responseCode: status,
                        responseHeaders: [
                            { name: 'Content-Type', value: 'application/json' },
                            {
                                name: 'Access-Control-Allow-Origin',
                                value: origin,
                            },
                            {
                                name: 'Access-Control-Allow-Credentials',
                                value: 'true',
                            },
                            {
                                name: 'Access-Control-Allow-Headers',
                                value:
                                    'Content-Type, X-Requested-With, X-XSRF-TOKEN, Accept',
                            },
                            {
                                name: 'Access-Control-Allow-Methods',
                                value: 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
                            },
                        ],
                        body:
                            status === 204
                                ? ''
                                : Buffer.from(
                                      JSON.stringify({
                                          success: status < 400,
                                          statusCode: status,
                                          code:
                                              status < 400
                                                  ? 'OK'
                                                  : status === 422
                                                  ? 'VALIDATION_ERROR'
                                                  : 'ERROR',
                                          message,
                                          data,
                                          errors: fields,
                                          meta,
                                          requestId: responseRequestId,
                                      }),
                                  ).toString('base64'),
                    })
                } catch (error) {
                    // A delayed fixture can finish after the application aborts
                    // its XHR. Chrome has already discarded that interception.
                    if (
                        cancelledRequests.has(networkId) &&
                        /Invalid InterceptionId/.test(error.message)
                    )
                        return
                    errors.push(error.stack)
                    await send('Fetch.failRequest', {
                        requestId,
                        errorReason: 'Failed',
                    }).catch(() => {})
                }
            }
        }
        await send('Runtime.enable')
        await send('Page.enable')
        await send('Network.enable')
        await send('Fetch.enable', {
            patterns: [{ urlPattern: `${apiOrigin}/*` }],
        })
        await send('Emulation.setTimezoneOverride', {
            timezoneId: 'America/Bogota',
        })
        await send('Emulation.setDeviceMetricsOverride', {
            width: 1440,
            height: 1100,
            deviceScaleFactor: 1,
            mobile: false,
        })
        const evaluate = async expression => {
            const result = await send('Runtime.evaluate', {
                expression,
                returnByValue: true,
                awaitPromise: true,
            })
            if (result.exceptionDetails)
                throw new Error(
                    result.exceptionDetails.exception?.description ??
                        result.exceptionDetails.text,
                )
            return result.result.value
        }
        const wait = async (expression, timeout = 30000) => {
            for (
                let attempt = 0;
                attempt < Math.ceil(timeout / 100);
                attempt++
            ) {
                if (await evaluate(`Boolean(${expression})`)) return
                await delay(100)
            }
            throw new Error(
                `Timed out: ${expression}\n${await evaluate(
                    'document.body.innerText',
                )}\n${errors.join('\n')}`,
            )
        }
        const click = async label => {
            const expression = `Array.from(document.querySelectorAll('button')).find(button => (button.getAttribute('aria-label') === ${JSON.stringify(
                label,
            )} || button.textContent.trim() === ${JSON.stringify(
                label,
            )}) && !button.matches(':disabled'))`
            await wait(expression)
            await evaluate(`${expression}.click()`)
        }
        const select = (selector, value) =>
            evaluate(
                `(() => { const element = document.querySelector(${JSON.stringify(
                    selector,
                )}); element.value = ${JSON.stringify(
                    value,
                )}; element.dispatchEvent(new Event('change', { bubbles: true })); })()`,
            )
        return {
            send,
            evaluate,
            wait,
            click,
            select,
            delay,
            errors,
            cancelledRequests,
            close: cleanup,
        }
    } catch (error) {
        await cleanup()
        throw error
    }
}
