const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const crypto = require('node:crypto')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { patchOdontogram } = require('../scripts/patch-odontogram.cjs')
const { metadata } = require('./dental-chart-fixtures.cjs')
const recipe = require('../patches/react-odontogram/0.6.0.json')
const distribution = path.dirname(require.resolve('react-odontogram'))
const hash = value => crypto.createHash('sha256').update(value).digest('hex')

// Reconstruct the published inputs, then verify a clean install and repeat runs.
const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'odontogram-patch-test-'),
)
try {
    fs.mkdirSync(path.join(temporary, 'dist'))
    fs.writeFileSync(
        path.join(temporary, 'package.json'),
        JSON.stringify({ version: '0.6.0' }),
    )
    for (const file of recipe.files) {
        let pristine = fs.readFileSync(
            path.join(distribution, file.name),
            'utf8',
        )
        assert.equal(
            hash(pristine),
            file.afterHash,
            `Installed ${file.name} must be patched`,
        )
        pristine = pristine.slice((file.prefix ?? '').length)
        for (const [before, after] of [...file.replacements].reverse())
            pristine = pristine.replace(after, before)
        assert.equal(
            hash(pristine),
            file.beforeHash,
            `Published ${file.name} reconstructed exactly`,
        )
        fs.writeFileSync(path.join(temporary, 'dist', file.name), pristine)
    }
    patchOdontogram(temporary)
    patchOdontogram(temporary)
    for (const file of recipe.files)
        assert.equal(
            hash(fs.readFileSync(path.join(temporary, 'dist', file.name))),
            file.afterHash,
        )
    assert.equal(
        fs.readFileSync(
            path.join(temporary, 'dist', 'dental-booking.cjs'),
            'utf8',
        ),
        fs.readFileSync(path.join(distribution, 'dental-booking.cjs'), 'utf8'),
    )
    fs.appendFileSync(
        path.join(temporary, 'dist', 'index.js'),
        '\n// unknown artifact',
    )
    assert.throws(
        () => patchOdontogram(temporary),
        /Unexpected react-odontogram artifact/,
    )
    fs.writeFileSync(
        path.join(temporary, 'package.json'),
        JSON.stringify({ version: '0.7.0' }),
    )
    assert.throws(
        () => patchOdontogram(temporary),
        /Review the odontogram patch/,
    )
} finally {
    const resolved = path.resolve(temporary)
    if (
        path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
        !path.basename(resolved).startsWith('odontogram-patch-test-')
    )
        throw new Error('Unexpected temporary package path')
    fs.rmSync(resolved, { recursive: true, force: true })
}

const findTooth = (node, id) => {
    if (!node || typeof node !== 'object') return undefined
    if (node.props?.name === `teeth-${id}`) return node
    return React.Children.toArray(node.props?.children)
        .map(child => findTooth(child, id))
        .find(Boolean)
}

async function main() {
    const esm = await import(
        pathToFileURL(path.join(distribution, 'index.mjs')).href
    )
    for (const module of [require('react-odontogram'), esm]) {
        for (const layout of ['circle', 'square']) {
            const primary = renderToStaticMarkup(
                React.createElement(module.Odontogram, {
                    dentition: 'primary',
                    layout,
                    selected: ['teeth-55'],
                    notation: 'Universal',
                }),
            )
            assert.equal((primary.match(/role="option"/g) ?? []).length, 20)
            assert.match(primary, /class="teeth-55 selected"/)
            assert.doesNotMatch(primary, /data-tooth="1[1-8]"/)
            for (const position of metadata.dentitions.primary)
                assert.match(
                    primary,
                    new RegExp(
                        `data-tooth="${position.fdi}"[^>]*><title>${position.tooth}</title>`,
                    ),
                )
            const adult = renderToStaticMarkup(
                React.createElement(module.Odontogram, { layout }),
            )
            assert.equal((adult.match(/role="option"/g) ?? []).length, 32)
            assert.match(
                renderToStaticMarkup(
                    React.createElement(module.Odontogram, {
                        dentition: 'primary',
                        layout,
                        showHalf: 'lower',
                    }),
                ),
                /data-tooth="85"/,
            )
        }
    }

    let stateWrites = 0
    const hookedReact = {
        ...React,
        useMemo: create => create(),
        useCallback: callback => callback,
        useRef: () => ({ current: null }),
        useState: initial => [
            typeof initial === 'function' ? initial() : initial,
            value => {
                assert.notEqual(
                    typeof value,
                    'function',
                    'Selection notifications must be fired from the event handler',
                )
                stateWrites++
            },
        ],
    }
    const module = { exports: {} }
    new Function(
        'module',
        'exports',
        'require',
        fs.readFileSync(path.join(distribution, 'index.js'), 'utf8'),
    )(module, module.exports, name =>
        name === 'react'
            ? hookedReact
            : name === './dental-booking.cjs'
            ? require('../patches/react-odontogram/dental-booking.cjs')
            : require(name),
    )
    const events = []
    const props = {
        dentition: 'primary',
        selected: ['teeth-55'],
        singleSelect: true,
        onChange: next => events.push(next),
    }
    const render = changes =>
        module.exports.Odontogram({ ...props, ...changes })
    const initial = render()
    assert.equal(findTooth(initial, '55').props.selected, true)
    findTooth(initial, '54').props.onClick('teeth-54')
    assert.equal(events.length, 1)
    assert.equal(events[0][0].notations.fdi, '54')
    assert.equal(events[0][0].notations.universal, 'B')
    assert.equal(events[0][0].type, 'First Molar')
    assert.equal(stateWrites, 0)
    assert.equal(
        findTooth(render(), '55').props.selected,
        true,
        'Rejected parent changes preserve the highlight',
    )
    assert.equal(
        findTooth(render({ selected: ['teeth-54'] }), '54').props.selected,
        true,
    )
    findTooth(render({ readOnly: true }), '54').props.onClick('teeth-54')
    assert.equal(events.length, 1)
    findTooth(render(), '55').props.onClick('teeth-55')
    assert.deepEqual(events.at(-1), [])
    findTooth(
        render({ selected: undefined, defaultSelected: [] }),
        '55',
    ).props.onClick('teeth-55')
    assert.equal(stateWrites, 1)
    assert.equal(events.at(-1)[0].notations.universal, 'A')
    console.log(
        'Odontogram package: clean-install patch, idempotence, module formats, primary numbering/artwork, controlled selection and read-only behavior passed.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
