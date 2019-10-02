import expect from 'expect'
import {
    backgroundIntegrationTestSuite,
    backgroundIntegrationTest,
    BackgroundIntegrationTestSetup,
} from 'src/tests/integration-tests'
import {
    StorageDiff,
    StorageCollectionDiff,
} from 'src/tests/storage-change-detector'

export const INTEGRATION_TESTS = backgroundIntegrationTestSuite(
    'Custom lists',
    [
        backgroundIntegrationTest(
            'should create a list, edit its title, add an entry to it and retrieve the list and its pages',
            () => {
                const customLists = (setup: BackgroundIntegrationTestSetup) =>
                    setup.backgroundModules.customLists.remoteFunctions
                const searchModule = (setup: BackgroundIntegrationTestSetup) =>
                    setup.backgroundModules.search
                let listId!: any
                let listEntry!: any
                return {
                    steps: [
                        {
                            execute: async ({ setup }) => {
                                listId = await customLists(
                                    setup,
                                ).createCustomList({
                                    name: 'My Custom List',
                                })
                            },
                            expectedStorageChanges: {
                                customLists: (): StorageCollectionDiff => ({
                                    [listId]: {
                                        type: 'create',
                                        object: {
                                            id: listId,
                                            createdAt: expect.any(Date),
                                            name: 'My Custom List',
                                            isDeletable: true,
                                            isNestable: true,
                                        },
                                    },
                                }),
                            },
                        },
                        {
                            execute: async ({ setup }) => {
                                listEntry = (await customLists(
                                    setup,
                                ).insertPageToList({
                                    id: listId,
                                    url: 'http://www.bla.com/',
                                })).object
                            },
                            expectedStorageChanges: {
                                pageListEntries: (): StorageCollectionDiff => ({
                                    [listEntry &&
                                    `[${listId},"${listEntry.pageUrl}"]`]: {
                                        type: 'create',
                                        object: {
                                            listId,
                                            createdAt: expect.any(Date),
                                            fullUrl: 'http://www.bla.com/',
                                            pageUrl: 'bla.com',
                                        },
                                    },
                                }),
                                pages: (): StorageCollectionDiff => ({
                                    'bla.com': {
                                        type: 'create',
                                        object: {
                                            canonicalUrl: undefined,
                                            domain: 'bla.com',
                                            fullTitle: undefined,
                                            fullUrl: 'http://www.bla.com/',
                                            hostname: 'bla.com',
                                            screenshot: undefined,
                                            terms: [],
                                            text: undefined,
                                            titleTerms: [],
                                            url: 'bla.com',
                                            urlTerms: [],
                                        },
                                    },
                                }),
                                visits: (): StorageCollectionDiff =>
                                    expect.any(Object),
                            },
                        },
                        {
                            execute: async ({ setup }) =>
                                customLists(setup).updateListName({
                                    id: listId,
                                    name: 'Updated List Title',
                                }),
                            expectedStorageChanges: {
                                customLists: (): StorageCollectionDiff => ({
                                    [listId]: {
                                        type: 'modify',
                                        updates: {
                                            name: 'Updated List Title',
                                        },
                                    },
                                }),
                            },
                            postCheck: async ({ setup }) => {
                                expect(
                                    await customLists(setup).fetchListById({
                                        id: listId,
                                    }),
                                ).toEqual({
                                    id: expect.any(Number),
                                    name: 'Updated List Title',
                                    isDeletable: true,
                                    isNestable: true,
                                    createdAt: expect.any(Date),
                                    pages: ['http://www.bla.com/'],
                                    active: true,
                                })

                                expect(
                                    await customLists(setup).fetchListPagesById(
                                        {
                                            id: listId,
                                        },
                                    ),
                                ).toEqual([
                                    {
                                        listId,
                                        pageUrl: 'bla.com',
                                        fullUrl: 'http://www.bla.com/',
                                        createdAt: expect.any(Date),
                                    },
                                ])

                                // expect(await setup.backgroundModules.search.remoteFunctions.search.searchPages({
                                //     contentTypes: { pages: true, notes: false, highlights: false },
                                //     collections: [listId]
                                // })).toEqual([])
                            },
                        },
                    ],
                }
            },
        ),
        backgroundIntegrationTest(
            'should create a list, add an entry of an existing page to it and retrieve the list and its pages',
            () => {
                const customLists = (setup: BackgroundIntegrationTestSetup) =>
                    setup.backgroundModules.customLists.remoteFunctions
                const searchModule = (setup: BackgroundIntegrationTestSetup) =>
                    setup.backgroundModules.search
                let listId!: any
                let listEntry!: any
                return {
                    steps: [
                        {
                            execute: async ({ setup }) => {
                                listId = await customLists(
                                    setup,
                                ).createCustomList({
                                    name: 'My Custom List',
                                })
                            },
                        },
                        {
                            execute: async ({ setup }) => {
                                listEntry = (await customLists(
                                    setup,
                                ).insertPageToList({
                                    id: listId,
                                    url: 'http://www.bla.com/',
                                })).object
                            },
                        },
                        {
                            execute: async ({ setup }) => {
                                await searchModule(setup).searchIndex.addPage({
                                    pageDoc: {
                                        url: 'http://www.bla.com/',
                                        content: {
                                            fullText: 'home page content',
                                            title: 'bla.com title',
                                        },
                                    },
                                    visits: [],
                                })
                            },
                            postCheck: async ({ setup }) => {
                                expect(
                                    await customLists(setup).fetchListById({
                                        id: listId,
                                    }),
                                ).toEqual({
                                    id: expect.any(Number),
                                    name: 'My Custom List',
                                    isDeletable: true,
                                    isNestable: true,
                                    createdAt: expect.any(Date),
                                    pages: ['http://www.bla.com/'],
                                    active: true,
                                })

                                expect(
                                    await customLists(setup).fetchListPagesById(
                                        {
                                            id: listId,
                                        },
                                    ),
                                ).toEqual([
                                    {
                                        listId,
                                        pageUrl: 'bla.com',
                                        fullUrl: 'http://www.bla.com/',
                                        createdAt: expect.any(Date),
                                    },
                                ])

                                // expect(await setup.backgroundModules.search.remoteFunctions.search.searchPages({
                                //     contentTypes: { pages: true, notes: false, highlights: false },
                                //     collections: [listId]
                                // })).toEqual([])
                            },
                        },
                    ],
                }
            },
        ),
    ],
)