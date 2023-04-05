import type TypedEventEmitter from 'typed-emitter'
import { EventEmitter } from 'events'
import type {
    UnifiedList,
    UnifiedAnnotation,
    PageAnnotationsCacheEvents,
    PageAnnotationsCacheInterface,
    UnifiedAnnotationForCache,
    UnifiedListForCache,
} from './types'
import {
    AnnotationsSorter,
    sortByPagePosition,
} from 'src/sidebar/annotations-sidebar/sorting'
import {
    initNormalizedState,
    normalizedStateToArray,
} from '@worldbrain/memex-common/lib/common-ui/utils/normalized-state'
import { AnnotationPrivacyLevels } from '@worldbrain/memex-common/lib/annotations/types'
import { areArrayContentsEqual } from '@worldbrain/memex-common/lib/utils/array-comparison'

export interface PageAnnotationCacheDeps {
    normalizedPageUrl: string
    sortingFn?: AnnotationsSorter
    events?: TypedEventEmitter<PageAnnotationsCacheEvents>
    debug?: boolean
}

export class PageAnnotationsCache implements PageAnnotationsCacheInterface {
    pageListIds: PageAnnotationsCacheInterface['pageListIds'] = new Set()
    annotations: PageAnnotationsCacheInterface['annotations'] = initNormalizedState()
    lists: PageAnnotationsCacheInterface['lists'] = initNormalizedState()

    private annotationIdCounter = 0
    private listIdCounter = 0

    /*
     * Reverse indices to make local/remote list/annot -> cached ID lookups easy
     */
    private localListIdsToCacheIds = new Map<number, UnifiedList['unifiedId']>()
    private remoteListIdsToCacheIds = new Map<
        string,
        UnifiedList['unifiedId']
    >()
    private localAnnotIdsToCacheIds = new Map<
        string,
        UnifiedAnnotation['unifiedId']
    >()
    private remoteAnnotIdsToCacheIds = new Map<
        string,
        UnifiedAnnotation['unifiedId']
    >()

    constructor(private deps: PageAnnotationCacheDeps) {
        deps.sortingFn = deps.sortingFn ?? sortByPagePosition
        deps.events = deps.events ?? new EventEmitter()
    }

    private generateAnnotationId = (): string =>
        (this.annotationIdCounter++).toString()
    private generateListId = (): string => (this.listIdCounter++).toString()
    private isListShared = (listId: UnifiedList['unifiedId']): boolean =>
        this.lists.byId[listId]?.remoteId != null

    getLastAssignedAnnotationId = (): string =>
        (this.annotationIdCounter - 1).toString()
    getLastAssignedListId = (): string => (this.listIdCounter - 1).toString()
    get isEmpty(): PageAnnotationsCacheInterface['isEmpty'] {
        return this.annotations.allIds.length === 0
    }

    get normalizedPageUrl(): PageAnnotationsCacheInterface['normalizedPageUrl'] {
        return this.deps.normalizedPageUrl
    }

    get events(): PageAnnotationsCacheInterface['events'] {
        return this.deps.events
    }

    private warn = (msg: string) =>
        this.deps.debug ? console.warn(msg) : undefined

    getAnnotationsArray: PageAnnotationsCacheInterface['getAnnotationsArray'] = () =>
        normalizedStateToArray(this.annotations)

    getAnnotationByLocalId: PageAnnotationsCacheInterface['getAnnotationByLocalId'] = (
        localId,
    ) => {
        const unifiedAnnotId = this.localAnnotIdsToCacheIds.get(localId)
        if (unifiedAnnotId == null) {
            return null
        }
        return this.annotations.byId[unifiedAnnotId] ?? null
    }

    getAnnotationByRemoteId: PageAnnotationsCacheInterface['getAnnotationByRemoteId'] = (
        remoteId,
    ) => {
        const unifiedAnnotId = this.remoteAnnotIdsToCacheIds.get(remoteId)
        if (unifiedAnnotId == null) {
            return null
        }
        return this.annotations.byId[unifiedAnnotId] ?? null
    }

    getListByLocalId: PageAnnotationsCacheInterface['getListByLocalId'] = (
        localId,
    ) => {
        const unifiedListId = this.localListIdsToCacheIds.get(localId)
        if (unifiedListId == null) {
            return null
        }
        return this.lists.byId[unifiedListId] ?? null
    }

    getListByRemoteId: PageAnnotationsCacheInterface['getListByRemoteId'] = (
        remoteId,
    ) => {
        const unifiedListId = this.remoteListIdsToCacheIds.get(remoteId)
        if (unifiedListId == null) {
            return null
        }
        return this.lists.byId[unifiedListId] ?? null
    }

    private prepareListForCaching = (
        list: UnifiedListForCache,
    ): UnifiedList => {
        const unifiedId = this.generateListId()
        if (list.localId != null) {
            this.localListIdsToCacheIds.set(list.localId, unifiedId)
        }
        if (list.remoteId != null) {
            this.remoteListIdsToCacheIds.set(list.remoteId, unifiedId)
        }

        // Ensure each annot gets a ref back to this list
        list.unifiedAnnotationIds.forEach((unifiedAnnotId) => {
            const cachedAnnot = this.annotations.byId[unifiedAnnotId]
            if (
                !cachedAnnot ||
                cachedAnnot.unifiedListIds.includes(unifiedId)
            ) {
                return
            }
            cachedAnnot.unifiedListIds.unshift(unifiedId)
        })

        return { ...list, unifiedId }
    }

    private prepareAnnotationForCaching = (
        { localListIds, ...annotation }: UnifiedAnnotationForCache,
        opts: { now: number },
    ): UnifiedAnnotation => {
        const unifiedAnnotationId = this.generateAnnotationId()
        if (annotation.remoteId != null) {
            this.remoteAnnotIdsToCacheIds.set(
                annotation.remoteId,
                unifiedAnnotationId,
            )
        }
        if (annotation.localId != null) {
            this.localAnnotIdsToCacheIds.set(
                annotation.localId,
                unifiedAnnotationId,
            )
        }

        let privacyLevel = annotation.privacyLevel

        const unifiedListIds = [
            ...new Set(
                [
                    ...(annotation.unifiedListIds ?? []),
                    ...localListIds.map((localListId) => {
                        const unifiedListId = this.localListIdsToCacheIds.get(
                            localListId,
                        )
                        if (!unifiedListId) {
                            this.warn(
                                'No cached list data found for given local list IDs on annotation - did you remember to cache lists before annotations?',
                            )
                            return null
                        }

                        if (this.lists.byId[unifiedListId]?.remoteId != null) {
                            privacyLevel = AnnotationPrivacyLevels.PROTECTED
                        }

                        return unifiedListId
                    }),
                ].filter((id) => id != null && this.lists.byId[id] != null),
            ),
        ]

        // Ensure each list gets a ref back to this annot
        unifiedListIds.forEach((unifiedListId) => {
            const cachedList = this.lists.byId[unifiedListId]
            if (
                !cachedList ||
                cachedList.unifiedAnnotationIds.includes(unifiedAnnotationId)
            ) {
                return
            }
            cachedList.unifiedAnnotationIds.unshift(unifiedAnnotationId)
        })

        return {
            ...annotation,
            privacyLevel,
            unifiedListIds,
            createdWhen: annotation.createdWhen ?? opts.now,
            lastEdited:
                annotation.lastEdited ?? annotation.createdWhen ?? opts.now,
            unifiedId: unifiedAnnotationId,
        }
    }

    private ensurePageListsSet(
        unifiedListIds: UnifiedList['unifiedId'][],
    ): void {
        for (const listId of unifiedListIds) {
            if (!this.lists.byId[listId]) {
                continue
            }
            this.pageListIds.add(listId)
        }
    }

    setPageData: PageAnnotationsCacheInterface['setPageData'] = (
        normalizedPageUrl,
        pageListIds,
    ) => {
        if (this.deps.normalizedPageUrl !== normalizedPageUrl) {
            this.deps.normalizedPageUrl = normalizedPageUrl
        }
        this.pageListIds.clear()
        this.ensurePageListsSet(pageListIds)
        this.events.emit('updatedPageData', normalizedPageUrl, this.pageListIds)
        this.updateSharedAnnotationsWithSharedPageLists()
    }

    private get sharedPageListIds(): UnifiedList['unifiedId'][] {
        return [...this.pageListIds].filter(this.isListShared)
    }

    private updateSharedAnnotationsWithSharedPageLists() {
        let shouldEmitAnnotUpdateEvent = false
        this.annotations = initNormalizedState({
            seedData: normalizedStateToArray(this.annotations).map((annot) => {
                const nextUnifiedListIds = Array.from(
                    new Set([
                        ...this.sharedPageListIds,
                        ...annot.unifiedListIds.filter(
                            (listId) => !this.isListShared(listId),
                        ),
                    ]),
                )
                if (
                    annot.privacyLevel < AnnotationPrivacyLevels.SHARED ||
                    areArrayContentsEqual(
                        annot.unifiedListIds,
                        nextUnifiedListIds,
                    )
                ) {
                    return annot
                }

                shouldEmitAnnotUpdateEvent = true
                return { ...annot, unifiedListIds: nextUnifiedListIds }
            }),
            getId: (annot) => annot.unifiedId,
        })

        if (shouldEmitAnnotUpdateEvent) {
            this.events.emit('newAnnotationsState', this.annotations)
        }
    }

    private updateCachedListAnnotationRefsForAnnotationUpdate(
        prev: Pick<UnifiedAnnotation, 'unifiedListIds' | 'unifiedId'>,
        next: Pick<UnifiedAnnotation, 'unifiedListIds'>,
    ): void {
        // For each removed list, ensure annotation link is removed from cached list
        const removedListIds = prev.unifiedListIds.filter(
            (listId) => !next.unifiedListIds.includes(listId),
        )
        for (const listId of removedListIds) {
            const cachedList = this.lists.byId[listId]
            if (cachedList) {
                cachedList.unifiedAnnotationIds = cachedList.unifiedAnnotationIds.filter(
                    (annotId) => annotId !== prev.unifiedId,
                )
            }
        }

        // For each added list, ensure annotation link is added to cached list
        const addedListIds = next.unifiedListIds.filter(
            (listId) => !prev.unifiedListIds.includes(listId),
        )
        for (const listId of addedListIds) {
            const cachedList = this.lists.byId[listId]
            if (
                cachedList &&
                !cachedList.unifiedAnnotationIds.includes(prev.unifiedId)
            ) {
                cachedList.unifiedAnnotationIds.push(prev.unifiedId)
            }
        }
    }

    setAnnotations: PageAnnotationsCacheInterface['setAnnotations'] = (
        annotations,
        { now = Date.now() } = { now: Date.now() },
    ) => {
        this.annotationIdCounter = 0
        this.localAnnotIdsToCacheIds.clear()
        this.remoteAnnotIdsToCacheIds.clear()

        const seedData = [...annotations]
            .sort(this.deps.sortingFn)
            .map((annot) => this.prepareAnnotationForCaching(annot, { now }))
        this.annotations = initNormalizedState({
            seedData,
            getId: (annot) => annot.unifiedId,
        })
        this.events.emit('newAnnotationsState', this.annotations)

        return { unifiedIds: seedData.map((annot) => annot.unifiedId) }
    }

    setLists: PageAnnotationsCacheInterface['setLists'] = (lists) => {
        this.listIdCounter = 0
        this.localListIdsToCacheIds.clear()
        this.remoteListIdsToCacheIds.clear()

        const seedData = [...lists].map(this.prepareListForCaching)
        this.lists = initNormalizedState({
            seedData,
            getId: (list) => list.unifiedId,
        })
        this.events.emit('newListsState', this.lists)

        return { unifiedIds: seedData.map((list) => list.unifiedId) }
    }

    sortLists: PageAnnotationsCacheInterface['sortLists'] = (sortingFn) => {
        throw new Error('List sorting not yet implemented')
    }

    sortAnnotations: PageAnnotationsCacheInterface['sortAnnotations'] = (
        sortingFn,
    ) => {
        if (sortingFn) {
            this.deps.sortingFn = sortingFn
        }

        this.annotations.allIds = normalizedStateToArray(this.annotations)
            .sort(this.deps.sortingFn)
            .map((annot) => annot.unifiedId)
        this.events.emit('newAnnotationsState', this.annotations)
    }

    addAnnotation: PageAnnotationsCacheInterface['addAnnotation'] = (
        annotation,
        { now = Date.now() } = { now: Date.now() },
    ) => {
        // This covers the case of adding a downloaded remote annot that already exists locally, and thus would have been cached already
        //  (currently don't distinguish own remote annots from others')
        if (annotation.remoteId != null) {
            const existingId = this.remoteAnnotIdsToCacheIds.get(
                annotation.remoteId,
            )
            if (existingId != null) {
                return { unifiedId: existingId }
            }
        }

        const nextAnnotation = this.prepareAnnotationForCaching(annotation, {
            now,
        })

        if (nextAnnotation.privacyLevel >= AnnotationPrivacyLevels.SHARED) {
            nextAnnotation.unifiedListIds = [
                ...new Set([
                    ...this.sharedPageListIds,
                    ...annotation.unifiedListIds,
                ]),
            ]
        }

        this.annotations.allIds = [
            nextAnnotation.unifiedId,
            ...this.annotations.allIds,
        ]
        this.annotations.byId = {
            ...this.annotations.byId,
            [nextAnnotation.unifiedId]: nextAnnotation,
        }

        this.events.emit('addedAnnotation', nextAnnotation)
        this.events.emit('newAnnotationsState', this.annotations)
        return { unifiedId: nextAnnotation.unifiedId }
    }

    addList: PageAnnotationsCacheInterface['addList'] = (list) => {
        const nextList = this.prepareListForCaching(list)
        this.lists.allIds = [nextList.unifiedId, ...this.lists.allIds]
        this.lists.byId = {
            ...this.lists.byId,
            [nextList.unifiedId]: nextList,
        }

        this.events.emit('addedList', nextList)
        this.events.emit('newListsState', this.lists)
        return { unifiedId: nextList.unifiedId }
    }

    updateAnnotation: PageAnnotationsCacheInterface['updateAnnotation'] = (
        updates,
        opts,
    ) => {
        const previous = this.annotations.byId[updates.unifiedId]
        if (!previous) {
            throw new Error('No existing cached annotation found to update')
        }

        let shouldUpdateSiblingAnnots = false
        let nextUnifiedListIds = [...previous.unifiedListIds]
        let privacyLevel = updates.privacyLevel

        if (previous.privacyLevel === updates.privacyLevel) {
            nextUnifiedListIds = [...updates.unifiedListIds]

            // If changing a public annot's lists, those shared list changes should cascade to other sibling shared annots
            if (previous.privacyLevel === AnnotationPrivacyLevels.SHARED) {
                const sharedListIds = updates.unifiedListIds.filter(
                    this.isListShared,
                )
                this.ensurePageListsSet(sharedListIds)
                shouldUpdateSiblingAnnots = true
            }
        } else if (
            previous.privacyLevel !== AnnotationPrivacyLevels.PRIVATE &&
            updates.privacyLevel <= AnnotationPrivacyLevels.PRIVATE
        ) {
            if (opts?.keepListsIfUnsharing) {
                // Keep all lists, but need to change level to 'protected'
                privacyLevel = AnnotationPrivacyLevels.PROTECTED
            } else {
                // Keep only private lists
                nextUnifiedListIds = nextUnifiedListIds.filter(
                    (listId) => !this.isListShared(listId),
                )
            }
        } else if (
            previous.privacyLevel <= AnnotationPrivacyLevels.PRIVATE &&
            updates.privacyLevel >= AnnotationPrivacyLevels.SHARED
        ) {
            // Need to inherit parent page's shared lists if sharing
            nextUnifiedListIds = Array.from(
                new Set([...nextUnifiedListIds, ...this.sharedPageListIds]),
            )
        }

        if (previous.remoteId !== updates.remoteId) {
            this.remoteAnnotIdsToCacheIds.set(
                updates.remoteId,
                previous.unifiedId,
            )
        }

        const next: UnifiedAnnotation = {
            ...previous,
            privacyLevel,
            unifiedListIds: nextUnifiedListIds,
            comment: updates.comment,
            remoteId: updates.remoteId ?? previous.remoteId,
            lastEdited: opts?.updateLastEditedTimestamp
                ? opts?.now ?? Date.now()
                : previous.lastEdited,
        }

        this.updateCachedListAnnotationRefsForAnnotationUpdate(previous, next)

        this.annotations = {
            ...this.annotations,
            byId: {
                ...this.annotations.byId,
                [updates.unifiedId]: next,
            },
        }
        this.events.emit('updatedAnnotation', next)
        this.events.emit('newAnnotationsState', this.annotations)

        if (shouldUpdateSiblingAnnots) {
            this.updateSharedAnnotationsWithSharedPageLists()
        }
    }

    updateList: PageAnnotationsCacheInterface['updateList'] = (updates) => {
        const previousList = this.lists.byId[updates.unifiedId]
        if (!previousList) {
            throw new Error('No existing cached list found to update')
        }

        const nextList: UnifiedList = {
            ...previousList,
            name: updates.name ?? previousList.name,
            remoteId: updates.remoteId ?? previousList.remoteId,
            description: updates.description ?? previousList.description,
        }

        if (previousList.remoteId !== nextList.remoteId) {
            this.remoteListIdsToCacheIds.set(
                nextList.remoteId,
                nextList.unifiedId,
            )
        }

        this.lists = {
            ...this.lists,
            byId: {
                ...this.lists.byId,
                [updates.unifiedId]: nextList,
            },
        }
        this.events.emit('updatedList', nextList)
        this.events.emit('newListsState', this.lists)

        // If share status changed, reflect updates in any public annotations
        if (previousList.remoteId != nextList.remoteId) {
            this.updateSharedAnnotationsWithSharedPageLists()
        }
    }

    removeAnnotation: PageAnnotationsCacheInterface['removeAnnotation'] = ({
        unifiedId,
    }) => {
        const previousAnnotation = this.annotations.byId[unifiedId]
        if (!previousAnnotation) {
            throw new Error('No existing cached annotation found to remove')
        }

        if (previousAnnotation.remoteId != null) {
            this.remoteAnnotIdsToCacheIds.delete(previousAnnotation.remoteId)
        }
        if (previousAnnotation.localId != null) {
            this.localAnnotIdsToCacheIds.delete(previousAnnotation.localId)
        }
        delete this.annotations.byId[previousAnnotation.unifiedId]
        this.annotations.allIds = this.annotations.allIds.filter(
            (id) => id !== unifiedId,
        )

        this.events.emit('removedAnnotation', previousAnnotation)
        this.events.emit('newAnnotationsState', this.annotations)
    }

    removeList: PageAnnotationsCacheInterface['removeList'] = (list) => {
        const previousList = this.lists.byId[list.unifiedId]
        if (!previousList) {
            throw new Error('No existing cached list found to remove')
        }

        if (previousList.remoteId != null) {
            this.remoteListIdsToCacheIds.delete(previousList.remoteId)
        }
        if (previousList.localId != null) {
            this.localListIdsToCacheIds.delete(previousList.localId)
        }
        this.lists.allIds = this.lists.allIds.filter(
            (unifiedListId) => unifiedListId !== list.unifiedId,
        )
        delete this.lists.byId[list.unifiedId]

        this.events.emit('removedList', previousList)
        this.events.emit('newListsState', this.lists)
    }
}