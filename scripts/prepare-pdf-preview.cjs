// Serve versioned PDF.js assets locally. No clinical bytes are written here.
const fs = require('node:fs')
const path = require('node:path')
const source = path.dirname(require.resolve('pdfjs-dist/package.json'))
const { version } = require('pdfjs-dist/package.json')
const target = path.join(__dirname, '..', 'public', 'pdfjs', version)
fs.mkdirSync(target, { recursive: true })
fs.copyFileSync(
    path.join(source, 'build', 'pdf.worker.min.mjs'),
    path.join(target, 'pdf.worker.min.mjs'),
)
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
    fs.cpSync(path.join(source, folder), path.join(target, folder), {
        recursive: true,
    })
}
