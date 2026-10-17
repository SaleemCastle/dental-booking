import React, { ReactNode, RefObject } from 'react'
import { Dialog } from '@headlessui/react'
import { FiX } from 'react-icons/fi'

export const appointmentInputClass =
    'mt-2 block w-full rounded-md border-clinic-line bg-white text-sm text-clinic-ink focus:border-clinic-blue focus:ring-clinic-blue/20 disabled:bg-clinic-canvas disabled:text-clinic-muted'
export const appointmentButtonClass =
    'rounded-md border border-clinic-line bg-white px-3 py-2 text-sm font-bold text-clinic-muted hover:border-clinic-blue hover:text-clinic-blue disabled:cursor-not-allowed disabled:opacity-50'
export const appointmentPrimaryClass =
    'rounded-md bg-clinic-blue px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'

const AppointmentDialog = ({
    title,
    children,
    onClose,
    busy = false,
    initialFocus,
    closeLabel = 'Close appointment',
}: {
    title: string
    children: ReactNode
    onClose: () => void
    busy?: boolean
    initialFocus?: RefObject<HTMLElement>
    closeLabel?: string
}) => (
    <Dialog
        open={true}
        onClose={() => {
            if (!busy) onClose()
        }}
        initialFocus={initialFocus}
        className="fixed inset-0 z-50 overflow-y-auto">
        <Dialog.Overlay className="fixed inset-0 bg-clinic-ink/45" />
        <div className="relative mx-auto my-6 w-[calc(100%-2rem)] max-w-3xl rounded-md bg-white shadow-clinic">
            <div className="flex items-center justify-between border-b border-clinic-line px-6 py-4">
                <Dialog.Title className="text-lg font-extrabold text-clinic-ink">
                    {title}
                </Dialog.Title>
                <button
                    type="button"
                    disabled={busy}
                    onClick={onClose}
                    aria-label={closeLabel}
                    className={appointmentButtonClass}>
                    <FiX />
                </button>
            </div>
            {children}
        </div>
    </Dialog>
)

export default AppointmentDialog
