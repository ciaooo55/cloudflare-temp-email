export const adminGroups = [
    { key: 'mail', label: 'mails', items: [
        ['mails', 'mails'], ['sendBox', 'sendBox'], ['sendMail', 'sendMail'],
        ['unknow', 'unknow'], ['mailWebhook', 'mailWebhook'],
    ] },
    { key: 'mailboxes', label: 'mailbox_management', items: [
        ['account', 'mailbox_list'], ['account_create', 'mailbox_create'],
        ['account_settings', 'mailbox_settings'], ['senderAccess', 'senderAccess'],
        ['ipBlacklistSettings', 'ipBlacklistSettings'], ['aiExtractSettings', 'aiExtractSettings'],
        ['webhook', 'webhookSettings'],
    ] },
    { key: 'notifications', label: 'notifications', items: [
        ['telegram', 'telegram'], ['bark', 'bark'], ['snapshot', 'snapshot'],
    ] },
    { key: 'system', label: 'maintenance', items: [
        ['statistics', 'statistics'], ['database', 'database'], ['workerconfig', 'workerconfig'],
        ['maintenance_tasks', 'maintenanceTasks'], ['appearance', 'appearance'],
        ['adminAccount', 'adminAccount'], ['about', 'about'],
    ] },
]

export function normalizeAdminSection(section) {
    if (['qucickSetup', 'quickSetup', 'maintenance'].includes(section)) return 'database'
    return adminGroups.some(group => group.items.some(([key]) => key === section)) ? section : 'mails'
}
