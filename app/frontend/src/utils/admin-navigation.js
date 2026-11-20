export const adminGroups = [
    { key: 'mail', label: 'dailyMail', description: 'dailyMailHint', items: [
        ['mails', 'mails'], ['sendMail', 'sendMail'], ['sendBox', 'sendBox'],
    ] },
    { key: 'mailboxes', label: 'mailbox_management', description: 'mailboxesHint', items: [
        ['account', 'mailbox_list'], ['account_create', 'mailbox_create'],
        ['unknow', 'unknow'],
    ] },
    { key: 'rules', label: 'mailRules', description: 'mailRulesHint', items: [
        ['account_settings', 'mailbox_settings'], ['senderAccess', 'senderAccess'],
        ['aiExtractSettings', 'aiExtractSettings'], ['ipBlacklistSettings', 'ipBlacklistSettings'],
    ] },
    { key: 'notifications', label: 'notifications', description: 'notificationsHint', items: [
        ['telegram', 'telegram'], ['bark', 'bark'], ['mailWebhook', 'mailWebhook'],
        ['webhook', 'webhookSettings'], ['snapshot', 'snapshot'],
    ] },
    { key: 'system', label: 'maintenance', description: 'systemHint', items: [
        ['statistics', 'statistics'], ['database', 'database'], ['workerconfig', 'workerconfig'],
        ['maintenance_tasks', 'maintenanceTasks'], ['appearance', 'appearance'],
        ['adminAccount', 'adminAccount'], ['about', 'about'],
    ] },
]

export function normalizeAdminSection(section) {
    if (['qucickSetup', 'quickSetup', 'maintenance'].includes(section)) return 'database'
    return adminGroups.some(group => group.items.some(([key]) => key === section)) ? section : 'mails'
}

export function createAdminSelectOptions(translate) {
    return adminGroups.map(group => ({
        type: 'group', key: group.key, label: translate(group.label),
        children: group.items.map(([value, label]) => ({ value, label: translate(label) })),
    }))
}
