const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'wizard.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
}).outputText

const moduleRef = { exports: {} }
new Function('exports', 'module', compiled)(moduleRef.exports, moduleRef)

const {
    getWizardStepForFieldError,
    hasWizardStepErrors,
    isWizardStepComplete,
} = moduleRef.exports

const steps = [
    { id: 'identity', fields: ['firstName', 'lastName'] },
    { id: 'contact', fields: ['city'] },
]

assert.equal(
    isWizardStepComplete(steps[0], { firstName: 'Jane', lastName: 'Doe' }, [
        'firstName',
        'lastName',
    ]),
    true,
)
assert.equal(
    isWizardStepComplete(steps[0], { firstName: 'Jane', lastName: '' }, [
        'firstName',
        'lastName',
    ]),
    false,
)
assert.equal(hasWizardStepErrors(steps[1], { city: ['Required'] }), true)
assert.equal(getWizardStepForFieldError(steps, { city: ['Required'] }), 1)
assert.equal(getWizardStepForFieldError(steps, { notes: ['Invalid'] }), -1)

console.log('Wizard helper tests passed.')
