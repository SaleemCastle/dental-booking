const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const hash = value => crypto.createHash('sha256').update(value).digest('hex')

// Apply only to the exact published artifacts recorded in the recipe. A new
// upstream build requires review; never silently ship a partly applied patch.
function patchOdontogram(
    packageDirectory = path.dirname(
        path.dirname(require.resolve('react-odontogram')),
    ),
) {
    const patchDirectory = path.join(
        __dirname,
        '..',
        'patches',
        'react-odontogram',
    )
    const recipe = JSON.parse(
        fs.readFileSync(path.join(patchDirectory, '0.6.0.json'), 'utf8'),
    )
    const manifest = JSON.parse(
        fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
    )
    if (manifest.version !== recipe.version)
        throw new Error(
            `Review the odontogram patch before installing version ${manifest.version}.`,
        )
    const prepared = recipe.files.map(file => {
        const destination = path.join(packageDirectory, 'dist', file.name)
        const source = fs.readFileSync(destination, 'utf8')
        if (hash(source) === file.afterHash) return { destination, source }
        if (hash(source) !== file.beforeHash)
            throw new Error(
                `Unexpected react-odontogram artifact: ${file.name}. Reinstall version ${recipe.version} before patching.`,
            )
        let patched = source
        for (const [before, after] of file.replacements) {
            if (patched.split(before).length !== 2)
                throw new Error(
                    `Odontogram patch no longer matches ${file.name}.`,
                )
            patched = patched.replace(before, after)
        }
        patched = (file.prefix ?? '') + patched
        if (hash(patched) !== file.afterHash)
            throw new Error(
                `Odontogram patch verification failed: ${file.name}.`,
            )
        return { destination, source: patched }
    })
    fs.copyFileSync(
        path.join(patchDirectory, 'dental-booking.cjs'),
        path.join(packageDirectory, 'dist', 'dental-booking.cjs'),
    )
    prepared.forEach(file => fs.writeFileSync(file.destination, file.source))
}

if (require.main === module) {
    // The package exports its public entry points, so resolve its directory from
    // the CommonJS entry instead of requiring the non-exported package.json.
    patchOdontogram(
        path.dirname(path.dirname(require.resolve('react-odontogram'))),
    )
    process.stdout.write(
        'Applied react-odontogram adult/primary and controlled-selection patch.\n',
    )
}
module.exports = { patchOdontogram }
