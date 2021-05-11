import fromPairs from 'lodash/fromPairs'
import debounce from 'lodash/debounce'
import { UILogic, UIEventHandler, UIMutation } from 'ui-logic-core'
import { isFullUrl } from '@worldbrain/memex-url-utils'
import { EventEmitter } from 'events'

import { Annotation, AnnotationPrivacyLevels } from 'src/annotations/types'
import { loadInitial, executeUITask } from 'src/util/ui-logic'
import type {
    SidebarContainerDependencies,
    SidebarContainerState,
    SidebarContainerEvents,
    EditForm,
    EditForms,
} from './types'
import { AnnotationsSidebarInPageEventEmitter } from '../types'
import { DEF_RESULT_LIMIT } from '../constants'
import {
    generateUrl,
    getLastSharedAnnotationTimestamp,
    setLastSharedAnnotationTimestamp,
} from 'src/annotations/utils'
import { areTagsEquivalent } from 'src/tags/utils'
import { FocusableComponent } from 'src/annotations/components/types'
import { CachedAnnotation } from 'src/annotations/annotations-cache'
import { initNormalizedState } from 'src/common-ui/utils'

export type SidebarContainerOptions = SidebarContainerDependencies & {
    events?: AnnotationsSidebarInPageEventEmitter
}

export type SidebarLogicOptions = SidebarContainerOptions & {
    focusCreateForm: FocusableComponent['focus']
}

type EventHandler<
    EventName extends keyof SidebarContainerEvents
> = UIEventHandler<SidebarContainerState, SidebarContainerEvents, EventName>

export const INIT_FORM_STATE: EditForm = {
    isBookmarked: false,
    isTagInputActive: false,
    commentText: '',
    tags: [],
}

export const createEditFormsForAnnotations = (annots: Annotation[]) => {
    const state: { [annotationUrl: string]: EditForm } = {}
    for (const annot of annots) {
        state[annot.url] = { ...INIT_FORM_STATE }
    }
    return state
}

export class SidebarContainerLogic extends UILogic<
    SidebarContainerState,
    SidebarContainerEvents
> {
    private inPageEvents: AnnotationsSidebarInPageEventEmitter

    constructor(private options: SidebarLogicOptions) {
        super()

        this.inPageEvents =
            options.events ??
            (new EventEmitter() as AnnotationsSidebarInPageEventEmitter)
    }

    private get resultLimit(): number {
        return this.options.searchResultLimit ?? DEF_RESULT_LIMIT
    }

    getInitialState(): SidebarContainerState {
        return {
            notesType: 'private',
            loadState: 'pristine',
            primarySearchState: 'pristine',
            secondarySearchState: 'pristine',
            followedListLoadState: 'pristine',

            followedLists: initNormalizedState(),
            followedNotes: {},
            users: {},

            isLocked: false,
            pageUrl: this.options.pageUrl,
            showState: this.options.initialState ?? 'hidden',
            annotationModes: {
                pageAnnotations: {},
                searchResults: {},
            },
            annotationSharingInfo: {},
            annotationSharingAccess: 'feature-disabled',

            showAllNotesCopyPaster: false,
            activeCopyPasterAnnotationId: undefined,
            activeTagPickerAnnotationId: undefined,

            commentBox: { ...INIT_FORM_STATE },
            editForms: {},

            allAnnotationsExpanded: false,
            isSocialPost: false,
            annotations: [],
            activeAnnotationUrl: null,

            showCommentBox: false,
            showCongratsMessage: false,
            showClearFiltersBtn: false,
            showFiltersSidebar: false,
            showSocialSearch: false,

            pageCount: 0,
            noResults: false,
            annotCount: 0,
            shouldShowCount: false,
            isInvalidSearch: false,
            totalResultCount: 0,
            isListFilterActive: false,
            isSocialSearch: false,
            searchResultSkip: 0,

            showLoginModal: false,
            showAnnotationsShareModal: false,
            showBetaFeatureNotifModal: false,
            showAllNotesShareMenu: false,
            activeShareMenuNoteId: undefined,
            immediatelyShareNotes: false,
        }
    }

    init: EventHandler<'init'> = async ({ previousState }) => {
        this.options.annotationsCache.annotationChanges.addListener(
            'newState',
            this.annotationSubscription,
        )

        // Set initial state, based on what's in the cache (assuming it already has been hydrated)
        this.annotationSubscription(this.options.annotationsCache.annotations)

        await loadInitial<SidebarContainerState>(this, async () => {
            // If `pageUrl` prop passed down, load search results on init, else just wait
            if (this.options.pageUrl != null) {
                await this._doSearch(previousState, { overwrite: true })
            }

            await this.loadBeta()
        })
    }

    cleanup = () => {
        this.options.annotationsCache.annotationChanges.removeListener(
            'newState',
            this.annotationSubscription,
        )
    }

    private annotationSubscription = (annotations: CachedAnnotation[]) => {
        const mutation: UIMutation<SidebarContainerState> = {
            annotations: { $set: annotations },
            editForms: {
                $apply: (editForms: EditForms) => {
                    for (const { url } of annotations) {
                        if (editForms[url] == null) {
                            editForms[url] = { ...INIT_FORM_STATE }
                        }
                    }
                    return editForms
                },
            },
        }

        for (const { privacyLevel, url } of annotations) {
            mutation.annotationSharingInfo = {
                ...(mutation.annotationSharingInfo || {}),
                [url]: {
                    $set: {
                        status:
                            privacyLevel === AnnotationPrivacyLevels.SHARED
                                ? 'shared'
                                : 'not-yet-shared',
                        taskState: 'pristine',
                        privacyLevel,
                    },
                },
            }
        }

        this.emitMutation(mutation)
    }

    sortAnnotations: EventHandler<'sortAnnotations'> = ({
        event: { sortingFn },
    }) => this.options.annotationsCache.sort(sortingFn)

    private async loadBeta() {
        const isAllowed = await this.options.auth.isAuthorizedForFeature('beta')

        this.emitMutation({
            annotationSharingAccess: {
                $set: isAllowed ? 'sharing-allowed' : 'feature-disabled',
            },
        })
    }

    private async ensureLoggedIn(
        params: {
            ensureBetaAccess?: boolean
        } = {},
    ): Promise<boolean> {
        const { auth } = this.options

        const user = await auth.getCurrentUser()
        if (user != null) {
            const isBetaAuthd = await auth.isAuthorizedForFeature('beta')

            const mutation: UIMutation<SidebarContainerState> = {
                annotationSharingAccess: {
                    $set: isBetaAuthd ? 'sharing-allowed' : 'feature-disabled',
                },
            }

            if (params.ensureBetaAccess && !isBetaAuthd) {
                this.emitMutation({
                    ...mutation,
                    showBetaFeatureNotifModal: { $set: true },
                })
                return false
            }

            this.emitMutation(mutation)
            return true
        }

        this.emitMutation({ showLoginModal: { $set: true } })
        return false
    }

    setNotesType: EventHandler<'setNotesType'> = async ({
        event,
        previousState,
    }) => {
        const mutation: UIMutation<SidebarContainerState> = {
            notesType: { $set: event.notesType },
        }

        this.emitMutation(mutation)

        if (
            event.notesType === 'shared' &&
            previousState.followedListLoadState === 'pristine'
        ) {
            await this.processUIEvent('loadFollowedLists', {
                previousState: this.withMutation(previousState, mutation),
                event: null,
            })
        }
    }

    show: EventHandler<'show'> = async () => {
        this.emitMutation({ showState: { $set: 'visible' } })
    }

    lock: EventHandler<'lock'> = () =>
        this.emitMutation({ isLocked: { $set: true } })
    unlock: EventHandler<'unlock'> = () =>
        this.emitMutation({ isLocked: { $set: false } })

    copyNoteLink: EventHandler<'copyNoteLink'> = async ({
        event: { link },
    }) => {
        this.options.analytics.trackEvent({
            category: 'ContentSharing',
            action: 'copyNoteLink',
        })

        await this.options.copyToClipboard(link)
    }

    copyPageLink: EventHandler<'copyPageLink'> = async ({
        event: { link },
    }) => {
        this.options.analytics.trackEvent({
            category: 'ContentSharing',
            action: 'copyPageLink',
        })

        await this.options.copyToClipboard(link)
    }

    private doSearch = debounce(this._doSearch, 300)

    private async _doSearch(
        state: SidebarContainerState,
        opts: { overwrite: boolean },
    ) {
        await executeUITask(
            this,
            opts.overwrite ? 'primarySearchState' : 'secondarySearchState',
            async () => {
                if (opts.overwrite && state.pageUrl != null) {
                    await this.options.annotationsCache.load(state.pageUrl)
                }
            },
        )
    }

    paginateSearch: EventHandler<'paginateSearch'> = async ({
        previousState,
    }) => {
        if (previousState.noResults) {
            return
        }

        const mutation: UIMutation<SidebarContainerState> = {
            searchResultSkip: {
                $apply: (prev) => prev + this.resultLimit,
            },
        }
        this.emitMutation(mutation)
        const nextState = this.withMutation(previousState, mutation)

        await this.doSearch(nextState, { overwrite: false })
    }

    setPageUrl: EventHandler<'setPageUrl'> = ({ previousState, event }) => {
        if (!isFullUrl(event.pageUrl)) {
            throw new Error(
                'Tried to set annotation sidebar with a normalized page URL',
            )
        }

        const mutation: UIMutation<SidebarContainerState> = {
            pageUrl: { $set: event.pageUrl },
        }
        this.emitMutation(mutation)
        const nextState = this.withMutation(previousState, mutation)

        return this._doSearch(nextState, { overwrite: true })
    }

    resetShareMenuNoteId: EventHandler<'resetShareMenuNoteId'> = ({}) => {
        this.emitMutation({
            activeShareMenuNoteId: { $set: undefined },
            immediatelyShareNotes: { $set: false },
        })
    }

    setAllNotesShareMenuShown: EventHandler<
        'setAllNotesShareMenuShown'
    > = async ({ previousState, event }) => {
        if (!(await this.ensureLoggedIn())) {
            return
        }

        if (previousState.annotationSharingAccess === 'feature-disabled') {
            this.options.showBetaFeatureNotifModal?.()
            return
        }

        this.emitMutation({
            showAllNotesShareMenu: { $set: event.shown },
        })
    }

    setLoginModalShown: EventHandler<'setLoginModalShown'> = ({ event }) => {
        this.emitMutation({ showLoginModal: { $set: event.shown } })
    }

    setAllNotesCopyPasterShown: EventHandler<'setAllNotesCopyPasterShown'> = ({
        event,
    }) => {
        this.emitMutation({
            showAllNotesCopyPaster: { $set: event.shown },
            activeCopyPasterAnnotationId: { $set: undefined },
        })
    }

    setCopyPasterAnnotationId: EventHandler<'setCopyPasterAnnotationId'> = ({
        event,
        previousState,
    }) => {
        const newId =
            previousState.activeCopyPasterAnnotationId === event.id
                ? undefined
                : event.id

        this.emitMutation({
            activeCopyPasterAnnotationId: { $set: newId },
            showAllNotesCopyPaster: { $set: false },
        })
    }

    setTagPickerAnnotationId: EventHandler<'setTagPickerAnnotationId'> = ({
        event,
        previousState,
    }) => {
        const newId =
            previousState.activeTagPickerAnnotationId === event.id
                ? undefined
                : event.id

        this.emitMutation({
            activeTagPickerAnnotationId: { $set: newId },
        })
    }

    resetTagPickerAnnotationId: EventHandler<
        'resetTagPickerAnnotationId'
    > = () => {
        this.emitMutation({ activeTagPickerAnnotationId: { $set: undefined } })
    }

    resetCopyPasterAnnotationId: EventHandler<
        'resetCopyPasterAnnotationId'
    > = () => {
        this.emitMutation({
            showAllNotesCopyPaster: { $set: false },
            activeCopyPasterAnnotationId: { $set: undefined },
        })
    }

    hide: EventHandler<'hide'> = () => {
        this.emitMutation({
            showState: { $set: 'hidden' },
            activeAnnotationUrl: { $set: null },
        })
    }

    addNewPageComment: EventHandler<'addNewPageComment'> = async ({
        event,
    }) => {
        const mutation: UIMutation<SidebarContainerState> = {
            showCommentBox: { $set: true },
        }

        if (event.comment?.length) {
            mutation.commentBox = {
                ...mutation.commentBox,
                commentText: { $set: event.comment },
            }
        }

        if (event.tags?.length) {
            mutation.commentBox = {
                ...mutation.commentBox,
                tags: { $set: event.tags },
            }
        }

        this.emitMutation(mutation)
        this.options.focusCreateForm()
    }

    // Unused since insta-saving new highlights
    setNewPageCommentAnchor: EventHandler<'setNewPageCommentAnchor'> = (
        incoming,
    ) => {
        this.emitMutation({
            // commentBox: { anchor: { $set: incoming.event.anchor } },
        })
    }

    cancelEdit: EventHandler<'cancelEdit'> = ({ event }) => {
        this.emitMutation({
            annotationModes: {
                pageAnnotations: {
                    [event.annotationUrl]: {
                        $set: 'default',
                    },
                },
            },
        })
    }

    changeEditCommentText: EventHandler<'changeEditCommentText'> = ({
        event,
    }) => {
        this.emitMutation({
            editForms: {
                [event.annotationUrl]: { commentText: { $set: event.comment } },
            },
        })
    }

    changeNewPageCommentText: EventHandler<'changeNewPageCommentText'> = ({
        event,
    }) => {
        this.emitMutation({
            commentBox: { commentText: { $set: event.comment } },
        })
    }

    receiveSharingAccessChange: EventHandler<'receiveSharingAccessChange'> = ({
        event: { sharingAccess },
    }) => {
        this.emitMutation({ annotationSharingAccess: { $set: sharingAccess } })
    }

    // TODO (sidebar-refactor) reconcile this duplicate code with ribbon notes save
    saveNewPageComment: EventHandler<'saveNewPageComment'> = async ({
        event,
        previousState: { commentBox, pageUrl },
    }) => {
        const { annotationsCache, contentSharing } = this.options
        const comment = commentBox.commentText.trim()
        if (comment.length === 0) {
            return
        }

        const annotationUrl = generateUrl({ pageUrl, now: () => Date.now() })

        this.emitMutation({
            commentBox: { $set: INIT_FORM_STATE },
            showCommentBox: { $set: false },
        })

        await annotationsCache.create({
            url: annotationUrl,
            pageUrl,
            comment,
            tags: commentBox.tags,
            privacyLevel: event.privacyLevel,
        })

        if (event.privacyLevel === AnnotationPrivacyLevels.SHARED) {
            await contentSharing
                .shareAnnotation({
                    annotationUrl,
                    queueInteraction: 'queue-and-return',
                })
                .catch(() => {})
            await contentSharing
                .shareAnnotationsToLists({
                    annotationUrls: [annotationUrl],
                    queueInteraction: 'queue-and-return',
                })
                .catch(() => {})
            await this.ensureLoggedIn()
        }
    }

    cancelNewPageComment: EventHandler<'cancelNewPageComment'> = () => {
        this.emitMutation({
            commentBox: { $set: INIT_FORM_STATE },
            showCommentBox: { $set: false },
        })
    }

    private createTagsStateUpdater = (args: {
        added?: string
        deleted?: string
    }): ((tags: string[]) => string[]) => {
        if (args.added) {
            return (tags) => {
                const tag = args.added
                return tags.includes(tag) ? tags : [...tags, tag]
            }
        }

        return (tags) => {
            const index = tags.indexOf(args.deleted)
            if (index === -1) {
                return tags
            }

            return [...tags.slice(0, index), ...tags.slice(index + 1)]
        }
    }

    updateTagsForEdit: EventHandler<'updateTagsForEdit'> = async ({
        event,
    }) => {
        const tagsStateUpdater = this.createTagsStateUpdater(event)

        this.emitMutation({
            editForms: {
                [event.annotationUrl]: { tags: { $apply: tagsStateUpdater } },
            },
        })
    }

    updateListsForPageResult: EventHandler<
        'updateListsForPageResult'
    > = async ({ event }) => {
        return this.options.customLists.updateListForPage({
            added: event.added,
            deleted: event.deleted,
            url: event.url,
        })
    }

    setEditCommentTagPicker: EventHandler<'setEditCommentTagPicker'> = ({
        event,
    }) => {
        this.emitMutation({
            editForms: {
                [event.annotationUrl]: {
                    isTagInputActive: { $set: event.active },
                },
            },
        })
    }

    updateNewPageCommentTags: EventHandler<'updateNewPageCommentTags'> = ({
        event,
    }) => {
        this.emitMutation({
            commentBox: { tags: { $set: event.tags } },
        })
    }

    private createTagStateDeleteUpdater = (args: { tag: string }) => (
        tags: string[],
    ) => {
        const tagIndex = tags.indexOf(args.tag)
        if (tagIndex === -1) {
            return tags
        }

        tags = [...tags]
        tags.splice(tagIndex, 1)
        return tags
    }

    deleteEditCommentTag: EventHandler<'deleteEditCommentTag'> = ({
        event,
    }) => {
        this.emitMutation({
            editForms: {
                [event.annotationUrl]: {
                    tags: {
                        $apply: this.createTagStateDeleteUpdater(event),
                    },
                },
            },
        })
    }

    setActiveAnnotationUrl: EventHandler<'setActiveAnnotationUrl'> = async ({
        event,
    }) => {
        this.options.events?.emit('highlightAndScroll', {
            url: event.annotationUrl,
        })
        this.emitMutation({
            activeAnnotationUrl: { $set: event.annotationUrl },
        })
    }

    goToAnnotationInNewTab: EventHandler<'goToAnnotationInNewTab'> = async ({
        event,
        previousState,
    }) => {
        this.emitMutation({
            activeAnnotationUrl: { $set: event.annotationUrl },
        })

        const annotation = previousState.annotations.find(
            (annot) => annot.url === event.annotationUrl,
        )

        return this.options.annotations.goToAnnotationFromSidebar({
            url: annotation.pageUrl,
            annotation,
        })
    }

    editAnnotation: EventHandler<'editAnnotation'> = async ({
        event,
        previousState,
    }) => {
        const {
            editForms: { [event.annotationUrl]: form },
        } = previousState

        const comment = form.commentText.trim()
        const existing = previousState.annotations.find(
            (annot) => annot.url === event.annotationUrl,
        )

        const somethingChanged = !(
            existing.comment === comment &&
            areTagsEquivalent(existing.tags, form.tags)
        )

        if (somethingChanged) {
            this.options.annotationsCache.update({
                ...existing,
                comment,
                tags: form.tags,
            })
        }

        this.emitMutation({
            annotationModes: {
                [event.context]: {
                    [event.annotationUrl]: { $set: 'default' },
                },
            },
            editForms: {
                [event.annotationUrl]: {
                    $set: { ...INIT_FORM_STATE },
                },
            },
        })
    }

    deleteAnnotation: EventHandler<'deleteAnnotation'> = async ({
        event,
        previousState,
    }) => {
        const resultIndex = previousState.annotations.findIndex(
            (annot) => annot.url === event.annotationUrl,
        )
        const annotation = previousState.annotations[resultIndex]
        this.options.annotationsCache.delete(annotation)
    }

    shareAnnotation: EventHandler<'shareAnnotation'> = async ({
        event,
        previousState,
    }) => {
        if (!(await this.ensureLoggedIn())) {
            return
        }

        if (previousState.annotationSharingAccess === 'feature-disabled') {
            this.options.showBetaFeatureNotifModal?.()
            return
        }

        const immediateShare =
            event.mouseEvent.metaKey && event.mouseEvent.altKey

        this.emitMutation({
            activeShareMenuNoteId: { $set: event.annotationUrl },
            immediatelyShareNotes: { $set: !!immediateShare },
        })
        await this.setLastSharedAnnotationTimestamp()
    }

    setAnnotationEditMode: EventHandler<'setAnnotationEditMode'> = ({
        event,
        previousState,
    }) => {
        const previousForm = previousState.editForms[event.annotationUrl]
        const annotation = previousState.annotations.find(
            (annot) => annot.url === event.annotationUrl,
        )

        const mutation: UIMutation<SidebarContainerState> = {
            annotationModes: {
                [event.context]: {
                    [event.annotationUrl]: { $set: 'edit' },
                },
            },
        }

        // If there was existing form state, we want to keep that, else use the stored annot data or defaults
        if (
            !previousForm ||
            (!previousForm?.commentText?.length && !previousForm?.tags?.length)
        ) {
            mutation.editForms = {
                [event.annotationUrl]: {
                    commentText: { $set: annotation.comment ?? '' },
                    tags: { $set: annotation.tags ?? [] },
                },
            }
        }

        this.emitMutation(mutation)
    }

    switchAnnotationMode: EventHandler<'switchAnnotationMode'> = ({
        event,
    }) => {
        this.emitMutation({
            annotationModes: {
                [event.context]: {
                    [event.annotationUrl]: {
                        $set: event.mode,
                    },
                },
            },
        })
    }

    setAnnotationsExpanded: EventHandler<'setAnnotationsExpanded'> = (
        incoming,
    ) => {}

    fetchSuggestedTags: EventHandler<'fetchSuggestedTags'> = (incoming) => {}

    fetchSuggestedDomains: EventHandler<'fetchSuggestedDomains'> = (
        incoming,
    ) => {}

    loadFollowedLists: EventHandler<'loadFollowedLists'> = async () => {
        const { customLists } = this.options

        await executeUITask(this, 'followedListLoadState', async () => {
            const followedLists = await customLists.fetchAllFollowedLists({
                limit: 1000,
            })

            this.emitMutation({
                followedLists: {
                    allIds: {
                        $set: followedLists.map((list) => list.remoteId),
                    },
                    byId: {
                        $set: fromPairs(
                            followedLists.map((list) => [
                                list.remoteId,
                                {
                                    id: list.remoteId,
                                    name: list.name,
                                    notesCount: 0, // TODO: implement this
                                    isExpanded: false,
                                },
                            ]),
                        ),
                    },
                },
            })
        })
    }

    loadFollowedListNotes: EventHandler<'loadFollowedListNotes'> = async ({
        event,
    }) => {
        await executeUITask(
            this,
            (taskState) => ({
                followedLists: {
                    byId: {
                        [event.listId]: { loadState: { $set: taskState } },
                    },
                },
            }),
            async () => {
                const notes = [] // TODO: implement this

                this.emitMutation({
                    followedLists: {
                        byId: {
                            [event.listId]: {
                                noteIds: { $set: notes.map((note) => note.id) },
                            },
                        },
                    },
                })
            },
        )
    }

    toggleAllAnnotationsFold: EventHandler<'toggleAllAnnotationsFold'> = (
        incoming,
    ) => {
        return { allAnnotationsExpanded: { $apply: (value) => !value } }
    }

    setAnnotationShareModalShown: EventHandler<
        'setAnnotationShareModalShown'
    > = ({ event }) => {
        this.emitMutation({ showAnnotationsShareModal: { $set: event.shown } })
    }

    setBetaFeatureNotifModalShown: EventHandler<
        'setBetaFeatureNotifModalShown'
    > = ({ event }) => {
        this.emitMutation({ showBetaFeatureNotifModal: { $set: event.shown } })
    }

    private async _detectSharedAnnotations(annotationUrls: string[]) {
        const annotationSharingInfo: UIMutation<
            SidebarContainerState['annotationSharingInfo']
        > = {}
        const remoteIds = await this.options.contentSharing.getRemoteAnnotationIds(
            { annotationUrls },
        )

        const privacyLevels = await this.options.annotations.findAnnotationPrivacyLevels(
            { annotationUrls },
        )

        for (const localId of annotationUrls) {
            annotationSharingInfo[localId] = {
                $set: {
                    taskState: 'pristine',
                    privacyLevel: privacyLevels[localId],
                    status:
                        remoteIds[localId] ||
                        privacyLevels[localId] ===
                            AnnotationPrivacyLevels.SHARED
                            ? 'shared'
                            : 'not-yet-shared',
                },
            }
        }

        this.emitMutation({ annotationSharingInfo })
    }

    updateAllAnnotationsShareInfo: EventHandler<
        'updateAllAnnotationsShareInfo'
    > = ({ previousState: { annotations, annotationSharingInfo }, event }) => {
        const sharingInfo = {}

        for (const { url } of annotations) {
            const prev = annotationSharingInfo[url]
            if (prev?.privacyLevel === AnnotationPrivacyLevels.PROTECTED) {
                sharingInfo[url] = prev
                continue
            }

            sharingInfo[url] = {
                ...event.info,
                privacyLevel:
                    event.info.privacyLevel ??
                    annotationSharingInfo[url].privacyLevel,
                status: event.info.status ?? annotationSharingInfo[url].status,
            }
        }

        this.emitMutation({ annotationSharingInfo: { $set: sharingInfo } })
    }

    updateAnnotationShareInfo: EventHandler<'updateAnnotationShareInfo'> = ({
        previousState: { annotationSharingInfo },
        event,
    }) => {
        this.emitMutation({
            annotationSharingInfo: {
                $merge: {
                    [event.annotationUrl]: {
                        ...annotationSharingInfo[event.annotationUrl],
                        ...event.info,
                    },
                },
            },
        })
    }

    private async setLastSharedAnnotationTimestamp() {
        const lastShared = await getLastSharedAnnotationTimestamp()

        if (lastShared == null) {
            this.options.showAnnotationShareModal?.()
        }

        await setLastSharedAnnotationTimestamp()
    }
}
