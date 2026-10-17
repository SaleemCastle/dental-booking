import useSWRInfinite from 'swr/infinite'
import { useRef } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { ApiError } from '../lib/api'
import { getClinicalNotePermissions } from '../lib/permissions'
import {
    ClinicalNote,
    ClinicalNotePage,
    getClinicalNotes,
} from '../services/clinical-notes'

export const useClinicalNotePermissions = () => {
    const { user, status } = useAuthSession()
    const permissions = getClinicalNotePermissions(
        status === 'authenticated' ? user : null,
    )
    return { user, ...permissions }
}

export const usePatientClinicalNotes = (patientId: number) => {
    const access = useClinicalNotePermissions()
    const refreshFailed = useRef(false)
    const feed = useSWRInfinite<ClinicalNotePage, ApiError>(
        (index, previous: ClinicalNotePage | null) =>
            !access.canView ||
            (previous && index >= Number(previous.meta.lastPage))
                ? null
                : ['clinical-notes', access.user, patientId, index + 1],
        async (_key, _user, id, page) => {
            try {
                return await getClinicalNotes({ patient_id: id, page })
            } catch (error) {
                refreshFailed.current = true
                throw error
            }
        },
        { shouldRetryOnError: false, revalidateAll: true },
    )
    const pages = access.canView ? feed.data : undefined
    const notes = Array.from(
        new Map(
            pages?.flatMap(page => page.notes).map(note => [note.id, note]),
        ).values(),
    ).sort(
        (a, b) =>
            (Date.parse(b.created_at ?? '') || 0) -
                (Date.parse(a.created_at ?? '') || 0) || b.id - a.id,
    )
    // Apply the persisted mutation immediately. A failed refresh must not make a
    // successful save look like a failed write or hide the new timeline entry.
    const sync = async (saved?: ClinicalNote, deletedId?: number) => {
        await feed.mutate(current => {
            if (!current?.length)
                return saved
                    ? [
                          {
                              notes: [saved],
                              meta: {
                                  currentPage: 1,
                                  perPage: 15,
                                  lastPage: 1,
                              },
                          },
                      ]
                    : current
            const existing = current.some(page =>
                page.notes.some(note => note.id === saved?.id),
            )
            return current.map((page, index) => ({
                ...page,
                notes: [
                    ...(index === 0 && saved && !existing ? [saved] : []),
                    ...page.notes
                        .filter(note => note.id !== deletedId)
                        .map(note => (note.id === saved?.id ? saved : note)),
                ],
            }))
        }, false)
        try {
            refreshFailed.current = false
            await feed.mutate()
            // SWR 1 reports revalidation errors through its error state rather
            // than rejecting mutate's promise.
            return !refreshFailed.current
        } catch {
            return false
        }
    }
    return {
        ...access,
        notes,
        error: access.canView ? feed.error : undefined,
        isLoading: access.canView && !pages && !feed.error,
        isValidating: feed.isValidating,
        hasMore: Boolean(
            pages?.length && pages.length < Number(pages[0].meta.lastPage),
        ),
        loadMore: () => feed.setSize(feed.size + 1),
        retry: () => feed.mutate(),
        sync,
    }
}
