import React, {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react'
import useSWR, { SWRConfig } from 'swr'
import { useRouter } from 'next/router'
import { useDispatch } from 'react-redux'
import {
    ApiError,
    forbiddenSessionEvent,
    unauthorizedSessionEvent,
} from '../lib/api'
import {
    AuthSessionStatus,
    AuthUser,
    CurrentClinic,
    resolveSessionStatus,
} from '../lib/auth-session'
import { clearPatients } from '../store/reducers/patients/patientSlice'
import SessionRecovery from '../components/SessionRecovery'
import { ClinicSession, getClinicSession } from '../services/session'

interface AuthSessionContextValue {
    user: AuthUser | null
    currentTenant: CurrentClinic | null
    error?: ApiError
    status: AuthSessionStatus
    isLoading: boolean
    isAuthenticated: boolean
    isUnauthenticated: boolean
    refreshSession: () => Promise<AuthUser | null | undefined>
    clearSession: () => Promise<AuthUser | null | undefined>
}

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(
    undefined,
)

// A fresh cache and component tree prevent selections, forms and clinical
// results from surviving account, clinic or authorization changes.
const SessionWorkspace = ({
    children,
    authenticated,
}: {
    children: ReactNode
    authenticated: boolean
}) => {
    const dispatch = useDispatch()
    const [ready, setReady] = useState(!authenticated)
    const cacheConfig = useMemo(() => ({ provider: () => new Map() }), [])
    useEffect(() => {
        dispatch(clearPatients())
        setReady(true)
    }, [dispatch])
    return (
        <SWRConfig value={cacheConfig}>
            {ready ? (
                children
            ) : (
                <p role="status" className="p-6 text-sm text-clinic-muted">
                    Loading clinic...
                </p>
            )}
        </SWRConfig>
    )
}

const clearBrowserSessionState = () => {
    if (typeof window === 'undefined') {
        return
    }

    try {
        window.localStorage.removeItem('auth:user')
        window.sessionStorage.removeItem('auth:user')
    } catch {
        // Storage may be unavailable in private browsing contexts.
    }
}

export const AuthSessionProvider = ({ children }: { children: ReactNode }) => {
    const router = useRouter()
    // These account workflows do not require clinic membership.
    const accountWorkflow = [
        '/forgot-password',
        '/password-reset/[token]',
        '/verify-email',
    ].includes(router.pathname)
    const { data: session, error, mutate } = useSWR<
        ClinicSession | null,
        ApiError
    >('/api/user', getClinicSession, {
        shouldRetryOnError: false,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
    })

    const status = resolveSessionStatus(
        session === undefined ? undefined : session?.user ?? null,
        error,
    )
    const user = status === 'authenticated' ? session?.user ?? null : null
    const currentTenant =
        status === 'authenticated' ? session?.currentTenant ?? null : null

    const refreshSession = useCallback(
        async () => (await mutate())?.user ?? null,
        [mutate],
    )
    const clearSession = useCallback(() => {
        clearBrowserSessionState()

        return mutate(null, false).then(() => null)
    }, [mutate])

    useEffect(() => {
        const unauthorized = () => {
            void clearSession()
        }
        const forbidden = () => {
            void refreshSession().catch(() => undefined)
        }
        window.addEventListener(unauthorizedSessionEvent, unauthorized)
        window.addEventListener(forbiddenSessionEvent, forbidden)
        return () => {
            window.removeEventListener(unauthorizedSessionEvent, unauthorized)
            window.removeEventListener(forbiddenSessionEvent, forbidden)
        }
    }, [clearSession, refreshSession])

    const value = useMemo<AuthSessionContextValue>(
        () => ({
            user: user ?? null,
            currentTenant,
            error,
            status,
            isLoading: status === 'loading',
            isAuthenticated: status === 'authenticated',
            isUnauthenticated: status === 'unauthenticated',
            refreshSession,
            clearSession,
        }),
        [clearSession, currentTenant, error, refreshSession, status, user],
    )

    return (
        <AuthSessionContext.Provider value={value}>
            <SessionWorkspace
                authenticated={status === 'authenticated'}
                key={JSON.stringify([
                    status === 'authenticated' ? user?.id : status,
                    currentTenant?.id,
                    user?.roles,
                    user?.permissions,
                ])}>
                {status === 'error' && !accountWorkflow ? (
                    <SessionRecovery />
                ) : (
                    children
                )}
            </SessionWorkspace>
        </AuthSessionContext.Provider>
    )
}

export const useAuthSession = () => {
    const context = useContext(AuthSessionContext)

    if (!context) {
        throw new Error(
            'useAuthSession must be used inside AuthSessionProvider',
        )
    }

    return context
}
