import { AnalyticsEvents, AnalyticsEventInfo } from './types'

// Local storage keys used for analytics-related logic
export const STORAGE_KEYS = {
    // Used for timestamp of last install ping (tracks rough # of installs in period)
    MONTHLY_INSTALL: 'last-monthly-install-ping-timestamp',
    WEEKLY_INSTALL: 'last-weekly-install-ping-timestamp',
    DAILY_INSTALL: 'last-daily-install-ping-timestamp',

    // Used for timestamps of periodic activity pings (tracks # of in/active users for periods of time)
    MONTHLY_ACTIVITY: 'last-monthly-activity-ping-timestamp',
    WEEKLY_ACTIVITY: 'last-weekly-activity-ping-timestamp',
    DAILY_ACTIVITY: 'last-daily-activity-ping-timestamp',

    // Used for timestamp of last "activity-indicating" action (user needs 1 in last week to be active)
    LAST_ACTIVE: 'last-search-timestamp',
}

// Timezone to base milestones on
export const TIMEZONE = 'Europe/Berlin'

export const ANALYTICS_EVENTS: {
    [Category in keyof AnalyticsEvents]: {
        [Action in AnalyticsEvents[Category]]: AnalyticsEventInfo
    }
} = {
    'Activity Pings': {
        daily: {
            description: '',
        },
        weekly: {
            description: '',
        },
        monthly: {
            description: '',
        },
    },
    Annotations: {
        createWithTags: {
            description: '',
        },
        createWithoutTags: {
            description: '',
        },
    },
    Privacy: {
        'Change tracking pref': {
            description: '',
        },
    },
}
