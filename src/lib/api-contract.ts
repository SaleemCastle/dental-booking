export type ApiFieldErrors = Record<string, string[]>

export interface PaginationMeta {
    currentPage?: number
    perPage?: number
    total?: number
    lastPage?: number
    from?: number
    to?: number
    links?: unknown
    [key: string]: unknown
}

export interface ApiResponse<T> {
    success: boolean
    statusCode: number
    message: string
    code: string
    data: T
    errors: ApiFieldErrors
    meta?: PaginationMeta
    requestId?: string
}

export interface ApiErrorShape {
    statusCode: number
    message: string
    code: string
    errors: ApiFieldErrors
    requestId?: string
    meta?: PaginationMeta
}

interface NormalizeOptions {
    statusCode: number
    statusText?: string
    headers?: Record<string, unknown>
}

const defaultMessages: Record<number, string> = {
    401: 'Authentication is required.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'The request conflicts with the current state.',
    422: 'Please review the highlighted fields.',
    429: 'Too many requests. Please try again later.',
    500: 'The server could not complete the request.',
    502: 'The server could not complete the request.',
    503: 'The server is temporarily unavailable.',
}

const defaultCodes: Record<number, string> = {
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'SERVER_ERROR',
    502: 'SERVER_ERROR',
    503: 'SERVICE_UNAVAILABLE',
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOwn = (value: Record<string, unknown>, key: string) =>
    Object.prototype.hasOwnProperty.call(value, key)

const isApiEnvelope = (value: unknown) => {
    if (!isObject(value)) {
        return false
    }

    return (
        hasOwn(value, 'success') ||
        hasOwn(value, 'statusCode') ||
        hasOwn(value, 'requestId') ||
        hasOwn(value, 'errors') ||
        (hasOwn(value, 'data') &&
            (hasOwn(value, 'message') ||
                hasOwn(value, 'code') ||
                hasOwn(value, 'meta')))
    )
}

export const getStatusCode = (statusCode: unknown, fallback: number) => {
    if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
        return statusCode
    }

    return fallback
}

export const getApiCode = (code: unknown, statusCode: number) => {
    if (typeof code === 'string' && code.length > 0) {
        return code
    }

    return defaultCodes[statusCode] ?? `HTTP_${statusCode}`
}

export const getApiMessage = (
    message: unknown,
    statusCode: number,
    fallback?: string,
) => {
    if (typeof message === 'string' && message.length > 0) {
        return message
    }

    return fallback || defaultMessages[statusCode] || 'Request failed.'
}

export const normalizeFieldErrors = (errors: unknown): ApiFieldErrors => {
    if (!isObject(errors)) {
        if (Array.isArray(errors)) {
            return {
                _error: errors.map(error => String(error)),
            }
        }

        return {}
    }

    return Object.entries(errors).reduce<ApiFieldErrors>(
        (normalized, [field, messages]) => {
            if (Array.isArray(messages)) {
                normalized[field] = messages.map(message => String(message))
                return normalized
            }

            if (typeof messages === 'string') {
                normalized[field] = [messages]
                return normalized
            }

            if (messages != null) {
                normalized[field] = [String(messages)]
            }

            return normalized
        },
        {},
    )
}

export const getRequestId = (
    payload: unknown,
    headers: Record<string, unknown> = {},
) => {
    if (isObject(payload) && typeof payload.requestId === 'string') {
        return payload.requestId
    }

    const requestId =
        headers['x-request-id'] ??
        headers['X-Request-Id'] ??
        headers['x-correlation-id'] ??
        headers['X-Correlation-Id']

    return typeof requestId === 'string' ? requestId : undefined
}

export const normalizeApiResponsePayload = <T>(
    payload: unknown,
    options: NormalizeOptions,
): ApiResponse<T> => {
    if (isApiEnvelope(payload)) {
        const envelope = payload as Record<string, unknown>
        const statusCode = getStatusCode(
            envelope.statusCode,
            options.statusCode,
        )

        return {
            success:
                typeof envelope.success === 'boolean'
                    ? envelope.success
                    : statusCode < 400,
            statusCode,
            message: getApiMessage(
                envelope.message,
                statusCode,
                options.statusText,
            ),
            code: getApiCode(envelope.code, statusCode),
            data: (hasOwn(envelope, 'data') ? envelope.data : undefined) as T,
            errors: normalizeFieldErrors(envelope.errors),
            meta: isObject(envelope.meta)
                ? (envelope.meta as PaginationMeta)
                : undefined,
            requestId: getRequestId(payload, options.headers),
        }
    }

    return {
        success: options.statusCode < 400,
        statusCode: options.statusCode,
        message: options.statusText || '',
        code: getApiCode(undefined, options.statusCode),
        data: payload as T,
        errors: {},
        requestId: getRequestId(payload, options.headers),
    }
}

export const normalizeApiErrorPayload = (
    payload: unknown,
    options: NormalizeOptions,
): ApiErrorShape => {
    const response = normalizeApiResponsePayload<unknown>(payload, options)

    return {
        statusCode: response.statusCode,
        message: response.message,
        code: response.code,
        errors: response.errors,
        meta: response.meta,
        requestId: response.requestId,
    }
}
