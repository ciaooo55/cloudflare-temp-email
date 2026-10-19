import { Context } from 'hono'

import i18n from '../i18n/index.ts'
import { deleteSetting, getJsonSetting, saveSetting } from '../utils.ts'
import { getAddressCreationSettings, getAddressCreationSubdomainMatchStatus } from '../common.ts'
import { CONSTANTS } from '../constants.ts'
import {
    getSendMailLimitConfig,
    getSendMailLimitConfigToSave,
    validateSendMailLimitConfig
} from '../mails_api/send_mail_limit_utils.ts'
import { EmailRuleSettings } from '../models/index.ts'

const normalizeAddressCreationSettingsUpdate = (
    value: unknown
): {
    shouldUpdate: boolean,
    shouldClear: boolean,
    nextEnableSubdomainMatch?: boolean,
} | null => {
    if (typeof value === 'undefined') {
        return { shouldUpdate: false, shouldClear: false };
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const nextEnableSubdomainMatch = (value as Record<string, unknown>).enableSubdomainMatch;
    if (typeof nextEnableSubdomainMatch === 'undefined') {
        return { shouldUpdate: false, shouldClear: false };
    }
    // null 代表"清空后台覆盖，恢复为未设置并回退到 env"，这是给前端三态显式使用的正式路径。
    if (nextEnableSubdomainMatch === null) {
        return { shouldUpdate: true, shouldClear: true };
    }
    if (typeof nextEnableSubdomainMatch !== 'boolean') {
        return null;
    }
    return {
        shouldUpdate: true,
        shouldClear: false,
        nextEnableSubdomainMatch,
    };
};

const get = async (c: Context<HonoCustomType>) => {
    try {
        const [
            blockList,
            sendBlockList,
            verifiedAddressList,
            fromBlockList,
            emailRuleSettings,
            noLimitSendAddressList,
            addressCreationSettings,
            sendMailLimitConfig,
        ] = await Promise.all([
            getJsonSetting(c, CONSTANTS.ADDRESS_BLOCK_LIST_KEY),
            getJsonSetting(c, CONSTANTS.SEND_BLOCK_LIST_KEY),
            getJsonSetting(c, CONSTANTS.VERIFIED_ADDRESS_LIST_KEY),
            c.env.KV ? c.env.KV.get<string[]>(CONSTANTS.EMAIL_KV_BLACK_LIST, 'json') : Promise.resolve([]),
            getJsonSetting<EmailRuleSettings>(c, CONSTANTS.EMAIL_RULE_SETTINGS_KEY),
            getJsonSetting(c, CONSTANTS.NO_LIMIT_SEND_ADDRESS_LIST_KEY),
            getAddressCreationSettings(c),
            getSendMailLimitConfig(c),
        ]);
        const addressCreationSubdomainMatchStatus = await getAddressCreationSubdomainMatchStatus(c, addressCreationSettings);
        return c.json({
            blockList: blockList || [],
            sendBlockList: sendBlockList || [],
            verifiedAddressList: verifiedAddressList || [],
            fromBlockList: fromBlockList || [],
            noLimitSendAddressList: noLimitSendAddressList || [],
            emailRuleSettings: emailRuleSettings || {},
            addressCreationSettings: typeof addressCreationSettings.enableSubdomainMatch === 'boolean'
                ? { enableSubdomainMatch: addressCreationSettings.enableSubdomainMatch }
                : {},
            addressCreationSubdomainMatchStatus,
            sendMailLimitConfig,
        })
    } catch (error) {
        console.error(error);
        return c.json({})
    }
};

const save = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesByContext(c);
    const {
        blockList, sendBlockList, noLimitSendAddressList,
        verifiedAddressList, fromBlockList, emailRuleSettings, addressCreationSettings,
        sendMailLimitConfig
    } = await c.req.json();
    if (!blockList || !sendBlockList || !verifiedAddressList) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const addressCreationSettingsUpdate = normalizeAddressCreationSettingsUpdate(addressCreationSettings);
    if (!addressCreationSettingsUpdate) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    if (!c.env.SEND_MAIL && verifiedAddressList.length > 0) {
        return c.text(msgs.EnableSendMailMsg, 400)
    }
    // 所有输入依赖都先校验，再执行任意写入，避免接口返回 400 时出现部分设置已落库的半成功状态。
    if (fromBlockList?.length > 0 && !c.env.KV) {
        return c.text(msgs.EnableKVMsg, 400)
    }
    if (sendMailLimitConfig && !validateSendMailLimitConfig(sendMailLimitConfig)) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const sendMailLimitConfigToSave = sendMailLimitConfig
        ? getSendMailLimitConfigToSave(sendMailLimitConfig)
        : null;
    await saveSetting(c, CONSTANTS.ADDRESS_BLOCK_LIST_KEY, JSON.stringify(blockList));
    await saveSetting(c, CONSTANTS.SEND_BLOCK_LIST_KEY, JSON.stringify(sendBlockList));
    await saveSetting(c, CONSTANTS.VERIFIED_ADDRESS_LIST_KEY, JSON.stringify(verifiedAddressList));
    if (fromBlockList?.length > 0 && c.env.KV) {
        await c.env.KV.put(CONSTANTS.EMAIL_KV_BLACK_LIST, JSON.stringify(fromBlockList))
    }
    await saveSetting(c, CONSTANTS.NO_LIMIT_SEND_ADDRESS_LIST_KEY, JSON.stringify(noLimitSendAddressList || []));
    await saveSetting(c, CONSTANTS.EMAIL_RULE_SETTINGS_KEY, JSON.stringify(emailRuleSettings || {}));
    if (addressCreationSettingsUpdate.shouldUpdate) {
        if (addressCreationSettingsUpdate.shouldClear) {
            await deleteSetting(c, CONSTANTS.ADDRESS_CREATION_SETTINGS_KEY);
        } else {
            await saveSetting(
                c, CONSTANTS.ADDRESS_CREATION_SETTINGS_KEY,
                JSON.stringify({
                    enableSubdomainMatch: addressCreationSettingsUpdate.nextEnableSubdomainMatch
                })
            )
        }
    }
    if (sendMailLimitConfigToSave) {
        await saveSetting(
            c, CONSTANTS.SEND_MAIL_LIMIT_CONFIG_KEY,
            JSON.stringify(sendMailLimitConfigToSave)
        )
    }
    return c.json({ success: true });
};

export default { get, save };
