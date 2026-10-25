# react-odontogram 0.6.0 extensions

The application uses the same upstream SVG component for adult and primary
dentitions, in current charts, observation entry, and historical snapshots.

`npm install` / `npm ci` runs `scripts/patch-odontogram.cjs`. The dependency is
pinned to 0.6.0, and the patch verifies both original and patched file hashes.
It is idempotent and fails on an unexpected package build. No additional build
or patching dependency is required, including installs that omit dev dependencies.

The recipe patches both module formats and declaration files to add:

- `dentition`: primary quadrants 5–8 with five teeth each and compact circular
  arches; primary molars reuse the package's molar artwork fitted to their slots.
- Correct Universal primary labels A–T, including the lower quadrants.
- `selected`: controlled selection, with callbacks fired from events rather than
  React state updater functions. Cancelling an unapplied finding change keeps
  the tooth highlight and editor synchronized.
- `toothAriaLabel`: an accessible tooth description in the selected numbering
  system. Condition colors remain visible when a tooth is selected.

The helper's bounding boxes are measured from the upstream 0.6.0 SVG paths.
When upgrading, regenerate the recipe against the published archive and review
the primary artwork, mappings, callbacks and both module formats. Run
`npm run test:dental-charts` and `npm run test:dental-charts:browser`.

To regenerate the pinned recipe from a clean, extracted npm package:
`node scripts/create-odontogram-patch.cjs <extracted-package-directory>`.

Upstream: https://github.com/biomathcode/react-odontogram (MIT).
