import React, { useEffect, useRef, useState } from 'react'
import {
    PatientDocument,
    downloadPatientDocument,
} from '../services/patient-documents'
import { normalizeAxiosError } from '../lib/api'
import AppointmentDialog, {
    appointmentButtonClass as buttonClass,
} from './AppointmentDialog'

// Render PDF page graphics only. No annotation layer, links, forms or scripting.
const PdfPreview = ({ blob }: { blob: Blob }) => {
    const canvas = useRef<HTMLCanvasElement>(null)
    const pdf = useRef<import('pdfjs-dist').PDFDocumentProxy | null>(null)
    const [page, setPage] = useState(1)
    const [count, setCount] = useState(0)
    const [error, setError] = useState('')
    const [rendering, setRendering] = useState(true)
    useEffect(() => {
        let disposed = false
        let task: import('pdfjs-dist').PDFDocumentLoadingTask | undefined
        const open = async () => {
            try {
                const pdfjs = await import('pdfjs-dist')
                if (disposed) return
                const assets = `/pdfjs/${pdfjs.version}/`
                pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`
                task = pdfjs.getDocument({
                    data: new Uint8Array(await blob.arrayBuffer()),
                    cMapUrl: `${assets}cmaps/`,
                    cMapPacked: true,
                    standardFontDataUrl: `${assets}standard_fonts/`,
                    wasmUrl: `${assets}wasm/`,
                    // Bound image decoding and canvas allocations for previews.
                    maxImageSize: 16 * 1024 * 1024,
                    canvasMaxAreaInBytes: 64 * 1024 * 1024,
                })
                if (disposed) {
                    await task.destroy()
                    return
                }
                const document = await task.promise
                if (disposed) return
                pdf.current = document
                setCount(document.numPages)
            } catch {
                if (!disposed) {
                    setError(
                        'This PDF cannot be previewed. Download it to open in your PDF reader.',
                    )
                    setRendering(false)
                }
            }
        }
        void open()
        return () => {
            disposed = true
            pdf.current = null
            void task?.destroy().catch(() => undefined)
        }
    }, [blob])
    useEffect(() => {
        if (!count || !pdf.current || !canvas.current) return
        let disposed = false
        let task: import('pdfjs-dist').RenderTask | undefined
        setRendering(true)
        setError('')
        const render = async () => {
            try {
                const pdfPage = await pdf.current.getPage(page)
                if (disposed) return
                const viewport = pdfPage.getViewport({ scale: 1 })
                const scale = Math.min(
                    1.5,
                    1600 / Math.max(viewport.width, viewport.height),
                )
                const sized = pdfPage.getViewport({ scale })
                canvas.current.width = Math.ceil(sized.width)
                canvas.current.height = Math.ceil(sized.height)
                task = pdfPage.render({
                    canvas: canvas.current,
                    viewport: sized,
                })
                await task.promise
                if (!disposed) setRendering(false)
            } catch {
                if (!disposed) {
                    setError(
                        'This page cannot be previewed. Download the PDF to view it.',
                    )
                    setRendering(false)
                }
            }
        }
        void render()
        return () => {
            disposed = true
            task?.cancel()
        }
    }, [page, count])
    return (
        <div className="space-y-4">
            {count > 0 && (
                <div className="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={page <= 1 || rendering}
                        onClick={() => setPage(value => value - 1)}>
                        Previous PDF page
                    </button>
                    <span className="text-sm">
                        Page {page} of {count}
                    </span>
                    <button
                        type="button"
                        className={buttonClass}
                        disabled={page >= count || rendering}
                        onClick={() => setPage(value => value + 1)}>
                        Next PDF page
                    </button>
                </div>
            )}
            {rendering && (
                <p role="status" className="text-sm text-clinic-muted">
                    Rendering PDF page...
                </p>
            )}
            {error && (
                <p role="alert" className="text-sm text-red-700">
                    {error}
                </p>
            )}
            <canvas
                ref={canvas}
                aria-label={`PDF page ${page}`}
                role="img"
                className={`mx-auto max-w-full ${
                    rendering || error ? 'hidden' : ''
                }`}
            />
        </div>
    )
}

export default function PatientDocumentPreview({
    patientId,
    document,
    tenantId,
    onClose,
}: {
    patientId: number
    document: PatientDocument
    tenantId: number
    onClose: () => void
}) {
    const [blob, setBlob] = useState<Blob | null>(null)
    const [url, setUrl] = useState('')
    const [error, setError] = useState('')
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
        const controller = new AbortController()
        let objectUrl = ''
        setBlob(null)
        setUrl('')
        setError('')
        const open = async () => {
            try {
                const result = await downloadPatientDocument(
                    patientId,
                    document,
                    { tenantId, signal: controller.signal },
                )
                if (controller.signal.aborted) return
                setBlob(result)
                if (result.type.startsWith('image/')) {
                    objectUrl = URL.createObjectURL(result)
                    setUrl(objectUrl)
                }
            } catch (error) {
                if (!controller.signal.aborted)
                    setError(normalizeAxiosError(error).message)
            }
        }
        void open()
        return () => {
            controller.abort()
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [patientId, document, tenantId, attempt])
    return (
        <AppointmentDialog
            title="Document preview"
            closeLabel="Close document preview"
            onClose={onClose}>
            <div className="space-y-4 p-6">
                <p className="break-all text-sm font-bold text-clinic-ink">
                    {document.original_filename}
                </p>
                <p className="text-xs text-clinic-muted">
                    Preview for reference. Use the original file for clinical
                    review.
                </p>
                {!blob && !error && (
                    <p role="status" className="text-sm text-clinic-muted">
                        Opening private document...
                    </p>
                )}
                {error && (
                    <div role="alert" className="text-sm text-red-700">
                        {error}{' '}
                        <button
                            type="button"
                            className={buttonClass}
                            onClick={() => setAttempt(value => value + 1)}>
                            Retry preview
                        </button>
                    </div>
                )}
                {url && !error && (
                    // A local object URL is created only for allowlisted raster types.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={url}
                        alt={document.original_filename}
                        className="mx-auto max-h-[65vh] max-w-full object-contain"
                        onError={() =>
                            setError(
                                'This image cannot be previewed. Download the original file to view it.',
                            )
                        }
                    />
                )}
                {blob?.type === 'application/pdf' && <PdfPreview blob={blob} />}
            </div>
        </AppointmentDialog>
    )
}
