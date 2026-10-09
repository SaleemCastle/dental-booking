import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/router'
import {
    ApiError,
    ApiFieldErrors,
    apiClient,
    ensureCsrfCookie,
    normalizeAxiosError,
    unauthorizedSessionEvent,
} from '../lib/api'
import { useAuthSession } from '../context/AuthSessionContext'

interface IAuthProps {
    middleware?: string
    redirectIfAuthenticated?: any
}

interface AuthActionProps {
    setErrors: (errors: ApiFieldErrors) => void
    setStatus?: (status: string | null) => void
    [key: string]: unknown
}

const getStatusMessage = (response: {
    message: string
    data: unknown
}): string => {
    if (
        response.data &&
        typeof response.data === 'object' &&
        'status' in response.data &&
        typeof (response.data as { status?: unknown }).status === 'string'
    ) {
        return (response.data as { status: string }).status
    }

    return response.message
}

const handleValidationError = (
    error: unknown,
    setErrors: (errors: ApiFieldErrors) => void,
) => {
    const apiError = normalizeAxiosError(error)

    if (apiError.statusCode !== 422) {
        throw apiError
    }

    setErrors(apiError.errors)
}

export const useAuth = ({
    middleware,
    redirectIfAuthenticated,
}: IAuthProps = {}) => {
    const router = useRouter()
    const {
        user,
        error,
        status,
        isLoading,
        isAuthenticated,
        isUnauthenticated,
        refreshSession,
        clearSession,
    } = useAuthSession()

    const csrf = () => ensureCsrfCookie()

    const register = async ({ setErrors, ...props }: AuthActionProps) => {
        await csrf()

        setErrors({})

        try {
            await apiClient.post('/register', props)
            await refreshSession()
        } catch (error) {
            handleValidationError(error, setErrors)
        }
    }

    const login = async ({
        setErrors,
        setStatus,
        ...props
    }: AuthActionProps) => {
        await csrf()

        setErrors({})
        setStatus?.(null)

        try {
            await apiClient.post('/login', props)
            await refreshSession()
        } catch (error) {
            handleValidationError(error, setErrors)
        }
    }

    const forgotPassword = async ({
        setErrors,
        setStatus,
        email,
    }: AuthActionProps) => {
        await csrf()

        setErrors({})
        setStatus?.(null)

        try {
            const response = await apiClient.post<unknown>('/forgot-password', {
                email,
            })

            setStatus?.(getStatusMessage(response))
        } catch (error) {
            handleValidationError(error, setErrors)
        }
    }

    const resetPassword = async ({
        setErrors,
        setStatus,
        ...props
    }: AuthActionProps) => {
        await csrf()

        setErrors({})
        setStatus?.(null)

        try {
            const response = await apiClient.post<unknown>('/reset-password', {
                token: router.query.token,
                ...props,
            })

            void router.push('/login?reset=' + btoa(getStatusMessage(response)))
        } catch (error) {
            handleValidationError(error, setErrors)
        }
    }

    const resendEmailVerification = async ({ setStatus }) => {
        const response = await apiClient.post<unknown>(
            '/email/verification-notification',
        )

        setStatus(getStatusMessage(response))
    }

    const logout = useCallback(async () => {
        if (isAuthenticated) {
            try {
                await apiClient.post('/logout')
            } catch (error) {
                const apiError = normalizeAxiosError(error)

                if (apiError.statusCode !== 401) {
                    throw apiError
                }
            }
        }

        await clearSession()
        await router.push('/login')
    }, [clearSession, isAuthenticated, router])

    useEffect(() => {
        const handleUnauthorized = (event: Event) => {
            const apiError = (event as CustomEvent<ApiError>).detail

            void clearSession()

            if (middleware === 'auth' && apiError?.statusCode === 401) {
                void router.push('/login')
            }
        }

        window.addEventListener(unauthorizedSessionEvent, handleUnauthorized)

        return () => {
            window.removeEventListener(
                unauthorizedSessionEvent,
                handleUnauthorized,
            )
        }
    }, [clearSession, middleware, router])

    useEffect(() => {
        if (isLoading) {
            return
        }

        if (middleware === 'guest' && redirectIfAuthenticated && user) {
            void router.push(redirectIfAuthenticated)
            return
        }

        if (
            window.location.pathname === '/verify-email' &&
            user?.email_verified_at
        ) {
            void router.push(redirectIfAuthenticated)
            return
        }

        if (middleware === 'auth' && isUnauthenticated) {
            if (
                error?.statusCode === 409 &&
                window.location.pathname !== '/verify-email'
            ) {
                void router.push('/verify-email')
                return
            }

            if (error?.statusCode !== 409) {
                void router.push('/login')
            }
        }
    }, [
        error,
        isLoading,
        isUnauthenticated,
        middleware,
        redirectIfAuthenticated,
        router,
        user,
    ])

    return {
        user,
        error,
        status,
        isLoading,
        isAuthenticated,
        isUnauthenticated,
        register,
        login,
        forgotPassword,
        resetPassword,
        resendEmailVerification,
        logout,
        refreshSession,
    }
}
