import React from 'react'
import 'tailwindcss/tailwind.css'
import 'react-odontogram/style.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { wrapper } from '../store/store'
import { AuthSessionProvider } from '../context/AuthSessionContext'

function MyApp({ Component, pageProps, router }: AppProps) {
    // Provider return pages must work without a staff session or clinic API.
    if (
        router.pathname === '/payments/complete' ||
        router.pathname === '/payments/cancel'
    ) {
        return <Component {...pageProps} />
    }

    return (
        <AuthSessionProvider>
            <Component {...pageProps} />
        </AuthSessionProvider>
    )
}

export default wrapper.withRedux(MyApp)
