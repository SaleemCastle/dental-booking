import React, { useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { canManageUsers } from '../lib/permissions'
import { appointmentInputClass as input } from './AppointmentDialog'

const samples: Record<string, string> = {
    patient_name: 'Sample Patient',
    invoice_number: 'DEMO-001',
    amount: 'USD 50.00',
    balance: 'USD 100.00',
    payment_link: '[secure checkout link]',
    payment_status: 'paid',
}
export function previewCommunicationTemplate(template: string) {
    if (
        /[<>]/.test(template) ||
        /<\?|@(?:php|include|if|foreach)\b/i.test(template)
    )
        return {
            error:
                'Use plain text only. HTML, PHP and Blade are not supported.',
            text: '',
        }
    let invalid = false
    const text = template.replace(
        /\{\{\s*([a-z_]+)\s*\}\}/g,
        (_, key: string) => {
            if (!Object.prototype.hasOwnProperty.call(samples, key)) {
                invalid = true
                return ''
            }
            return samples[key]
        },
    )
    const remaining = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, '')
    if (invalid || /[{}]/.test(remaining))
        return {
            error: 'Use only supported variables with complete double braces.',
            text: '',
        }
    return { error: '', text }
}
export default function CommunicationSettings() {
    const { user } = useAuthSession()
    const [event, setEvent] = useState('payment_link.created')
    const [template, setTemplate] = useState(
        'Hello {{patient_name}}, payment of {{amount}} is requested for invoice {{invoice_number}}. Balance: {{balance}}. {{payment_link}}',
    )
    const preview = previewCommunicationTemplate(template)
    if (!canManageUsers(user))
        return (
            <p className="p-6">
                Communication configuration requires clinic administrator
                access.
            </p>
        )
    return (
        <section className="space-y-5 rounded-xl border border-clinic-line bg-white p-6">
            <h2 className="text-xl font-extrabold">
                Transactional communications
            </h2>
            <p>
                Clinic configuration is managed by a trusted operator. Ask the
                operator to configure payment request and receipt channels and
                internal copy user IDs. This application cannot read or save the
                active configuration.
            </p>
            <p className="text-sm text-clinic-muted">
                Internal copies require verified staff email, current clinic
                membership and invoice read access. Roles cannot be configured
                as recipients. Copies receive a fixed billing summary without
                checkout links.
            </p>
            <h3 className="font-bold">Sample template preview</h3>
            <p className="text-sm">
                These are illustrative templates using fictional data, not the
                active clinic templates. No messages are sent or configuration
                saved.
            </p>
            <label className="block">
                Event
                <select
                    className={input}
                    value={event}
                    onChange={change => {
                        setEvent(change.target.value)
                        setTemplate(
                            change.target.value === 'payment.recorded'
                                ? 'Hello {{patient_name}}, we received {{amount}} for invoice {{invoice_number}}. Remaining balance: {{balance}}.'
                                : 'Hello {{patient_name}}, payment of {{amount}} is requested for invoice {{invoice_number}}. Balance: {{balance}}. {{payment_link}}',
                        )
                    }}>
                    <option value="payment_link.created">
                        Payment request
                    </option>
                    <option value="payment.recorded">Payment receipt</option>
                </select>
            </label>
            <label className="block">
                Plain-text sample
                <textarea
                    className={`${input} min-h-[120px]`}
                    maxLength={10000}
                    value={template}
                    onChange={change => setTemplate(change.target.value)}
                />
            </label>
            <p className="text-sm">
                Supported variables:{' '}
                {Object.keys(samples)
                    .map(key => `{{${key}}}`)
                    .join(', ')}
            </p>
            {preview.error ? (
                <p role="alert" className="text-rose-700">
                    {preview.error}
                </p>
            ) : (
                <pre
                    aria-label="Sample message preview"
                    className="whitespace-pre-wrap break-words rounded-lg bg-clinic-canvas p-4 font-sans text-sm">
                    {preview.text}
                </pre>
            )}
            <p className="text-sm text-clinic-muted">
                Payment amounts and checkout links are calculated by the
                backend. Preview uses a placeholder link and never fetches
                patient data or credentials.
            </p>
        </section>
    )
}
