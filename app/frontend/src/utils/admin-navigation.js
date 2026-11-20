export const adminGroups = [
    { key: 'mail', label: 'dailyMail', items: [
        ['mails', 'mails'], ['sendMail', 'sendMail'], ['sendBox', 'sendBox'],
    ] },
    { key: 'mailboxes', label: 'mailbox_management', items: [
        ['account', 'mailbox_list'], ['snapshot', 'snapshot'],
    ] },
    { key: 'rules', label: 'mailRules', items: [
        ['account_settings', 'mailbox_settings'], ['senderAccess', 'senderAccess'],
        ['ipBlacklistSettings', 'ipBlacklistSettings'],
    ] },
    { key: 'notifications', label: 'notifications', items: [
        ['telegram', 'telegram'], ['bark', 'bark'],
    ] },
    { key: 'system', label: 'maintenance', items: [
        ['statistics', 'statistics'], ['maintenance_tasks', 'maintenanceTasks'],
    ] },
]

export function normalizeAdminSection(section) {
    return adminGroups.some(group => group.items.some(([key]) => key === section)) ? section : 'mails'
}

export function createAdminSelectOptions(translate) {
    return adminGroups.map(group => ({
        type: 'group', key: group.key, label: translate(group.label),
        children: group.items.map(([value, label]) => ({ value, label: translate(label) })),
    }))
}
