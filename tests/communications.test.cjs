const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const moduleObject = { exports: {} }
const source = ts.transpileModule(
    fs.readFileSync('src/components/CommunicationSettings.tsx', 'utf8'),
    {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.React,
            esModuleInterop: true,
        },
    },
).outputText
new Function('module', 'exports', 'require', source)(
    moduleObject,
    moduleObject.exports,
    name => (name === 'react' ? require('react') : {}),
)
const preview = moduleObject.exports.previewCommunicationTemplate
assert.equal(
    preview('Hello {{ patient_name }}: {{amount}}').text,
    'Hello Sample Patient: USD 50.00',
)
for (const text of [
    '{{secret}}',
    '{{__proto__}}',
    '{{constructor}}',
    '{{amount}',
    '{amount}',
    '<script>alert(1)</script>',
    '<?php echo 1;',
    '@php',
])
    assert.ok(preview(text).error, text)
assert.equal(preview('{{payment_link}}').text, '[secure checkout link]')
assert.ok(!preview('Plain billing message').error)
console.log('Communication template safety checks passed.')
