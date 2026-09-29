import { Hono } from 'hono'

import address_api from './address_api'
import address_sender_api from './address_sender_api'
import sendbox_api from './sendbox_api'
import statistics_api from './statistics_api'
import account_settings_api from './account_settings_api'
import cleanup_api from './cleanup_api'
import webhook_settings from './webhook_settings'
import mail_webhook_settings from './mail_webhook_settings'
import worker_config from './worker_config'
import admin_mail_api from './admin_mail_api'
import { sendMailbyAdmin, sendMailByBindingAdmin } from './send_mail'
import db_api from './db_api'
import ip_blacklist_settings from './ip_blacklist_settings'
import ai_extract_settings from './ai_extract_settings'
import notify_settings from './notify_settings'
import config_api from './config_api'
// TEMPORARY: email simulation endpoint, DELETE AFTER TESTING
import simulate_email from './simulate_email'

export const api = new Hono<HonoCustomType>()

// address
api.get('/admin/address', address_api.listAddresses)
api.post('/admin/new_address', address_api.createNewAddress)
api.delete('/admin/delete_address/:id', address_api.deleteAddress)
api.delete('/admin/clear_inbox/:id', address_api.clearInbox)
api.delete('/admin/clear_sent_items/:id', address_api.clearSentItems)
api.get('/admin/show_password/:id', address_api.showPassword)
api.post('/admin/address/:id/reset_password', address_api.resetPassword)

// mail api
api.get('/admin/mails', admin_mail_api.getMails)
api.get('/admin/mails_unknow', admin_mail_api.getUnknowMails)
api.get('/admin/mails/:id', admin_mail_api.getMail)
api.delete('/admin/mails/:id', admin_mail_api.deleteMail)

// address sender
api.get('/admin/address_sender', address_sender_api.list)
api.post('/admin/address_sender', address_sender_api.update)
api.delete('/admin/address_sender/:id', address_sender_api.remove)

// sendbox
api.get('/admin/sendbox', sendbox_api.list)
api.delete('/admin/sendbox/:id', sendbox_api.remove)

// statistics
api.get('/admin/statistics', statistics_api.get)

// account settings
api.get('/admin/account_settings', account_settings_api.get)
api.post('/admin/account_settings', account_settings_api.save)

// cleanup
api.post('/admin/cleanup', cleanup_api.cleanup)
api.get('/admin/auto_cleanup', cleanup_api.getCleanup)
api.post('/admin/auto_cleanup', cleanup_api.saveCleanup)
api.get('/admin/scheduled_status', cleanup_api.getScheduledStatus)
api.post('/admin/cleanup_raw_mails', cleanup_api.cleanupRawMailsNow)

// webhook settings
api.get('/admin/webhook/settings', webhook_settings.getWebhookSettings)
api.post('/admin/webhook/settings', webhook_settings.saveWebhookSettings)

// mail webhook settings
api.get('/admin/mail_webhook/settings', mail_webhook_settings.getWebhookSettings)
api.post('/admin/mail_webhook/settings', mail_webhook_settings.saveWebhookSettings)
api.post('/admin/mail_webhook/test', mail_webhook_settings.testWebhookSettings)

// worker config
api.get('/admin/worker/configs', worker_config.getConfig)

// send mail by admin
api.post('/admin/send_mail', sendMailbyAdmin)
api.post('/admin/send_mail_by_binding', sendMailByBindingAdmin)

// TEMPORARY: simulate receiving an email, DELETE AFTER TESTING
api.post('/admin/simulate_email', simulate_email.simulateEmail)

// db api
api.get('admin/db_version', db_api.getVersion)
api.post('admin/db_initialize', db_api.initialize)
api.post('admin/db_migration', db_api.migrate)

// generic admin config
api.get('/admin/config/:key', config_api.get)
api.post('/admin/config', config_api.save)

// IP blacklist settings
api.get('/admin/ip_blacklist/settings', ip_blacklist_settings.getIpBlacklistSettings)
api.post('/admin/ip_blacklist/settings', ip_blacklist_settings.saveIpBlacklistSettings)

// AI extract settings
api.get('/admin/ai_extract/settings', ai_extract_settings.getAiExtractSettings)
api.post('/admin/ai_extract/settings', ai_extract_settings.saveAiExtractSettings)

// AI extract custom endpoint test
api.post('/admin/ai_extract/test', ai_extract_settings.testCustomAiEndpoint)

// notify settings: telegram bots
api.get('/admin/notify/telegram_bots', notify_settings.listTelegramBots)
api.post('/admin/notify/telegram_bots', notify_settings.createTelegramBot)
api.put('/admin/notify/telegram_bots/:id', notify_settings.updateTelegramBot)
api.delete('/admin/notify/telegram_bots/:id', notify_settings.deleteTelegramBot)
api.post('/admin/notify/telegram_bots/:id/test', notify_settings.testTelegramBot)
api.post('/admin/notify/telegram_bots/:id/webhook', notify_settings.setTelegramBotWebhook)

// notify settings: bark
api.get('/admin/notify/bark', notify_settings.getBark)
api.post('/admin/notify/bark', notify_settings.saveBark)
api.post('/admin/notify/bark/test', notify_settings.testBark)

// notify settings: snapshot ttl + address bindings
api.get('/admin/notify/snapshot', notify_settings.getSnapshot)
api.post('/admin/notify/snapshot', notify_settings.saveSnapshot)
api.get('/admin/notify/snapshot_bindings', notify_settings.listSnapshotBindings)
api.post('/admin/notify/snapshot_bindings', notify_settings.createSnapshotBinding)
api.delete('/admin/notify/snapshot_bindings/:address', notify_settings.invalidateSnapshotBinding)
