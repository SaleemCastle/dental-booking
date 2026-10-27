export const documentTypes: Record<string, string[]> = {
    'application/pdf': ['pdf'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
}

const configuredLimit = Number(
    process.env.NEXT_PUBLIC_PATIENT_DOCUMENT_MAX_SIZE_KB,
)
export const documentMaxSizeKb =
    Number.isFinite(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : 20480
export const documentAccept = '.pdf,.jpg,.jpeg,.png,.webp'

export const formatDocumentSize = (bytes: number) =>
    bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
        : `${Math.ceil(bytes / 1024)} KiB`

export const validateDocumentFile = (
    file: Pick<File, 'name' | 'size' | 'type'>,
) => {
    if (!file.size) return 'Choose a nonempty file.'
    if (file.size > documentMaxSizeKb * 1024)
        return `The file must be at most ${formatDocumentSize(
            documentMaxSizeKb * 1024,
        )}.`
    if (
        Array.from(file.name).length > 255 ||
        // Filenames must reject literal control characters before upload.
        // eslint-disable-next-line no-control-regex
        /[\x00-\x1f\x7f-\x9f/\\]/.test(file.name)
    )
        return 'Use a filename of at most 255 characters without paths or control characters.'
    const extension = file.name.split('.').pop()?.toLowerCase()
    const expected = Object.entries(documentTypes).find(([, extensions]) =>
        extensions.includes(extension),
    )?.[0]
    if (!expected) return 'Choose a PDF, JPEG, PNG or WebP file.'
    // Browser MIME can be empty. The API detects and validates the actual bytes.
    if (file.type && file.type !== expected)
        return 'The file type and filename extension must match (PDF, JPEG, PNG or WebP).'
    return ''
}
