import React from 'react'
import { ApiFieldErrors } from '../lib/api'

export default function BillingFeedback({
    message,
    errors = {},
}: {
    message?: string
    errors?: ApiFieldErrors
}) {
    if (!message && !Object.keys(errors).length) return null
    return (
        <div
            role="alert"
            className="space-y-2 rounded-md border border-rose-200 bg-clinic-rose p-4 text-sm text-rose-800">
            {message && <p>{message}</p>}
            {Object.entries(errors).map(([field, messages]) => (
                <p key={field}>
                    {field.replace(/_/g, ' ')}: {messages.join(' ')}
                </p>
            ))}
        </div>
    )
}
