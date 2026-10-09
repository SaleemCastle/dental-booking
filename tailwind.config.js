const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
    darkMode: 'class',
    content: [
        './src/**/*.{js,ts,jsx,tsx}',
        // Add extra paths here
    ],
    theme: {
        extend: {
            colors: {
                clinic: {
                    ink: '#172033',
                    muted: '#6B7688',
                    line: '#E7EDF5',
                    canvas: '#F5F8FC',
                    surface: '#FFFFFF',
                    blue: '#2F5BFF',
                    sky: '#EAF2FF',
                    mint: '#E9F8F0',
                    teal: '#20B7A6',
                    rose: '#FFEAF1',
                    amber: '#FFF4D8',
                },
            },
            boxShadow: {
                clinic: '0 18px 50px rgba(23, 32, 51, 0.08)',
                row: '0 10px 28px rgba(47, 91, 255, 0.08)',
            },
            fontFamily: {
                sans: ['Inter', 'Nunito', ...defaultTheme.fontFamily.sans],
            },
        },
    },
    variants: {
        extend: {
            opacity: ['disabled'],
        },
    },
    plugins: [require('@tailwindcss/forms')],
}
