import React, { useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { apiClient } from '../lib/api'

const SessionRecovery = () => {
    const { error, refreshSession, clearSession } = useAuthSession()
    const [busy, setBusy] = useState(false)
    const [logoutFailed, setLogoutFailed] = useState(false)
    const retry = async () => {
        setBusy(true)
        try {
            await refreshSession()
        } catch {
            /* The provider displays the error. */
        } finally {
            setBusy(false)
        }
    }
    const logout = async () => {
        setBusy(true)
        setLogoutFailed(false)
        try {
            // Logout is account-level, including when clinic access is denied.
            await apiClient.post('/logout')
            await clearSession()
            window.location.assign('/login')
        } catch {
            setLogoutFailed(true)
            setBusy(false)
        }
    }
    return (
        <main className="flex min-h-screen items-center justify-center bg-clinic-canvas p-6">
            <div className="w-full max-w-md rounded-xl border border-clinic-line bg-white p-6 shadow-clinic">
                <h1 className="text-lg font-bold text-clinic-ink">
                    {error?.statusCode === 403
                        ? 'Clinic access unavailable'
                        : 'Unable to load your clinic'}
                </h1>
                <p role="alert" className="mt-3 text-sm text-clinic-muted">
                    {error?.statusCode === 403
                        ? 'Your account cannot access the current clinic. Contact your clinic administrator or sign in with another account.'
                        : 'We could not verify your clinic session. Check your connection and try again.'}
                </p>
                {logoutFailed && (
                    <p role="alert" className="mt-3 text-sm text-red-600">
                        Unable to sign out. Please try again.
                    </p>
                )}
                <div className="mt-5 flex gap-4">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={retry}
                        className="rounded-md bg-clinic-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                        Try again
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={logout}
                        className="text-sm font-bold text-clinic-ink disabled:opacity-50">
                        Sign out
                    </button>
                </div>
            </div>
        </main>
    )
}

export default SessionRecovery
