const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const compile = (file, dependencies = {}) => {
    const code = ts.transpileModule(
        fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'),
        {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                jsx: ts.JsxEmit.React,
                esModuleInterop: true,
            },
        },
    ).outputText
    const module = { exports: {} }
    new Function('module', 'exports', 'require', code)(
        module,
        module.exports,
        key => (key in dependencies ? dependencies[key] : require(key)),
    )
    return module.exports
}

const workflow = compile('lib/patient-registration.ts')
const wizard = compile('lib/wizard.ts')
const empty = workflow.initialPatientRegistrationValues
const valid = {
    ...empty,
    firstName: 'Jane',
    lastName: 'Doe',
    sex: 'Female',
    streetAddress: '123 Main Street',
    town: 'Midtown',
    city: 'Bogota',
    appointments: 'Consultation',
    notes: 'Prefers mornings',
}
for (let index = 0; index < 5; index++) {
    assert.deepEqual(workflow.validatePatientRegistrationStep(valid, index), {})
}
assert.ok(
    workflow.validatePatientRegistrationStep({ ...valid, town: ' ' }, 1).town,
)
assert.ok(
    workflow.validatePatientRegistrationStep({ ...valid, notes: '' }, 4).notes,
)
for (const [field, limit] of Object.entries(workflow.patientFieldMaxLengths)) {
    const index = workflow.patientRegistrationSteps.findIndex(step =>
        step.fields.includes(field),
    )
    assert.ok(
        workflow.validatePatientRegistrationStep(
            { ...valid, [field]: 'a'.repeat(limit + 1) },
            index,
        )[field],
    )
    assert.equal(
        workflow.validatePatientRegistrationStep(
            { ...valid, [field]: 'a'.repeat(limit) },
            index,
        )[field],
        undefined,
    )
}
for (const field of ['allergies', 'medications', 'medical_alerts']) {
    assert.ok(
        workflow.validatePatientRegistrationStep(
            { ...valid, [field]: 'a'.repeat(256) },
            3,
        )[field],
    )
    assert.deepEqual(
        workflow.validatePatientRegistrationStep(
            { ...valid, [field]: 'a'.repeat(255) + ',\n' + 'b'.repeat(255) },
            3,
        ),
        {},
    )
}
const blankPayload = workflow.buildPatientRegistrationPayload(valid)
assert.equal(blankPayload.emergency_contact_name, null)
assert.equal(blankPayload.emergency_contact_phone, null)
assert.equal(blankPayload.emergency_contact_relationship, null)
assert.deepEqual(blankPayload.allergies, [])
assert.deepEqual(blankPayload.medications, [])
assert.deepEqual(blankPayload.medical_alerts, [])

// Exercise the form's change, navigation, submission and API-error callbacks.
const states = []
let cursor = 0,
    submitted,
    failure,
    successCount = 0,
    closeCount = 0
const mockedReact = {
    ...React,
    useState(initial) {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [
            states[index],
            next => {
                states[index] =
                    typeof next === 'function' ? next(states[index]) : next
            },
        ]
    },
    useMemo: factory => factory(),
    useRef: () => ({ current: {} }),
}
const Form = compile('components/PatientRegistrationWizard.tsx', {
    react: mockedReact,
    '../lib/api': { normalizeAxiosError: error => error },
    '../lib/patient-registration': workflow,
    '../lib/wizard': wizard,
    '../services/patients': {
        createPatient: async payload => {
            submitted = payload
            if (failure) throw failure
        },
    },
    './InputError': compile('components/InputError.tsx'),
    './WizardModal': { __esModule: true, default: () => null },
}).default
const render = () => {
    cursor = 0
    return Form({
        isOpen: true,
        onClose: () => closeCount++,
        onSuccess: () => successCount++,
    }).props
}
const findField = (node, name) => {
    if (!node || typeof node !== 'object') return undefined
    if (node.props?.name === name) return node
    return React.Children.toArray(node.props?.children)
        .map(child => findField(child, name))
        .find(Boolean)
}
const change = (name, value) => {
    const input = findField(render().children, name)
    assert.ok(input, `${name} must be present in its section`)
    input.props.onChange({ target: { name, value } })
}
const fillRequired = () => {
    change('firstName', valid.firstName)
    change('lastName', valid.lastName)
    change('sex', valid.sex)
    render().onNext()
    change('streetAddress', valid.streetAddress)
    change('town', valid.town)
    change('city', valid.city)
    render().onNext()
}

async function main() {
    const Modal = compile('components/WizardModal.tsx').default
    for (const count of [3, 5]) {
        const markup = renderToStaticMarkup(
            React.createElement(Modal, {
                isOpen: true,
                title: 'Register patient',
                steps: render().steps.slice(0, count),
                currentStepIndex: count - 1,
                children: 'Patient fields',
            }),
        )
        assert.ok(markup.includes(`repeat(${count}, minmax(5rem, 1fr))`))
        assert.equal((markup.match(/<li /g) ?? []).length, count)
        assert.equal((markup.match(/aria-current="step"/g) ?? []).length, 1)
        assert.match(markup, /Create patient|Submit/)
    }
    assert.equal(render().isNextDisabled, true)
    fillRequired()
    assert.equal(render().currentStepIndex, 2)
    assert.equal(render().isNextDisabled, false)
    change('emergency_contact_name', ' Alex Doe ')
    change('emergency_contact_phone', '+57 300 123 4567')
    change('emergency_contact_relationship', 'Sibling')
    render().onNext()
    change('allergies', ' Penicillin, Latex\n\n ')
    change('medications', 'Metformin 500 mg\n Aspirin ')
    change('medical_alerts', 'Diabetes')
    change('medical_alerts', 'a'.repeat(256))
    assert.equal(render().isNextDisabled, true)
    assert.match(
        renderToStaticMarkup(render().children),
        /255 characters or fewer/,
    )
    change('medical_alerts', 'Diabetes')
    render().onPrevious()
    assert.equal(
        findField(render().children, 'emergency_contact_name').props.value,
        ' Alex Doe ',
    )
    render().onNext()
    render().onNext()
    assert.equal(render().currentStepIndex, 4)
    change('appointments', valid.appointments)
    change('notes', valid.notes)

    failure = {
        message: 'Invalid allergy',
        errors: { 'allergies.0': ['Invalid allergy'] },
    }
    const timers = []
    global.window = { setTimeout: callback => timers.push(callback) }
    await render().onSubmit()
    assert.equal(render().currentStepIndex, 3)
    assert.match(renderToStaticMarkup(render().children), /Invalid allergy/)
    assert.equal(successCount, 0)
    change('allergies', 'Latex')
    assert.doesNotMatch(
        renderToStaticMarkup(render().children),
        /Invalid allergy/,
    )
    render().onNext()
    failure = undefined
    await render().onSubmit()
    assert.deepEqual(submitted, {
        ...valid,
        emergency_contact_name: 'Alex Doe',
        emergency_contact_phone: '+57 300 123 4567',
        emergency_contact_relationship: 'Sibling',
        allergies: ['Latex'],
        medications: ['Metformin 500 mg', 'Aspirin'],
        medical_alerts: ['Diabetes'],
    })
    assert.equal(successCount, 1)
    assert.equal(closeCount, 1)
    assert.equal(render().currentStepIndex, 0)
    assert.equal(render().isDirty, false)

    // Both optional sections can be skipped when creating a minimal record.
    fillRequired()
    render().onNext()
    render().onNext()
    change('appointments', valid.appointments)
    change('notes', valid.notes)
    await render().onSubmit()
    assert.deepEqual(submitted, blankPayload)
    delete global.window
    console.log(
        'Patient registration: required fields, optional sections, limits, navigation, payloads, API errors and reset passed.',
    )
}
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
