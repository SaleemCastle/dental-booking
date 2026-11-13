export const getUserInitials = (name: string) =>
    name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0))
        .join('')
        .toUpperCase() || 'A'

export const getUserAvatarUrl = (value: unknown): string | undefined => {
    if (!value || typeof value !== 'object') return undefined
    const record = value as Record<string, unknown>
    for (const field of [
        'profile_photo_url',
        'avatar_url',
        'profile_picture_url',
        'photo_url',
    ]) {
        const url = record[field]
        if (
            typeof url === 'string' &&
            (/^https?:\/\//i.test(url.trim()) || /^\/(?!\/)/.test(url.trim()))
        )
            return url.trim()
    }
    return undefined
}
