import React from 'react'
import 'tailwindcss/tailwind.css'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { wrapper } from '../store/store'
import { AuthSessionProvider } from '../context/AuthSessionContext'

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <AuthSessionProvider>
            <Component {...pageProps} />
        </AuthSessionProvider>
    )
}

export default wrapper.withRedux(MyApp)
