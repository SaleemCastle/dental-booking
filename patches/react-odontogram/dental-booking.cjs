// Shared extensions for react-odontogram 0.6.0's CommonJS and ES module builds.
// Keep the package's tooth artwork, fit the two molars into primary positions
// four and five, and shorten the circular arch to fit five teeth per quadrant.
const bounds = {
    circle: [
        [48.447, 64.527, 56.631, 44.882],
        [29.379, 100.398, 60.194, 41.247],
        [6.617, 137.894, 72.903, 65.435],
        [0.543, 203.99, 69.244, 59.071],
    ],
    square: [
        [227.256, 1.662, 34.387, 51.498],
        [180.255, 0.499, 33.848, 52.662],
        [121.256, 1.963, 46.049, 51.198],
        [60.255, 0.923, 47.072, 52.238],
    ],
}

function fitToSlot(source, target) {
    const scale = Math.min(target[2] / source[2], target[3] / source[3])
    const x =
        target[0] + (target[2] - source[2] * scale) / 2 - source[0] * scale
    const y =
        target[1] + (target[3] - source[3] * scale) / 2 - source[1] * scale
    return `translate(${x} ${y}) scale(${scale})`
}

exports.primaryTeeth = (teeth, layout) =>
    [0, 1, 2, 5, 6].map((sourceIndex, index) => ({
        ...teeth[sourceIndex],
        name: String(index + 1),
        ...(index >= 3
            ? {
                  transform: fitToSlot(
                      bounds[layout][index - 1],
                      bounds[layout][index - 3],
                  ),
              }
            : {}),
    }))

exports.primaryQuadrants = (quadrants, layout) =>
    quadrants.map((quadrant, index) => ({
        ...quadrant,
        prefix: ['5', '6', '8', '7'][index],
        transform:
            layout === 'circle'
                ? quadrant.transform.replace(/694/g, '344')
                : quadrant.transform,
    }))

exports.viewBox = (original, dentition, layout, half) => {
    if (dentition !== 'primary' || layout !== 'circle') return original
    if (half === 'upper') return '0 0 409 172'
    if (half === 'lower') return '0 172 409 172'
    return '0 0 409 344'
}
