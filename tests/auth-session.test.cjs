const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'auth-session.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
}).outputText

const moduleRef = { exports: {} }
new Function('exports', 'module', compiled)(moduleRef.exports, moduleRef)

const { resolveSessionStatus } = moduleRef.exports

assert.equal(resolveSessionStatus(undefined), 'loading')
assert.equal(resolveSessionStatus(null), 'unauthenticated')
assert.equal(resolveSessionStatus({ id: 1, name: 'Jane' }), 'authenticated')
assert.equal(
    resolveSessionStatus(undefined, { statusCode: 401 }),
    'unauthenticated',
)

console.log('Auth session state tests passed.')
