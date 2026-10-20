// Keep production verification separate from an already-running dev server.
module.exports = {
    distDir: process.env.NEXT_DIST_DIR || '.next',
}
