import React, { useState } from 'react'
import { getUserInitials } from '../lib/user-avatar'

export default function UserAvatar({
    name,
    photoUrl,
    size = 'default',
}: {
    name: string
    photoUrl?: string | null
    size?: 'small' | 'default' | 'large'
}) {
    const [failedPhoto, setFailedPhoto] = useState<string | null>(null)
    return (
        <span
            aria-hidden="true"
            data-avatar="true"
            className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-clinic-sky font-bold text-clinic-blue ring-2 ring-white ${
                size === 'small'
                    ? 'h-7 w-7 text-[10px]'
                    : size === 'large'
                    ? 'h-11 w-11 text-sm'
                    : 'h-9 w-9 text-xs'
            }`}>
            {photoUrl && photoUrl !== failedPhoto ? (
                // Profile URLs may be supplied by the clinic's media host.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={photoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedPhoto(photoUrl)}
                />
            ) : (
                getUserInitials(name)
            )}
        </span>
    )
}
