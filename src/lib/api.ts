import Axios, {
    AxiosError,
    AxiosInstance,
    AxiosRequestConfig,
    AxiosResponse,
} from 'axios'
import {
    ApiErrorShape,
    ApiFieldErrors,
    ApiResponse,
    normalizeApiErrorPayload,
    normalizeApiResponsePayload,
} from './api-contract'

export * from './api-contract'

export const unauthorizedSessionEvent = 'api:unauthorized'

export class ApiError extends Error implements ApiErrorShape {
    statusCode: number
    code: string
    errors: ApiFieldErrors
    requestId?: string
    meta?: ApiErrorShape['meta']
    isApiError = true

    constructor(error: ApiErrorShape) {
        super(error.message)
        this.name = 'ApiError'
        this.statusCode = error.statusCode
        this.code = error.code
        this.errors = error.errors
        this.requestId = error.requestId
        this.meta = error.meta
    }
}

export const isApiError = (error: unknown): error is ApiError =>
    error instanceof ApiError ||
    (typeof error === 'object' &&
        error !== null &&
        (error as { isApiError?: boolean }).isApiError === true)

const notifyUnauthorized = (error: ApiError) => {
    if (typeof window === 'undefined') {
        return
    }

    try {
        window.localStorage.removeItem('auth:user')
        window.sessionStorage.removeItem('auth:user')
    } catch {
        // Storage can be unavailable in private contexts.
    }

    window.dispatchEvent(
        new CustomEvent(unauthorizedSessionEvent, { detail: error }),
    )
}

const toHeaders = (headers: unknown): Record<string, unknown> =>
    headers && typeof headers === 'object'
        ? (headers as Record<string, unknown>)
        : {}

export const normalizeAxiosResponse = <T>(
    response: AxiosResponse,
): ApiResponse<T> =>
    normalizeApiResponsePayload<T>(response.data, {
        statusCode: response.status,
        statusText: response.statusText,
        headers: toHeaders(response.headers),
    })

export const normalizeAxiosError = (error: unknown): ApiError => {
    if (isApiError(error)) {
        return error
    }

    const axiosError = error as AxiosError

    if (axiosError?.response) {
        const apiError = new ApiError(
            normalizeApiErrorPayload(axiosError.response.data, {
                statusCode: axiosError.response.status,
                statusText: axiosError.response.statusText,
                headers: toHeaders(axiosError.response.headers),
            }),
        )

        if (apiError.statusCode === 401) {
            notifyUnauthorized(apiError)
        }

        return apiError
    }

    if (axiosError?.request) {
        return new ApiError({
            statusCode: 0,
            message: 'Unable to reach the API. Please check your connection.',
            code: 'NETWORK_ERROR',
            errors: {},
        })
    }

    return new ApiError({
        statusCode: 0,
        message:
            error instanceof Error ? error.message : 'Unexpected API error.',
        code: 'UNKNOWN_ERROR',
        errors: {},
    })
}

export const http: AxiosInstance = Axios.create({
    baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
    },
    withCredentials: true,
})

http.interceptors.response.use(
    response => response,
    error => Promise.reject(normalizeAxiosError(error)),
)

const request = async <T>(
    config: AxiosRequestConfig,
): Promise<ApiResponse<T>> => {
    try {
        const response = await http.request(config)

        return normalizeAxiosResponse<T>(response)
    } catch (error) {
        throw normalizeAxiosError(error)
    }
}

const requestData = async <T>(config: AxiosRequestConfig): Promise<T> => {
    const response = await request<T>(config)

    return response.data
}

export const apiClient = {
    request,
    requestData,
    get: <T>(url: string, config?: AxiosRequestConfig) =>
        request<T>({ ...config, method: 'get', url }),
    getData: <T>(url: string, config?: AxiosRequestConfig) =>
        requestData<T>({ ...config, method: 'get', url }),
    post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
        request<T>({ ...config, method: 'post', url, data }),
    postData: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
        requestData<T>({ ...config, method: 'post', url, data }),
    patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
        request<T>({ ...config, method: 'patch', url, data }),
    patchData: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
        requestData<T>({ ...config, method: 'patch', url, data }),
    delete: <T>(url: string, config?: AxiosRequestConfig) =>
        request<T>({ ...config, method: 'delete', url }),
}

export const ensureCsrfCookie = () =>
    apiClient.get<null>('/sanctum/csrf-cookie')

export const getValidationErrors = (error: unknown): ApiFieldErrors => {
    const apiError = normalizeAxiosError(error)

    return apiError.errors
}
