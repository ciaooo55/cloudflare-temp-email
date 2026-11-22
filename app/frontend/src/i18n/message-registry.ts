export const MESSAGE_REGISTRY = {
  "components.AbuseProtection": {
    "title": { "en": "Mail and snapshot protection", "zh": "收信与快照防刷" },
    "scope": { "en": "Changes apply within 30 seconds. Independent from the IP blacklist below.", "zh": "保存后最多 30 秒生效。这组规则独立于下方 IP 黑名单，可分别开关。" },
    "inboundEnabled": { "en": "Limit incoming mail", "zh": "开启收信限流" },
    "inboundEnabledHelp": { "en": "Exceeding either limit rejects the message and bans its envelope sender across all site mailboxes. Empty-sender delivery reports are exempt.", "zh": "按信封发件地址计数；超过任一限制的这一封开始拒收，并暂时封禁该发件人向本站所有邮箱投递。空发件地址的退信不计数。" },
    "inboundWindowMinutes": { "en": "Mail window (minutes)", "zh": "收信统计窗口（分钟）" },
    "inboundWindowMinutesHelp": { "en": "Starts with the first message and resets when the window ends. Default: 10 minutes. Changing this resets counters.", "zh": "从第一封开始计时，到期重新计数。默认 10 分钟；修改窗口会重新计数。" },
    "inboundPairLimit": { "en": "Messages per sender and mailbox", "zh": "同一发件人 → 同一邮箱最多封数" },
    "inboundPairLimitHelp": { "en": "Default: 10 messages. Message 11 triggers the ban.", "zh": "默认 10 封，第 11 封开始拒收；不同收件邮箱分别计数。" },
    "inboundSenderLimit": { "en": "Messages per sender across all mailboxes", "zh": "同一发件人 → 所有邮箱合计最多封数" },
    "inboundSenderLimitHelp": { "en": "Uses the same window to prevent mailbox rotation. Default: 100 messages.", "zh": "使用相同时间窗口，防止对方换着你的收件邮箱轰炸。默认 100 封。" },
    "inboundBanMinutes": { "en": "Sender ban (minutes)", "zh": "发件人自动封禁时长（分钟）" },
    "inboundBanMinutesHelp": { "en": "Default: 10 minutes. Blocked attempts do not extend bans. Disabling this protection bypasses automatic bans, not manual blocks.", "zh": "默认 10 分钟，到期自动解封，重复被拦不会延长。封禁时不存信、不推送。关闭收信限流可暂停自动封禁，手动黑名单仍生效。" },
    "snapshotEnabled": { "en": "Limit snapshot visits", "zh": "开启快照链接防刷" },
    "snapshotEnabledHelp": { "en": "Counts all snapshot visits per IP. Switching links does not reset it. Visitors sharing a public IP share this limit.", "zh": "按 IP 统计所有快照链接的合计访问数，更换链接不能绕过；同一网络出口的访客共用次数。" },
    "snapshotWindowSeconds": { "en": "Snapshot window (seconds)", "zh": "快照统计窗口（秒）" },
    "snapshotWindowSecondsHelp": { "en": "Starts with the first visit. Default: 60 seconds, then resets.", "zh": "从首次访问开始计时。默认 60 秒，到期重新计数。" },
    "snapshotLimit": { "en": "Snapshot requests per IP per window", "zh": "每个 IP 在窗口内最多访问次数" },
    "snapshotLimitHelp": { "en": "Default: 60; request 61 returns HTTP 429. Refreshes, invalid links, cache hits and HEAD requests count too.", "zh": "默认 60 次，第 61 次提示访问过于频繁。刷新、无效链接、缓存命中和 HEAD 请求也计数。" },
    "snapshotBanMinutes": { "en": "Snapshot IP ban (minutes)", "zh": "快照访问封禁时长（分钟）" },
    "snapshotBanMinutesHelp": { "en": "Default: 10 minutes. Affects this IP's snapshot access only, without extending existing bans or blocking incoming mail.", "zh": "默认 10 分钟，只限制该 IP 的快照访问，不封邮箱、不影响其他 IP，重复被拦不会延长。" },
    "costHelp": { "en": "Reuses database counters; no KV writes. Blocked repeats do not write counters or reserve mail budget, but still invoke a Worker. Rotating senders or IPs can still consume site quotas.", "zh": "复用现有数据库计数表，不增加 KV 写入。封禁后的重复请求不写计数和收信预算，但仍消耗 Worker 调用；更换发件地址或 IP 仍可能消耗全站额度。" },
    "save": { "en": "Save protection rules", "zh": "保存防刷规则" },
    "saved": { "en": "Saved; applies within 30 seconds", "zh": "已保存，最多 30 秒生效" },
    "unavailable": { "en": "Loading. If this fails, check that the backend is updated and reload.", "zh": "正在加载；若加载失败，请检查后端是否已更新并刷新本页。" }
  },
  "components.MailBox": {
    "messageCount": { "en": "Messages {total}", "zh": "邮件 {total}" },
    "filteredCount": { "en": "Page matches {matched} · Total {total}", "zh": "本页匹配 {matched} · 共 {total} 封" },
    "noFilterMatches": { "en": "No matches on this page. Try another filter.", "zh": "本页没有匹配邮件，请修改筛选词。" },
    "originalSender": { "en": "Original From", "zh": "原始发件" },
    "copyOriginalRecipient": { "en": "Copy original recipient address", "zh": "复制原始收件邮箱" },
    "copy": { "en": "Copy", "zh": "复制" },
    "copied": { "en": "Copied", "zh": "已复制" },
    "copyFailed": { "en": "Copy failed", "zh": "复制失败" },
    "autoRefresh": {
      "en": "Auto Refresh",
      "zh": "自动刷新"
    },
    "backToList": {
      "en": "Back to List",
      "zh": "返回列表"
    },
    "cancelMultiAction": {
      "en": "Cancel Multi Action",
      "zh": "取消多选"
    },
    "delete": {
      "en": "Delete",
      "zh": "删除"
    },
    "deleteMailTip": {
      "en": "Are you sure you want to delete mail?",
      "zh": "确定要删除邮件吗?"
    },
    "downloadMail": {
      "en": "Download Mail",
      "zh": "下载邮件"
    },
    "emptyMessages": {
      "en": "No messages",
      "zh": "暂无邮件"
    },
    "forwardMail": {
      "en": "Forward",
      "zh": "转发"
    },
    "keywordQueryTip": {
      "en": "Filter current page",
      "zh": "过滤当前页"
    },
    "multiAction": {
      "en": "Multi Action",
      "zh": "多选"
    },
    "nextMail": {
      "en": "Next",
      "zh": "下一封"
    },
    "originalRecipient": {
      "en": "Original To",
      "zh": "原始收件"
    },
    "pleaseSelectMail": {
      "en": "Please select mail",
      "zh": "请选择邮件"
    },
    "prevMail": {
      "en": "Previous",
      "zh": "上一封"
    },
    "refresh": {
      "en": "Refresh",
      "zh": "刷新"
    },
    "refreshAfter": {
      "en": "Refresh After {msg} Seconds",
      "zh": "{msg}秒后刷新"
    },
    "reply": {
      "en": "Reply",
      "zh": "回复"
    },
    "selectAll": {
      "en": "Select All of This Page",
      "zh": "全选本页"
    },
    "success": {
      "en": "Success",
      "zh": "成功"
    },
    "unselectAll": {
      "en": "Unselect All",
      "zh": "取消全选"
    }
  },
  "components.AiExtractInfo": {
    "authCode": {
      "en": "Verification Code",
      "zh": "验证码"
    },
    "authLink": {
      "en": "Authentication Link",
      "zh": "认证链接"
    },
    "copyFailed": {
      "en": "Copy failed",
      "zh": "复制失败"
    },
    "copySuccess": {
      "en": "Copied successfully",
      "zh": "复制成功"
    },
    "open": {
      "en": "Open",
      "zh": "打开"
    },
    "otherLink": {
      "en": "Other Link",
      "zh": "其他链接"
    },
    "serviceLink": {
      "en": "Service Link",
      "zh": "服务链接"
    },
    "subscriptionLink": {
      "en": "Subscription Link",
      "zh": "订阅链接"
    }
  },
  "components.MailContentRenderer": {
    "originalSender": { "en": "Original From", "zh": "原始发件" },
    "attachments": {
      "en": "View Attachments",
      "zh": "查看附件"
    },
    "copied": {
      "en": "Copied",
      "zh": "已复制"
    },
    "copy": {
      "en": "Copy",
      "zh": "复制"
    },
    "originalRecipient": {
      "en": "Original To",
      "zh": "原始收件"
    },
    "delete": {
      "en": "Delete",
      "zh": "删除"
    },
    "deleteMailTip": {
      "en": "Are you sure you want to delete mail?",
      "zh": "确定要删除邮件吗?"
    },
    "downloadMail": {
      "en": "Download Mail",
      "zh": "下载邮件"
    },
    "forward": {
      "en": "Forward",
      "zh": "转发"
    },
    "fullscreen": {
      "en": "Fullscreen",
      "zh": "全屏"
    },
    "markAsRead": {
      "en": "Mark as Read",
      "zh": "标为已读"
    },
    "markAsUnread": {
      "en": "Mark as Unread",
      "zh": "标为未读"
    },
    "loadRemoteImages": {
      "en": "Show Images",
      "zh": "显示图片"
    },
    "remoteImagesBlocked": {
      "en": "{count} remote resources blocked to protect your privacy",
      "zh": "已阻止 {count} 项外部资源以保护隐私"
    },
    "reply": {
      "en": "Reply",
      "zh": "回复"
    },
    "saveToS3": {
      "en": "Save to S3",
      "zh": "保存到S3"
    },
    "showHtmlMail": {
      "en": "Show HTML Mail",
      "zh": "显示HTML邮件"
    },
    "showTextMail": {
      "en": "Show Text Mail",
      "zh": "显示纯文本邮件"
    },
  },
  "components.Turnstile": {
    "refresh": {
      "en": "Refresh",
      "zh": "刷新"
    }
  },
  "components.AddressCredentialModal": {
    "addressCredential": {
      "en": "Address Credential",
      "zh": "地址凭证"
    },
    "addressCredentialLabel": {
      "en": "Mailbox access credential",
      "zh": "邮箱访问凭证"
    },
    "addressPassword": {
      "en": "Mailbox Password",
      "zh": "邮箱密码"
    },
    "agentAccess": {
      "en": "AI Agent",
      "zh": "AI Agent"
    },
    "agentAccessTip": {
      "en": "Use this mailbox from an AI agent with the Address JWT and parsed-mail APIs.",
      "zh": "AI Agent 可使用 Address JWT 和 parsed-mail API 读取这个邮箱。"
    },
    "agentConfig": {
      "en": "Agent config",
      "zh": "Agent 配置"
    },
    "agentSkill": {
      "en": "Agent skill",
      "zh": "Agent skill"
    },
    "apiBase": {
      "en": "API Base",
      "zh": "API 地址"
    },
    "autoLoginLink": {
      "en": "Auto-login link",
      "zh": "自动登录链接"
    },
    "copyFailed": {
      "en": "Copy failed",
      "zh": "复制失败"
    },
    "copySection": {
      "en": "Copy",
      "zh": "复制"
    },
    "copySuccess": {
      "en": "Copied",
      "zh": "已复制"
    },
    "currentAddress": {
      "en": "Email address",
      "zh": "邮箱地址"
    },
    "docs": {
      "en": "Docs",
      "zh": "文档"
    },
    "imapHost": {
      "en": "IMAP host",
      "zh": "IMAP 主机"
    },
    "imapPort": {
      "en": "IMAP port",
      "zh": "IMAP 端口"
    },
    "password": {
      "en": "Password",
      "zh": "密码"
    },
    "plainOrProxyTls": {
      "en": "Plain or proxy TLS",
      "zh": "明文或代理层 TLS"
    },
    "security": {
      "en": "Security",
      "zh": "安全"
    },
    "smtpHost": {
      "en": "SMTP host",
      "zh": "SMTP 主机"
    },
    "smtpImapAccess": {
      "en": "SMTP / IMAP",
      "zh": "SMTP / IMAP"
    },
    "smtpImapTip": {
      "en": "Use these values in mail clients after the administrator configures the SMTP/IMAP proxy. The password can be the Address JWT shown here, or the mailbox password when you have it.",
      "zh": "管理员配置 SMTP/IMAP 代理后，可在邮件客户端中使用这些信息。密码可使用这里展示的 Address JWT，也可使用你持有的邮箱密码。"
    },
    "smtpPort": {
      "en": "SMTP port",
      "zh": "SMTP 端口"
    },
    "starttls": {
      "en": "STARTTLS",
      "zh": "STARTTLS"
    },
    "tip": {
      "en": "Use these credentials only with clients and agents you trust.",
      "zh": "请只在可信的客户端和 Agent 中使用这些凭证。"
    },
    "title": {
      "en": "Address Credentials & Connection Methods",
      "zh": "地址凭证与连接方式"
    },
    "username": {
      "en": "Username",
      "zh": "用户名"
    }
  },
  "views.Footer": {
    "copyright": {
      "en": "Copyright",
      "zh": "版权所有"
    }
  },
  "views.Header": {
    "admin": {
      "en": "Admin Console",
      "zh": "管理后台"
    },
    "accessHeader": {
      "en": "Access Password",
      "zh": "访问密码"
    },
    "accessTip": {
      "en": "Please enter the correct access password",
      "zh": "请输入站点访问密码"
    },
    "dark": {
      "en": "Dark",
      "zh": "深色"
    },
    "light": {
      "en": "Light",
      "zh": "浅色"
    },
    "menu": {
      "en": "Menu",
      "zh": "菜单"
    },
    "ok": {
      "en": "OK",
      "zh": "确定"
    },
    "status": {
      "en": "Status",
      "zh": "状态"
    },
    "title": {
      "en": "Cloudflare Temp Email",
      "zh": "Cloudflare 临时邮件"
    },
  },
  "views.Admin": {
    "workspace": { "en": "Mail workspace", "zh": "邮箱工作台" },
    "notifications": { "en": "Notifications & integrations", "zh": "通知与集成" },
    "dailyMail": { "en": "Daily mail", "zh": "日常收发" },
    "dailyMailHint": { "en": "Read codes and original addresses first. Images stay blocked until you choose to show them.", "zh": "先看文字、验证码和原始收发地址；图片仅在点击「显示图片」后加载。" },
    "mailboxesHint": { "en": "Find or create mailboxes, and review mail received for unregistered addresses.", "zh": "查找或创建邮箱，集中查看未注册地址收到的邮件。" },
    "mailRules": { "en": "Mail rules & security", "zh": "收发规则与安全" },
    "mailRulesHint": { "en": "Manage mailbox defaults, sending access, code extraction and API access rules.", "zh": "统一管理邮箱默认规则、发件权限、验证码提取与接口访问限制。" },
    "notificationsHint": { "en": "Configure delivery notifications, webhook integrations and saved mail snapshots.", "zh": "配置收信通知、Webhook 集成与邮件快照，不与日常阅读混在一起。" },
    "systemHint": { "en": "Usage, database and deployment tools. Panels load only when opened.", "zh": "用量、数据库、部署配置与维护工具按需打开，不拖慢日常收发。" },
    "privacyFirst": { "en": "Images load on click", "zh": "图片仅点击后加载" },
    "about": {
      "en": "About",
      "zh": "关于"
    },
    "noAnnouncement": {
      "en": "No announcement yet.",
      "zh": "暂无公告"
    },
    "accessHeader": {
      "en": "Admin Password",
      "zh": "管理员密码"
    },
    "accessTip": {
      "en": "Please enter the admin password",
      "zh": "请输入管理员密码"
    },
    "mailbox_management": {
      "en": "Mailbox Management",
      "zh": "邮箱管理"
    },
    "mailbox_list": {
      "en": "Mailboxes",
      "zh": "邮箱列表"
    },
    "mailbox_create": {
      "en": "Create Email Address",
      "zh": "创建邮箱"
    },
    "mailbox_settings": {
      "en": "Global Mailbox Settings",
      "zh": "全局邮箱设置"
    },
    "adminAccount": {
      "en": "Admin",
      "zh": "管理员"
    },
    "aiExtractSettings": {
      "en": "AI Extract Settings",
      "zh": "AI 提取设置"
    },
    "appearance": {
      "en": "Appearance",
      "zh": "外观"
    },
    "confirm": {
      "en": "Confirm",
      "zh": "确认"
    },
    "database": {
      "en": "Database",
      "zh": "数据库"
    },
    "ipBlacklistSettings": {
      "en": "Abuse protection and access",
      "zh": "防刷与访问控制"
    },
    "loginMethod": {
      "en": "Login Method",
      "zh": "登录方式"
    },
    "adminAccountTip": {
      "en": "This page shows how you logged in to the admin console. To change the admin password, ask your administrator to update it in the service deployment settings in the Cloudflare dashboard and redeploy.",
      "zh": "本页显示你进入管理后台的登录方式。如需修改管理密码，请联系管理员在 Cloudflare 控制台的服务部署设置中修改后重新发布。"
    },
    "loginViaDisabledCheck": {
      "en": "Disabled Password Check",
      "zh": "已禁用密码检查"
    },
    "loginViaPassword": {
      "en": "Admin Password Login",
      "zh": "管理员密码登录"
    },
    "logout": {
      "en": "Logout",
      "zh": "退出登录"
    },
    "logoutConfirmContent": {
      "en": "Are you sure you want to log out of the admin console?",
      "zh": "确定要退出管理后台吗？"
    },
    "logoutConfirmTitle": {
      "en": "Confirm Logout",
      "zh": "确认退出"
    },
    "logoutSuccess": {
      "en": "Logout successful",
      "zh": "退出成功"
    },
    "mailWebhook": {
      "en": "Mail Webhook",
      "zh": "邮件 Webhook"
    },
    "mails": {
      "en": "Emails",
      "zh": "邮件"
    },
    "maintenance": {
      "en": "Maintenance",
      "zh": "维护"
    },
    "maintenanceTasks": {
      "en": "Cleanup & Tasks",
      "zh": "清理维护"
    },
    "ok": {
      "en": "OK",
      "zh": "确定"
    },
    "quickSetup": {
      "en": "Quick Setup",
      "zh": "快速设置"
    },
    "sendBox": {
      "en": "Sent",
      "zh": "发件箱"
    },
    "sendMail": {
      "en": "Send Mail",
      "zh": "发送邮件"
    },
    "senderAccess": {
      "en": "Sender Access Control",
      "zh": "发件权限控制"
    },
    "statistics": {
      "en": "Statistics",
      "zh": "统计"
    },
    "bark": {
      "en": "Bark Push",
      "zh": "Bark 推送"
    },
    "snapshot": {
      "en": "Snapshots",
      "zh": "快照管理"
    },
    "telegram": {
      "en": "Telegram Bot",
      "zh": "电报机器人"
    },
    "unknow": {
      "en": "Mails with unknow receiver",
      "zh": "无收件人邮件"
    },
    "webhookSettings": {
      "en": "Webhook Settings",
      "zh": "Webhook 设置"
    },
    "workerconfig": {
      "en": "Worker Config",
      "zh": "Worker 配置"
    }
  },
  "views.admin.SendBox": {
    "query": {
      "en": "Query",
      "zh": "查询"
    },
    "queryTip": {
      "en": "Please input address to query, leave blank to query all",
      "zh": "请输入地址查询, 留空则查询所有"
    }
  },
  "views.admin.Bark": {
    "pushUrlHelp": { "en": "Full Bark endpoint; normally keep its current value. Device keys come from the Bark app and must stay private. Disabling a device stops its notifications only.", "zh": "Bark 推送服务完整地址，通常保留现值。设备 Key 在手机 Bark 应用里获取，相当于推送密码，不要公开。关闭设备只停通知，不影响收信。" },
    "actions": {
      "en": "Actions",
      "zh": "操作"
    },
    "add": {
      "en": "Add",
      "zh": "添加"
    },
    "confirmDelete": {
      "en": "Delete this device?",
      "zh": "确认删除该设备？"
    },
    "delete": {
      "en": "Delete",
      "zh": "删除"
    },
    "deviceKeys": {
      "en": "Device Keys",
      "zh": "设备 Key"
    },
    "deviceName": {
      "en": "Device Name",
      "zh": "设备名称"
    },
    "enabled": {
      "en": "Enabled",
      "zh": "启用"
    },
    "keysKeepTip": {
      "en": "Leave blank to keep existing keys",
      "zh": "留空则保留原有 Key"
    },
    "keysPlaceholder": {
      "en": "Bark device key, comma separated for multiple",
      "zh": "Bark 设备 Key，多个用英文逗号分隔"
    },
    "namePlaceholder": {
      "en": "Device name, e.g. my iPhone",
      "zh": "设备名称，如 我的 iPhone"
    },
    "noDevices": {
      "en": "No devices yet",
      "zh": "还没有设备"
    },
    "pushUrl": {
      "en": "Bark Push Server URL",
      "zh": "Bark 推送服务端地址"
    },
    "pushUrlTip": {
      "en": "Bark server /push endpoint",
      "zh": "Bark 服务端的 /push 地址"
    },
    "save": {
      "en": "Save",
      "zh": "保存"
    },
    "successTip": {
      "en": "Success",
      "zh": "成功"
    },
    "test": {
      "en": "Test",
      "zh": "测试"
    },
    "testAll": {
      "en": "Test All",
      "zh": "测试全部"
    },
    "testFail": {
      "en": "Test failed: ",
      "zh": "测试失败："
    },
    "testOk": {
      "en": "Test push sent, please check your device",
      "zh": "测试推送已发送，请查看设备"
    },
    "tip": {
      "en": "Devices receive pushes independently; one failing does not affect others.",
      "zh": "各设备独立推送，一台失败不影响其他设备。"
    },
    "title": {
      "en": "Bark Push Settings",
      "zh": "Bark 推送设置"
    }
  ,
    "confirmTitle": {
      "en": "Confirm",
      "zh": "确认操作"
    },
    "positiveText": {
      "en": "Confirm",
      "zh": "确定"
    },
    "negativeText": {
      "en": "Cancel",
      "zh": "取消"
    }
  },
  "views.admin.Snapshot": {
    "overviewHelp": { "en": "Anyone with a snapshot link can read its mail without login. Bound links show the latest mail. Configure visit limits under mail and snapshot protection.", "zh": "快照无需登录，拿到链接的人都能查看邮件；固定绑定链接展示该邮箱最新一封信。访问限制在“防刷与访问控制”页的“收信与快照防刷”中调整。" },
    "actions": {
      "en": "Actions",
      "zh": "操作"
    },
    "address": {
      "en": "Email Address",
      "zh": "邮箱地址"
    },
    "addressPlaceholder": {
      "en": "address{'@'}example.com",
      "zh": "address{'@'}example.com"
    },
    "bind": {
      "en": "Bind",
      "zh": "绑定"
    },
    "boundCache": {
      "en": "Bound snapshot edge cache",
      "zh": "绑定快照边缘缓存"
    },
    "boundCacheTip": {
      "en": "OFF by default = real-time: every open reads the newest content, new mail shows in seconds. ON = cache for the chosen duration (saves quota, resists refresh abuse, but new mail can lag up to the chosen duration).",
      "zh": "默认关闭=实时：每次打开都读取最新内容，新邮件秒级可见。开启后按所选时长缓存（省额度、抗刷，但新邮件最多延迟所选时长）。"
    },
    "seconds": {
      "en": "sec",
      "zh": "秒"
    },
    "minutes": {
      "en": "min",
      "zh": "分钟"
    },
    "bindings": {
      "en": "Address Bindings",
      "zh": "邮箱绑定"
    },
    "bindingsTip": {
      "en": "Bind an address to a fixed snapshot URL. Each new mail overwrites the previous content; the page always shows the latest mail. The URL stops working after expiry.",
      "zh": "将邮箱绑定到固定的快照地址。每封新邮件都会覆盖之前的内容，页面始终显示最新邮件。到期后链接失效。"
    },
    "confirmInvalidate": {
      "en": "Invalidate this binding now? The snapshot URL will stop working.",
      "zh": "立即使该绑定失效？快照链接将无法访问。"
    },
    "copied": {
      "en": "Copied",
      "zh": "已复制"
    },
    "copy": {
      "en": "Copy",
      "zh": "复制"
    },
    "createdAt": {
      "en": "Created",
      "zh": "创建时间"
    },
    "days": {
      "en": "days",
      "zh": "天"
    },
    "durationPlaceholder": {
      "en": "Hours",
      "zh": "小时数"
    },
    "durationTip": {
      "en": "Binding duration in hours. After expiry the old snapshot URL becomes invalid and the address is unbound. You can also invalidate it manually in advance. Choose Permanent for a binding that never expires.",
      "zh": "绑定时长（小时）。到期后旧快照链接失效、邮箱自动解绑，也可以提前手动失效。选“永久有效”则永不过期。"
    },
    "expired": {
      "en": "expired",
      "zh": "已过期"
    },
    "expiresAt": {
      "en": "Expires At",
      "zh": "到期时间"
    },
    "hours": {
      "en": "hours",
      "zh": "小时"
    },
    "invalidate": {
      "en": "Invalidate",
      "zh": "失效"
    },
    "noBindings": {
      "en": "No bindings yet",
      "zh": "还没有绑定"
    },
    "remainDays": {
      "en": "{d} days left",
      "zh": "剩余 {d} 天"
    },
    "remainHours": {
      "en": "{h} hours left",
      "zh": "剩余 {h} 小时"
    },
    "save": {
      "en": "Save",
      "zh": "保存"
    },
    "snapshotUrl": {
      "en": "Snapshot URL",
      "zh": "快照地址"
    },
    "successTip": {
      "en": "Success",
      "zh": "成功"
    },
    "title": {
      "en": "Snapshot Settings",
      "zh": "快照设置"
    },
    "ttlHours": {
      "en": "Auto-delete after (hours)",
      "zh": "自动删除时间（小时）"
    },
    "ttlTip": {
      "en": "Snapshots are automatically deleted after this long. Default 24 hours.",
      "zh": "快照超过此时长后自动删除，默认 24 小时。"
    },
    "confirmTitle": {
      "en": "Confirm",
      "zh": "确认操作"
    },
    "positiveText": {
      "en": "Confirm",
      "zh": "确定"
    },
    "negativeText": {
      "en": "Cancel",
      "zh": "取消"
    },
    "enterAddressFirst": {
      "en": "Please enter email addresses first, one per line",
      "zh": "请先输入邮箱地址，每行一个"
    },
    "skippedAddresses": {
      "en": "Skipped addresses:",
      "zh": "以下地址跳过："
    },
    "invalidFormat": {
      "en": "{addr} (invalid format)",
      "zh": "{addr} (格式错误)"
    },
    "invalidDomain": {
      "en": "{addr} (domain not allowed)",
      "zh": "{addr} (域名不在列表中)"
    },
    "domainWarnContent": {
      "en": "The domain {domain} is not in the allowed list. You can still bind it, but only mail the system actually receives will show. Continue anyway?",
      "zh": "域名 {domain} 不在允许列表中。仍然可以绑定，但只有系统实际收到的邮件才会显示。确定继续吗？"
    },
    "batchDomainWarnContent": {
      "en": "{n} address(es) use a domain outside the allowed list:\n{list}\nBind them anyway?",
      "zh": "有 {n} 个邮箱的域名不在允许列表中：\n{list}\n仍然绑定它们吗？"
    },
    "continueBind": {
      "en": "Bind anyway",
      "zh": "仍然绑定"
    },
    "alreadyBound": {
      "en": "{addr} (already bound)",
      "zh": "{addr} (已绑定)"
    },
    "unknownError": {
      "en": "Unknown error",
      "zh": "未知错误"
    },
    "requestFailed": {
      "en": "Request failed",
      "zh": "请求失败"
    },
    "batchDone": {
      "en": "Batch bind done: {success} succeeded",
      "zh": "批量绑定完成：成功 {success} 个"
    },
    "batchDoneWithFailed": {
      "en": "Batch bind done: {success} succeeded, {failed} failed:",
      "zh": "批量绑定完成：成功 {success} 个，失败 {failed} 个："
    },
    "confirmReplace": {
      "en": "Replace the link? The old link will be invalidated immediately.",
      "zh": "确定要更换链接吗？旧链接将立即失效。"
    },
    "linkReplaced": {
      "en": "Link replaced, the old link is now invalid",
      "zh": "链接已更换，旧链接已失效"
    },
    "replaceLink": {
      "en": "Replace link",
      "zh": "更换链接"
    },
    "batchBind": {
      "en": "Batch bind",
      "zh": "批量绑定"
    },
    "batchBindTip": {
      "en": "Enter one email address per line. Format, domain and existing bindings are checked automatically.",
      "zh": "每行输入一个邮箱地址，系统会自动检查格式、域名和是否已绑定。"
    },
    "batchPlaceholder": {
      "en": "e.g.:\ntest1{'@'}example.com\ntest2{'@'}example.com",
      "zh": "例如：\ntest1{'@'}ciaooo55.us.ci\ntest2{'@'}ciaooo55.us.ci"
    },
    "clear": {
      "en": "Clear",
      "zh": "清空"
    },
    "permanent": {
      "en": "Permanent",
      "zh": "永久有效"
    },
    "selectedCount": {
      "en": "{n} selected",
      "zh": "已选 {n} 个"
    },
    "batchExtend": {
      "en": "Extend Expiry",
      "zh": "调整有效期"
    },
    "batchReplace": {
      "en": "Replace Links",
      "zh": "更换链接"
    },
    "batchDelete": {
      "en": "Delete",
      "zh": "删除"
    },
    "cancelSelection": {
      "en": "Clear selection",
      "zh": "取消选择"
    },
    "confirmBatchDelete": {
      "en": "Delete {n} selected bindings? Their snapshot URLs will stop working immediately.",
      "zh": "确定删除选中的 {n} 个绑定吗？快照链接将立即失效。"
    },
    "confirmBatchExtend": {
      "en": "Set the expiry of {n} selected bindings to \"{duration}\"? The snapshot URLs stay the same.",
      "zh": "确定将选中的 {n} 个绑定有效期设为「{duration}」吗？快照链接保持不变。"
    },
    "confirmBatchReplace": {
      "en": "Replace the links of {n} selected bindings? The old URLs will stop working immediately.",
      "zh": "确定为选中的 {n} 个绑定更换链接吗？旧链接将立即失效。"
    },
    "batchOpDone": {
      "en": "Batch done: {success} succeeded, {failed} failed",
      "zh": "批量操作完成：成功 {success} 个，失败 {failed} 个"
    },
    "copyInfo": {
      "en": "Copy info",
      "zh": "复制信息"
    },
    "copySelected": {
      "en": "Copy selected",
      "zh": "复制选中"
    },
    "copyAll": {
      "en": "Copy all",
      "zh": "复制全部"
    },
    "searchPlaceholder": {
      "en": "Search email address",
      "zh": "搜索邮箱地址"
    },
    "addBinding": {
      "en": "Add binding",
      "zh": "添加绑定"
    },
    "duration": {
      "en": "Duration",
      "zh": "有效期"
    },
    "custom": {
      "en": "Custom",
      "zh": "自定义"
    },
  },
  "views.admin.SendMail": {
    "adminComposeTip": {
      "en": "Send from a configured email address",
      "zh": "使用已配置的邮箱地址发信"
    },
    "composeMail": {
      "en": "Compose email",
      "zh": "写邮件"
    },
    "content": {
      "en": "Content",
      "zh": "内容"
    },
    "contentEmpty": {
      "en": "Content is empty",
      "zh": "内容不能为空"
    },
    "contentPlaceholder": {
      "en": "Write your message...",
      "zh": "输入邮件正文..."
    },
    "draftSaved": {
      "en": "Draft saved in this browser",
      "zh": "草稿已保存在当前浏览器"
    },
    "edit": {
      "en": "Edit",
      "zh": "编辑"
    },
    "fromMailEmpty": {
      "en": "Sender address is empty",
      "zh": "发件人地址不能为空"
    },
    "html": {
      "en": "HTML source",
      "zh": "HTML 源码"
    },
    "preview": {
      "en": "Preview",
      "zh": "预览"
    },
    "recipientAddress": {
      "en": "Recipient address",
      "zh": "收件人邮箱"
    },
    "recipientName": {
      "en": "Recipient name (optional)",
      "zh": "收件人名称（可选）"
    },
    "rich text": {
      "en": "Rich Text",
      "zh": "富文本"
    },
    "send": {
      "en": "Send",
      "zh": "发送"
    },
    "senderAddress": {
      "en": "Sender address",
      "zh": "发件邮箱"
    },
    "senderName": {
      "en": "Sender name (optional)",
      "zh": "发件人名称（可选）"
    },
    "subject": {
      "en": "Subject",
      "zh": "主题"
    },
    "subjectEmpty": {
      "en": "Subject is empty",
      "zh": "主题不能为空"
    },
    "successSend": {
      "en": "Please check your sendbox. If failed, please try again later.",
      "zh": "请查看您的发件箱, 如果失败, 请检查稍后重试。"
    },
    "text": {
      "en": "Text",
      "zh": "纯文本"
    },
    "toMailEmpty": {
      "en": "Recipient address is empty",
      "zh": "收件人地址不能为空"
    },
    "tooLarge": {
      "en": "Too large file, please upload file less than 1MB.",
      "zh": "文件过大, 请上传小于1MB的文件。"
    }
  },
  "views.admin.Account": {
    "actions": {
      "en": "Actions",
      "zh": "操作"
    },
    "addressQueryTip": {
      "en": "Leave blank to query all email addresses",
      "zh": "留空查询所有邮箱地址"
    },
    "clearInbox": {
      "en": "Clear Inbox",
      "zh": "清空收件箱"
    },
    "clearInboxTip": {
      "en": "Are you sure to clear inbox for this email?",
      "zh": "确定要清空这个邮箱的收件箱吗？"
    },
    "clearSentItems": {
      "en": "Clear Sent Items",
      "zh": "清空发件箱"
    },
    "clearSentItemsTip": {
      "en": "Are you sure to clear sent items for this email?",
      "zh": "确定要清空这个邮箱的发件箱吗？"
    },
    "created_at": {
      "en": "Created At",
      "zh": "创建时间"
    },
    "delete": {
      "en": "Delete",
      "zh": "删除"
    },
    "deleteMailbox": {
      "en": "Delete Mailbox",
      "zh": "删除邮箱"
    },
    "deleteTip": {
      "en": "Are you sure you want to delete this mailbox?",
      "zh": "确定要删除这个邮箱吗？"
    },
    "itemCount": {
      "en": "itemCount",
      "zh": "总数"
    },
    "mail_count": {
      "en": "Mail Count",
      "zh": "邮件数量"
    },
    "multiClearInbox": {
      "en": "Multi Clear Inbox",
      "zh": "批量清空收件箱"
    },
    "multiClearInboxTip": {
      "en": "Are you sure to clear inbox for selected addresses?",
      "zh": "确定要清空选中邮箱的收件箱吗？"
    },
    "multiClearSentItems": {
      "en": "Multi Clear Sent Items",
      "zh": "批量清空发件箱"
    },
    "multiClearSentItemsTip": {
      "en": "Are you sure to clear sent items for selected addresses?",
      "zh": "确定要清空选中邮箱的发件箱吗？"
    },
    "multiDelete": {
      "en": "Multi Delete",
      "zh": "批量删除"
    },
    "multiDeleteTip": {
      "en": "Are you sure to delete selected addresses?",
      "zh": "确定要删除选中的邮箱吗？"
    },
    "emailAddress": {
      "en": "Email Address",
      "zh": "邮箱地址"
    },
    "newPassword": {
      "en": "New Password",
      "zh": "新密码"
    },
    "passwordResetSuccess": {
      "en": "Password reset successfully",
      "zh": "密码重置成功"
    },
    "pleaseSelectAddress": {
      "en": "Please select a mailbox",
      "zh": "请选择邮箱"
    },
    "query": {
      "en": "Query",
      "zh": "查询"
    },
    "resetPassword": {
      "en": "Reset Password",
      "zh": "重置密码"
    },
    "selectAll": {
      "en": "Select All of This Page",
      "zh": "全选本页"
    },
    "selectedItems": {
      "en": "Selected",
      "zh": "已选择"
    },
    "send_count": {
      "en": "Send Count",
      "zh": "发送数量"
    },
    "showCredential": {
      "en": "Show Mail Address Credential",
      "zh": "查看邮箱地址凭证"
    },
    "source_meta": {
      "en": "Source",
      "zh": "来源"
    },
    "success": {
      "en": "Success",
      "zh": "成功"
    },
    "unselectAll": {
      "en": "Unselect All",
      "zh": "取消全选"
    },
    "updated_at": {
      "en": "Update At",
      "zh": "更新时间"
    },
    "viewMails": {
      "en": "View Mails",
      "zh": "查看邮件"
    },
    "viewSendBox": {
      "en": "View SendBox",
      "zh": "查看发件箱"
    }
  },
  "views.admin.Statistics": {
    "scope": {"en":"Stored messages only: cleanup/deletion reduces these counts. Loads only on this page, with a 60-second server cache and no polling.","zh":"统计当前仍保存的邮件，清理或删除后数量会减少；只在打开本页或手动操作时读取，服务器缓存 60 秒，不后台轮询。"},
    "refresh": {"en":"Refresh statistics","zh":"刷新统计"},
    "loadFailed": {"en":"Message statistics could not load. Budget status below loads separately; retry later.","zh":"邮件统计暂时读不到，请稍后刷新；下方保护预算会独立读取。"},
    "weekTitle": {"en":"Last 7 days · received and sent","zh":"最近 7 天收发情况"},
    "received": {"en":"Received","zh":"收信"},
    "sent": {"en":"Sent","zh":"发信"},
    "most": {"en":"Most received · 7 days","zh":"收信最多的邮箱 · 7 天"},
    "least": {"en":"Least received · 7 days","zh":"收信最少的邮箱 · 7 天"},
    "messages": {"en":"messages","zh":"封"},
    "rankingScope": {"en":"Today plus the previous 6 UTC dates. Includes all known mailboxes, including zero-message mailboxes; alphabetically first appears on ties. Only stored mail is counted, not lifetime delivery or rejections.","zh":"范围为 UTC 今天及前 6 天。排行包含所有已知邮箱，也包含 0 封；并列时按邮箱名称展示第一项。仅计算仍保存的邮件，不是历史投递总量，也不含拒收数量。"},
    "mailboxTitle": {"en":"Messages per mailbox · 7 days","zh":"每个邮箱收发了几封 · 7 天"},
    "sort": {"en":"Mailbox sort order","zh":"邮箱排序"},
    "sortReceived": {"en":"Most received first","zh":"按收信数从多到少"},
    "sortSent": {"en":"Most sent first","zh":"按发信数从多到少"},
    "mailbox": {"en":"Your mailbox","zh":"本地邮箱"},
    "noMailboxes": {"en":"No known mailboxes on this page.","zh":"本页暂无已知邮箱。"},
    "budgetTitle": {"en":"This app's D1 protection budget · estimated","zh":"本应用 D1 保护预算 · 估算"},
    "budgetHelp": {"en":"Existing guard counters reserve estimated database rows, NOT Cloudflare's actual usage or bill. No new per-message tracking. Other apps, Worker requests and KV are not covered. The soft threshold pauses protected website/API actions; the hard threshold also pauses incoming mail.","zh":"直接读取已有保护计数，不增加每封邮件的记账操作。这些数是为防超额而预留的数据库读写行数，不是 Cloudflare 实际用量或账单；不包含其他项目、Worker 请求数和 KV 用量。达到软线会暂停受保护的网页/API 操作；达到硬线也会暂停收信。"},
    "budgetUnavailable": {"en":"Protection counters unavailable or not initialized; unknown usage is not shown as zero.","zh":"保护计数暂不可用或尚未初始化，无法计算剩余；不会把未知用量当成 0。"},
    "today": {"en":"Today reserved","zh":"今天预留"},
    "yesterday": {"en":"Yesterday reserved","zh":"昨天预留"},
    "twoDays": {"en":"2-day total","zh":"两天合计"},
    "metric": {"en":"Estimated D1 rows","zh":"D1 行数估算"},
    "reads": {"en":"Rows read","zh":"读取行数"},
    "writes": {"en":"Rows written","zh":"写入行数"},
    "softRemaining": {"en":"Today: until soft stop","zh":"今日距软线剩余"},
    "hardRemaining": {"en":"Today: until hard stop","zh":"今日距硬线剩余"},
    "hardLimit": {"en":"Daily hard limit","zh":"每日保护硬上限"},
    "freeReference": {"en":"Cloudflare Free reference per UTC day: {reads} rows read / {writes} rows written, shared across the account. This guard stops earlier; remaining budget is not account-wide remaining allowance.","zh":"Cloudflare Free 每个 UTC 日参考上限：读 {reads} 行、写 {writes} 行，整个账户共享。本应用提前保护暂停，表里的「剩余」不等于账户还剩的免费额度。"},
    "resetHelp": {"en":"Reset: 00:00 UTC (08:00 China time). Yesterday is history, unused allowance does not roll over. The 2-day total is not a spendable pool. No row means no reservation recorded, not zero Cloudflare usage.","zh":"每日 UTC 00:00（北京时间 08:00）重置。昨天只作历史参考，没用完的额度不会转到今天；两天合计只是对比，不能当成今天可用额度。某天没有预留记录按 0 展示，不代表 Cloudflare 当天零消耗。"},
    "accountNotConnected": {"en":"Cloudflare account-wide actual usage: not connected (no Analytics credentials).","zh":"Cloudflare 账户真实总用量：未连接（未配置 Analytics 读取凭据）。"},
    "accountLink": {"en":"View actual account usage in Cloudflare","zh":"前往 Cloudflare 查看实际用量"},
    "activeAddressCount30days": {
      "en": "30 days Active Address Count",
      "zh": "30天活跃邮箱地址总数"
    },
    "activeAddressCount7days": {
      "en": "7 days Active Address Count",
      "zh": "7天活跃邮箱地址总数"
    },
    "addressCount": {
      "en": "Address Count",
      "zh": "邮箱地址总数"
    },
    "mailCount": {
      "en": "Mail Count",
      "zh": "邮件总数"
    },
    "sendMailCount": {
      "en": "Send Mail Count",
      "zh": "发送邮件总数"
    }
  },
  "views.admin.SenderAccess": {
    "guide": {"en":"This controls sending from each local mailbox, not receiving. Remaining sends is a message count, not money. Enabled with 10 remaining allows up to 10 successful sends. Disabled or 0 blocks ordinary sending; balance-exempt mailboxes are an exception but still obey site-wide limits. Confirming Modify saves immediately and creates an internal status notice. Delete removes only the sending-permission record, not mailboxes or messages.","zh":"这里管理每个本地邮箱「能不能发信、还能发几封」，不影响收信。「剩余可发封数」不是钱：启用并设为 10，就是最多还能成功发 10 封。停用或设为 0 会阻止普通发信；邮箱设置中的免余额检查名单例外，但仍受全站上限限制。点修改并确认会立即保存，并产生一封站内状态通知；删除只移除发信权限记录，不删邮箱和邮件。"},
    "action": {
      "en": "Action",
      "zh": "操作"
    },
    "address": {
      "en": "Email Address",
      "zh": "邮箱地址"
    },
    "balance": {
      "en": "Remaining sends",
      "zh": "剩余可发封数"
    },
    "created_at": {
      "en": "Created At",
      "zh": "创建时间"
    },
    "delete": {
      "en": "Delete",
      "zh": "删除"
    },
    "deleteTip": {
      "en": "Are you sure to delete this?",
      "zh": "确定删除吗？"
    },
    "disable": {
      "en": "Disable",
      "zh": "禁用"
    },
    "enable": {
      "en": "Enable",
      "zh": "启用"
    },
    "is_enabled": {
      "en": "Is Enabled",
      "zh": "是否启用"
    },
    "itemCount": {
      "en": "itemCount",
      "zh": "总数"
    },
    "modalTip": {
      "en": "Set remaining successful sends (0 blocks ordinary sending)",
      "zh": "设置还能成功发送的封数（0 会阻止普通发信）"
    },
    "modify": {
      "en": "Modify",
      "zh": "修改"
    },
    "ok": {
      "en": "OK",
      "zh": "确定"
    },
    "query": {
      "en": "Query",
      "zh": "查询"
    },
    "success": {
      "en": "Success",
      "zh": "成功"
    }
  },
  "views.admin.IpBlacklistSettings": {
    "accessGuide": {"en":"These settings affect protected create-address/send APIs, not incoming email. A visitor IP is a network address. The ASN field matches the network company NAME, such as Amazon, not an ASN number. Fingerprints identify browsers, not people. A network-company block can affect many users. Type each entry and press Enter, then Save access rules. Protection above saves separately.","zh":"这部分管创建邮箱、发信等受保护 API 的访问者，不是屏蔽邮件发件人。IP 是访问者的网络地址；这里的 ASN 实际填网络公司名称（如 Amazon），不是编号，拉黑后可能影响很多人；指纹只是浏览器标识，不等于一个人。每项输入后按回车，再点下方「保存访问规则」；上面的收信/快照防刷单独保存。"},
    "accessTitle": { "en": "Website and API access", "zh": "网页与 API 访问" },
    "saveAccess": { "en": "Save access rules", "zh": "保存访问规则" },
    "ipHelp": { "en": "Blocks IPs on protected address/send endpoints, not email senders or snapshot links. Regular expressions are supported.", "zh": "拦截创建邮箱和发信等受保护接口的访问 IP，不是邮件发件人，也不覆盖快照。支持正则表达式。" },
    "asnHelp": { "en": "Matches the visitor network organization, such as a cloud provider; can also block legitimate users on that network.", "zh": "按访客网络所属公司名称拦截，例如某个云服务商；不是邮箱域名，可能同时影响该网络的正常用户。" },
    "fingerprintHelp": { "en": "Browser fingerprints can be spoofed. Snapshots do not supply fingerprints; use snapshot IP protection above.", "zh": "浏览器指纹可以被伪造；快照没有指纹，请用上方独立防刷保护快照。" },
    "whitelistHelp": {"en":"Only listed IPs may use protected address/send endpoints. Include your own IP. Daily limits still apply; incoming mail and snapshots are unaffected.","zh":"仅名单中的 IP 可使用创建邮箱和发信等受保护接口，请勿漏掉自己当前的 IP。仍受每日次数限制；不限制收信和快照。"},
    "dailyHelp": { "en": "Counts protected address/send requests per IP; resets at 00:00 UTC (08:00 China time). Does not limit snapshots.", "zh": "仅统计创建邮箱和发信等受保护接口，每个 IP 每天北京时间 08:00 重置。快照请用上方独立防刷。" },
    "asn_blacklist": {
      "en": "ASN Organization Blacklist",
      "zh": "ASN 组织（运营商）黑名单"
    },
    "asn_blacklist_placeholder": {
      "en": "Enter ASN organization (e.g., Google, Amazon)",
      "zh": "输入 ASN 组织名称（例如：Google, Amazon）"
    },
    "daily_request_limit": {
      "en": "Daily Request Limit",
      "zh": "每日请求次数上限"
    },
    "daily_request_limit_placeholder": {
      "en": "Enter limit (e.g., 1000)",
      "zh": "输入限制次数（例如：1000）"
    },
    "enable_daily_limit": {
      "en": "Enable Daily Request Limit",
      "zh": "启用每日请求限流"
    },
    "enable_daily_limit_tip": {
      "en": "Limit the number of API requests per IP address per day",
      "zh": "限制每个 IP 地址每天的 API 请求次数"
    },
    "enable_ip_blacklist": {
      "en": "Enable IP Blacklist",
      "zh": "启用 IP 黑名单"
    },
    "enable_ip_whitelist": {
      "en": "Enable IP Whitelist (Strict)",
      "zh": "启用 IP 白名单（严格模式）"
    },
    "enable_tip": {
      "en": "Block IPs matching blacklist patterns from accessing rate-limited APIs",
      "zh": "阻止匹配黑名单的 IP 访问限流 API"
    },
    "enable_whitelist_tip": {
      "en": "Strict mode: ONLY IPs matching the whitelist can access rate-limited APIs. All other IPs will be denied.",
      "zh": "严格模式：仅允许匹配白名单的 IP 访问限流 API，其他所有 IP 将被拒绝"
    },
    "fingerprint_blacklist": {
      "en": "Browser Fingerprint Blacklist",
      "zh": "浏览器指纹黑名单"
    },
    "fingerprint_blacklist_placeholder": {
      "en": "Enter fingerprint ID (e.g., a1b2c3d4e5f6g7h8)",
      "zh": "输入指纹 ID（例如：a1b2c3d4e5f6g7h8）"
    },
    "ip_blacklist": {
      "en": "IP Blacklist Patterns",
      "zh": "IP 黑名单匹配模式"
    },
    "ip_blacklist_placeholder": {
      "en": "Enter pattern (e.g., 192.168.1 or ^10\\.0\\.0\\.5$)",
      "zh": "输入匹配模式（例如：192.168.1 或 ^10\\.0\\.0\\.5$）"
    },
    "ip_whitelist": {
      "en": "IP Whitelist Patterns",
      "zh": "IP 白名单匹配模式"
    },
    "ip_whitelist_placeholder": {
      "en": "Exact IP (e.g., 1.2.3.4) or anchored regex (e.g., ^192\\.168\\.1\\.\\d+$)",
      "zh": "精确 IP(如 1.2.3.4)或锚定正则(如 ^192\\.168\\.1\\.\\d+$)"
    },
    "manualInputPrompt": {
      "en": "Type pattern and press Enter to add",
      "zh": "输入匹配模式后按回车键添加"
    },
    "save": {
      "en": "Save",
      "zh": "保存"
    },
    "successTip": {
      "en": "Save Success",
      "zh": "保存成功"
    },
    "tip_asn": {
      "en": "ASN Organization: Block by ISP/provider. Case-insensitive text matching or regex.",
      "zh": "ASN 组织：根据运营商/ISP 拉黑。支持不区分大小写的文本匹配或正则表达式。"
    },
    "tip_daily_limit": {
      "en": "Daily Limit: Restrict the maximum number of requests per IP address per day (1-1000000).",
      "zh": "每日限流：限制单个 IP 地址每天最多请求次数（1-1000000）。"
    },
    "tip_fingerprint": {
      "en": "Browser Fingerprint: Block by browser fingerprint. Supports exact matching or regex patterns.",
      "zh": "浏览器指纹：根据浏览器指纹拉黑。支持完全匹配或正则表达式。"
    },
    "tip_ip": {
      "en": "IP Blacklist: Supports text matching (e.g., \"192.168.1\") or regex (e.g., \"^10\\.0\\.0\\.5$\").",
      "zh": "IP 黑名单：支持文本匹配（如 \"192.168.1\"）或正则表达式（如 \"^10\\.0\\.0\\.5$\"）。"
    },
    "tip_scope": {
      "en": "Applies to: Create Address, Send Mail, External Send Mail API, User Registration, Verify Code",
      "zh": "作用范围：创建邮箱地址、发送邮件、外部发送邮件 API、用户注册、验证码验证"
    },
    "tip_whitelist": {
      "en": "IP Whitelist: Strict allowlist — plain entries must be EXACT IP matches (no substring). Use anchored regex (^...$) for ranges. Whitelisted IPs skip blacklist checks.",
      "zh": "IP 白名单: 严格放行名单——纯文本必须是精确 IP(不支持子串匹配), 批量放行请用锚定正则 ^...$. 命中白名单的 IP 将跳过黑名单检查."
    },
    "title": {
      "en": "IP Blacklist Settings",
      "zh": "IP 黑名单设置"
    },
    "whitelist_empty_warning": {
      "en": "IP whitelist is enabled but the list is empty. This is ignored by the server to prevent lockout. Please add at least one entry before enabling.",
      "zh": "IP 白名单已启用但列表为空，服务端将忽略该开关以防止锁死。请先添加至少一条白名单条目再启用。"
    }
  },
  "views.admin.Telegram": {
    "envHelp": {"en":"The default bot is configured with environment variables, so its switch and recipient filters are read-only here. To stop commands only, disable its webhook in Advanced.","zh":"默认机器人来自环境变量，表格里的开关和接收白名单不能在网页修改；只想停用命令，可到高级设置关闭其回调。"},
    "pushHelp": { "en": "For mail notifications, configure a bot token, enable global push and enter destination chat IDs. No webhook is required.", "zh": "只接收来信推送：配置机器人 Token、打开全局推送并填写接收聊天 ID 即可，不需要设置 webhook。" },
    "whitelistHelp": {"en":"For bots added on this page, these lists filter notification recipients; an empty list does not restrict that recipient type. Set actual targets in global push or mailbox bindings. Command access uses the Telegram allowlist below.","zh":"网页添加的机器人：表格白名单用于筛选推送接收人，该类名单留空则不限制。实际接收人仍在全局推送或邮箱绑定中设置；命令使用权限看下方 Telegram 白名单。"},
    "allowListHelp": {"en":"Restricts Telegram user IDs allowed to use private bot commands. Enter user IDs, not email addresses. Does not change web admin access or global notification targets.","zh":"限制哪些 Telegram 用户 ID 能私聊机器人执行命令。填用户 ID，不是邮箱地址；不改变网页管理员权限或全局推送接收名单。"},
    "miniAppHelp": { "en": "Only needed for the Telegram mail mini app. Leave empty for notifications only.", "zh": "仅用于 Telegram 内嵌邮件小程序；只要来信通知就留空。" },
    "advancedWebhook": { "en": "Advanced: control mail from Telegram (webhook)", "zh": "高级：在 Telegram 中操作邮箱（webhook）" },
    "webhookHelp": { "en": "Enable only for commands such as /new or /mails. Status checks send no messages. Disabling the webhook stops commands, but notifications keep working.", "zh": "只有需要 /new、/mails 等机器人命令时才启用。检查状态不会发消息；关闭 webhook 只停机器人命令，来信推送继续工作。" },
    "disableWebhook": { "en": "Disable bot commands", "zh": "关闭机器人命令" },
    "webhookDisabled": { "en": "Webhook disabled; notifications remain enabled", "zh": "已关闭 webhook，来信推送保留" },
    "disableWebhookConfirm": { "en": "Disable Telegram commands? Incoming mail notifications will remain enabled.", "zh": "关闭后不能在 Telegram 中使用机器人命令，来信推送不受影响。确定关闭？" },
    "enable": {
      "en": "Enable",
      "zh": "启用"
    },
    "enabled": {
      "en": "Enabled",
      "zh": "已启用"
    },
    "enableGlobalMailPush": {
      "en": "Enable Global Mail Push(Manually input telegram Chat ID)",
      "zh": "启用全局邮件推送(手动输入邮箱管理员的 telegram Chat ID, 回车增加)"
    },
    "enableTelegramAllowList": {
      "en": "Enable Telegram Allow List(Manually input Chat ID)",
      "zh": "启用 Telegram 白名单(手动输入 Chat ID, 回车增加)"
    },
    "globalMailPushList": {
      "en": "Global Mail Push Chat ID List",
      "zh": "全局邮件推送 Chat ID 列表"
    },
    "globalMailPushListTip": {
      "en": "Supports chat_id of private chat/group/channel. Send a message to your bot first, then fill your BOT TOKEN into the link below to see the chat_id. If a webhook is registered, disable it in Advanced before using getUpdates. Known chat IDs can be entered directly without changing the webhook.",
      "zh": "支持对话/群组/频道的 Chat ID。先给机器人发一条消息，然后把 BOT TOKEN 填入下面链接查看 chat_id。如果已注册 webhook，须先在高级设置关闭回调才能使用 getUpdates；已知 Chat ID 可直接填写，不必更改回调。"
    },
    "getUpdatesUrlTemplate": {
      "en": "https://api.telegram.org/bot<Replace with your BOT TOKEN>/getUpdates",
      "zh": "https://api.telegram.org/bot<这里替换成您的 BOT TOKEN>/getUpdates"
    },
    "copy": {
      "en": "Copy",
      "zh": "复制"
    },
    "copied": {
      "en": "Copied",
      "zh": "已复制"
    },
    "init": {
      "en": "Init",
      "zh": "初始化"
    },
    "confirmInit": {
      "en": "This will re-register the Telegram webhook for the default bot and rotate the webhook secret. The bot will keep working, but do not click this unless the bot stops receiving messages.",
      "zh": "这会重新注册默认机器人的 Telegram Webhook 并更换校验密钥。机器人会继续工作，但除非机器人收不到消息，否则不要点。"
    },
    "manualInputPrompt": {
      "en": "Type and press Enter to add",
      "zh": "输入后按回车键添加"
    },
    "miniAppUrl": {
      "en": "Telegram Mini App URL",
      "zh": "电报小程序 URL(请输入你部署的电报小程序网页地址)"
    },
    "save": {
      "en": "Save",
      "zh": "保存"
    },
    "status": {
      "en": "Check Status",
      "zh": "查看状态"
    },
    "successTip": {
      "en": "Success",
      "zh": "成功"
    },
    "telegramAllowList": {
      "en": "Telegram Allow List(Manually input telegram Chat ID)",
      "zh": "Telegram 白名单(手动输入 Chat ID, 回车增加)"
    },
    "actions": {
      "en": "Actions",
      "zh": "操作"
    },
    "add": {
      "en": "Add",
      "zh": "添加"
    },
    "botManagement": {
      "en": "Telegram Bots",
      "zh": "Telegram 机器人管理"
    },
    "botManagementTip": {
      "en": "Add one or more bots here. Pushes are sent via all enabled bots independently. A previously configured default bot still works.",
      "zh": "在这里添加一个或多个机器人。推送会经由所有启用的机器人独立发送。此前已配置好的默认机器人仍然有效。"
    },
    "botName": {
      "en": "Name",
      "zh": "名称"
    },
    "botToken": {
      "en": "Token",
      "zh": "Token"
    },
    "confirmDelete": {
      "en": "Delete this bot?",
      "zh": "确认删除该机器人？"
    },
    "delete": {
      "en": "Delete",
      "zh": "删除"
    },
    "namePlaceholder": {
      "en": "Bot name, e.g. main bot",
      "zh": "机器人名称，如 主机器人"
    },
    "noBots": {
      "en": "No bots configured here. Pushes will use the default bot if one is configured.",
      "zh": "这里还没有配置机器人。如已配置默认机器人，推送会走该机器人。"
    },
    "setWebhook": {
      "en": "Set Webhook",
      "zh": "设置 Webhook"
    },
    "test": {
      "en": "Test",
      "zh": "测试"
    },
    "testChatId": {
      "en": "Chat ID",
      "zh": "Chat ID"
    },
    "testChatIdTip": {
      "en": "Your Telegram user/chat ID (get it from {'@'}userinfobot). Leave blank to only verify the token.",
      "zh": "你的 Telegram 用户/对话 ID（可从 {'@'}userinfobot 获取）。留空则只验证 Token 有效性。"
    },
    "testFail": {
      "en": "Test failed: ",
      "zh": "测试失败："
    },
    "testMsgSent": {
      "en": "test message sent",
      "zh": "测试消息已发送"
    },
    "testOk": {
      "en": "Token is valid",
      "zh": "Token 有效"
    },
    "tokenPlaceholder": {
      "en": "Bot token from {'@'}BotFather",
      "zh": "从 {'@'}BotFather 获取的机器人 Token"
    },
    "webhookOk": {
      "en": "Webhook set",
      "zh": "Webhook 已设置"
    },
    "confirmTitle": {
      "en": "Confirm",
      "zh": "确认操作"
    },
    "positiveText": {
      "en": "Confirm",
      "zh": "确定"
    },
    "negativeText": {
      "en": "Cancel",
      "zh": "取消"
    },
    "botManagementTipExtra": {
      "en": "One bot per line. Each bot can have its own user ID whitelist and group ID whitelist (comma-separated); leave empty for no restriction.",
      "zh": "每个机器人一行，可单独设置用户ID白名单和群组ID白名单（逗号分隔），留空表示不限制。"
    },
    "userIdWhitelist": {
      "en": "User ID whitelist",
      "zh": "用户ID白名单"
    },
    "groupIdWhitelist": {
      "en": "Group ID whitelist",
      "zh": "群组ID白名单"
    },
    "chatIdsPlaceholder": {
      "en": "e.g. 123456,789012, leave empty for no restriction",
      "zh": "如：123456,789012，留空不限制"
    },
    "groupIdsPlaceholder": {
      "en": "e.g. -100123456, leave empty for no restriction",
      "zh": "如：-100123456，留空不限制"
    },
    "newChatIdsPlaceholder": {
      "en": "User ID whitelist (comma-separated, leave empty for no restriction)",
      "zh": "用户ID白名单（逗号分隔，留空不限制）"
    },
    "newGroupIdsPlaceholder": {
      "en": "Group ID whitelist (comma-separated, leave empty for no restriction)",
      "zh": "群组ID白名单（逗号分隔，留空不限制）"
    }
  },
  "views.admin.AccountSettings": {
    "guide": {"en":"Choose whether to block a sender everywhere, a domain for one mailbox, or all new mail to a mailbox. Type an entry and press Enter; Save all mailbox rules at the bottom applies changes. Removing a rule restores future delivery, not previously rejected mail.","zh":"下面三种规则分别管：所有邮箱都不收某个发件人的信、只让一个邮箱不收某个域名的信、停用一个收件邮箱。输入一项后按回车，最后点底部「保存全部邮箱规则」才生效。删掉规则只能恢复之后的收信，不能找回之前已拒收的邮件。"},
    "fromExample": {"en":"Example: spam{'@'}example.com blocks sender addresses containing it for all mailboxes. {'@'}ads.example also matches user{'@'}ads.example. This is text containment, not exact matching; short fragments may block unrelated senders. Blank means no additional block.","zh":"例：填 spam{'@'}example.com，所有邮箱都会拒收发件地址包含它的信；填 {'@'}ads.example，也会拒收 user{'@'}ads.example 的信。这是「包含文字」而非精确匹配，别只填太短的片段，避免误拦。留空表示不额外拦截。"},
    "domainExample": {"en":"Example: your mailbox work{'@'}example.net on the left, the other party's domain ads.example on the right (no {'@'}). Only that mailbox rejects ads.example and its subdomains; other mailboxes still receive it. Use your mailbox address as shown in the mailbox list.","zh":"例：左边填自己的收件邮箱 work{'@'}example.net，右边填对方的域名 ads.example（不带 {'@'}）。只有 work{'@'}example.net 拒收 ads.example 及其子域名的信，其他邮箱照常收。左侧请用邮箱列表里显示的地址。"},
    "mailboxExample": {"en":"Example: add old{'@'}example.net to reject all new mail to it. Existing messages remain readable. Remove it and save to resume receiving; this is not mailbox deletion.","zh":"例：加入 old{'@'}example.net 后，任何人再往这个邮箱发信都会被拒收，旧邮件仍可查看。移除并保存后恢复接收新信；这里不是删除邮箱。"},
    "sendingGuide": {"en":"Outgoing controls do not block incoming mail. These are this site's sending limits, not Cloudflare's free allowance. All mailboxes share daily/monthly limits, resetting at UTC midnight/month start. 0 stops sends; -1 removes that limit. Keep sensible limits enabled.","zh":"下面只管「往外发信」，不影响收信；这是你给本网站设的发信上限，不是 Cloudflare 免费额度。日/月上限由所有邮箱共享，分别按 UTC 零点/月初重置。0 表示停发，-1 表示该项不限，建议保留合理上限。"},
    "fromHelp": {"en":"All mailboxes reject a message when its delivery sender or displayed From address contains an entry (case-sensitive). Rejected messages are not stored or pushed. Rejection can still use Worker/database resources.","zh":"只要实际投递方或邮件上显示的发件地址包含你填的内容，所有邮箱都拒收，区分大小写。拒收后不保存、不推送；但请求已经到达服务器，仍可能消耗 Worker/数据库资源，并非零额度。"},
    "domainHelp": { "en": "Blocks a sender domain and its subdomains for one recipient only. Your mailbox goes left; their sender domain goes right.", "zh": "左边填你的收件邮箱，右边填对方发件域名；只对该邮箱拦截这个域名及子域名，不影响其他邮箱。" },
    "mailboxHelp": { "en": "Rejects incoming mail to these mailboxes without deleting existing messages. Remove an entry to resume delivery.", "zh": "停用这些收件邮箱的来信，不删除已有邮件；移出名单即可恢复收信。" },
    "sendBlockHelp": {"en":"Blocks outgoing mail whose destination address contains an entry (case-sensitive). These are recipient addresses or domain fragments, not your local sender mailboxes. Incoming mail is unaffected.","zh":"禁止向包含这些文本的收件地址发信，区分大小写。填对方收件地址或域名片段，不是你自己的发件邮箱；不影响收信。"},
    "unlimitedHelp": {"en":"These local sender mailboxes bypass their individual sending balance. They still obey the site-wide daily/monthly limits and blocked destination rules.","zh":"这些本地发件邮箱不检查各自的发信余额；仍受全站日/月发信总限额和发信收件地址黑名单限制。"},
    "dailyLimitHelp": {"en":"Site-wide total sends per UTC day, shared by all sender mailboxes. -1 means unlimited; disabling skips the daily check.","zh":"全站所有发件邮箱共用的每日发信总数，按 UTC 日期重置；-1 表示不限，关闭则不检查日限额。"},
    "monthlyLimitHelp": {"en":"Site-wide total sends per UTC month, shared by all sender mailboxes. -1 means unlimited; both daily and monthly limits apply.","zh":"全站所有发件邮箱共用的每月发信总数，按 UTC 月份重置；-1 表示不限，日/月限额同时生效。"},
    "address_block_list": {
      "en": "Address Block Keywords for Users(Admin can skip)",
      "zh": "邮件地址屏蔽关键词(管理员可跳过检查)"
    },
    "address_block_list_placeholder": {
      "en": "Please enter the keywords you want to block",
      "zh": "请输入您想要屏蔽的关键词"
    },
    "block_receive_unknow_address_email": {
      "en": "Block receive unknow address email",
      "zh": "禁止接收未知地址邮件"
    },
    "create_address_subdomain_match": {
      "en": "Allow Subdomain Suffix Match When Creating Address",
      "zh": "创建邮箱时允许子域名后缀匹配"
    },
    "create_address_subdomain_match_env_locked": {
      "en": "This feature is currently disabled in the server configuration. The admin switch can still be saved, but it will not take effect until enabled in the server configuration.",
      "zh": "当前服务器配置中该功能为关闭状态。后台开关仍可保存，但在服务器配置中打开前不会生效。"
    },
    "create_address_subdomain_match_follow_env": {
      "en": "Follow Server Configuration",
      "zh": "跟随服务器配置"
    },
    "create_address_subdomain_match_follow_env_note": {
      "en": "Choosing \"Follow Server Configuration\" clears the admin override and returns to the unset state. The effective result is still controlled by the server configuration and the precedence rules.",
      "zh": "选择“跟随服务器配置”会清空后台覆盖，恢复为未设置状态；最终是否开启仍由服务器配置和优先级规则决定。"
    },
    "create_address_subdomain_match_force_disable": {
      "en": "Force Disable",
      "zh": "强制关闭"
    },
    "create_address_subdomain_match_force_enable": {
      "en": "Force Enable",
      "zh": "强制开启"
    },
    "create_address_subdomain_match_note": {
      "en": "The random subdomain setting already allows random or manual subdomains for listed base domains. This switch additionally allows API callers to specify subdomains under other allowed base domains.",
      "zh": "随机子域名设置已允许在所列基础域名下随机生成或手动输入子域名；此开关额外允许 API 在其他已授权基础域名下指定子域名。"
    },
    "create_address_subdomain_match_tip": {
      "en": "Only affects domain validation when creating addresses. Example: when enabled, foo.example.com can match configured base domain example.com.",
      "zh": "仅影响新建邮箱时的域名校验。例如开启后，foo.example.com 可以匹配已配置的基础域名 example.com。"
    },
    "fromBlockList": {
      "en": "All mailboxes: block sender text",
      "zh": "所有邮箱：屏蔽发件人"
    },
    "blockedMailboxList": {
      "en": "Stop all new mail to a mailbox",
      "zh": "停用邮箱：不再接收新邮件"
    },
    "mailboxDomainBlockList": {
      "en": "One mailbox: block a sender domain",
      "zh": "单个邮箱：屏蔽对方域名"
    },
    "mailboxAddress": {
      "en": "Your full recipient mailbox address",
      "zh": "自己的完整收件邮箱"
    },
    "blockedSenderDomain": {
      "en": "Their sender domain (without {'@'})",
      "zh": "对方发件域名（不带 {'@'}）"
    },
    "manualInputPrompt": {
      "en": "Type and press Enter to add",
      "zh": "输入后按回车键添加"
    },
    "noLimitSendAddressList": {
      "en": "Local mailboxes exempt from individual balance checks",
      "zh": "不检查单邮箱发信余额的邮箱"
    },
    "save": {
      "en": "Save all mailbox rules",
      "zh": "保存全部邮箱规则"
    },
    "send_address_block_list": {
      "en": "Blocked outgoing destinations (text match)",
      "zh": "禁止往这些对方地址发信（包含匹配）"
    },
    "send_mail_daily_limit": {
      "en": "Daily Limit",
      "zh": "每日额度"
    },
    "send_mail_daily_limit_invalid": {
      "en": "Daily limit must be an integer greater than or equal to -1",
      "zh": "每日额度必须是大于等于 -1 的整数"
    },
    "send_mail_limit": {
      "en": "Send Mail Limit",
      "zh": "发信额度"
    },
    "send_mail_limit_tip": {
      "en": "This applies to all send channels. Use -1 for unlimited and 0 to block sending.",
      "zh": "对全部发信渠道生效。-1 表示无限，0 表示禁止发送。"
    },
    "send_mail_limit_disabled_placeholder": {
      "en": "Not enabled",
      "zh": "未启用"
    },
    "send_mail_monthly_limit": {
      "en": "Monthly Limit",
      "zh": "每月额度"
    },
    "send_mail_monthly_limit_invalid": {
      "en": "Monthly limit must be an integer greater than or equal to -1",
      "zh": "每月额度必须是大于等于 -1 的整数"
    },
    "successTip": {
      "en": "Save Success",
      "zh": "保存成功"
    },
    "tip": {
      "en": "You can manually input the following multiple select input and enter",
      "zh": "您可以手动输入以下多选输入框, 回车增加"
    },
    "verified_address_list": {
      "en": "Verified Address List (can be used to send email)",
      "zh": "已验证地址列表(可用于发送邮件)"
    }
  },
  "views.admin.Mails": {
    "addressQueryTip": {
      "en": "Leave blank to query all addresses",
      "zh": "留空查询所有地址"
    },
    "query": {
      "en": "Query",
      "zh": "查询"
    }
  },
  "views.admin.Maintenance": {
    "addCustomSql": {
      "en": "Add Custom SQL",
      "zh": "添加自定义 SQL"
    },
    "addressCreateLabel": {
      "en": "Cleanup the address created before n days",
      "zh": "清理 n 天前创建的地址"
    },
    "autoCleanup": {
      "en": "Auto cleanup",
      "zh": "自动清理"
    },
    "autoCleanupDesc": {
      "en": "Every N minutes, go through the checked items in the Basic Cleanup tab (inbox, sendbox, addresses, etc.) and clean up what needs cleaning.",
      "zh": "每隔一段时间，把「基础清理」里勾选的项目（收件箱、发件箱、邮箱地址等）检查一遍，该删的删掉。"
    },
    "autoCleanupIntervalLabel": {
      "en": "Auto cleanup: check every N minutes",
      "zh": "自动清理：每 N 分钟检查一次"
    },
    "basicCleanup": {
      "en": "Basic Cleanup",
      "zh": "基础清理"
    },
    "cleanupNow": {
      "en": "Cleanup now",
      "zh": "立即清理"
    },
    "cleanupSuccess": {
      "en": "Cleanup success",
      "zh": "清理成功"
    },
    "cronTip": {
      "en": "Cleanup permanently deletes data. Scheduled task fields use minutes; basic cleanup thresholds use days. Save updates automatic rules; Run now immediately deletes matching data.",
      "zh": "清理会永久删除数据。定时任务按分钟设置，常规清理按天设置；保存只更新自动规则，「立即清理」会立刻删除符合条件的数据。"
    },
    "customSqlCleanup": {
      "en": "Custom SQL Cleanup",
      "zh": "自定义 SQL 清理"
    },
    "customSqlTip": {
      "en": "Add custom DELETE SQL statements for scheduled cleanup. Only single DELETE statement is allowed per entry.",
      "zh": "添加自定义 DELETE SQL 语句进行定时清理。每条记录仅允许单条 DELETE 语句。"
    },
    "deleteCustomSql": {
      "en": "Delete",
      "zh": "删除"
    },
    "emptyAddressLabel": {
      "en": "Cleanup the empty address before n days",
      "zh": "清理 n 天前空邮件的邮箱地址"
    },
    "inactiveAddressLabel": {
      "en": "Cleanup the inactive address before n days",
      "zh": "清理 n 天前的未活跃地址"
    },
    "lastRun": {
      "en": "Last run",
      "zh": "上次执行"
    },
    "mailBoxLabel": {
      "en": "Cleanup the inbox before n days",
      "zh": "清理 n 天前的收件箱"
    },
    "mailUnknowLabel": {
      "en": "Cleanup the unknow mail before n days",
      "zh": "清理 n 天前的无收件人邮件"
    },
    "neverRun": {
      "en": "Never",
      "zh": "从未执行"
    },
    "save": {
      "en": "Save",
      "zh": "保存"
    },
    "rawMailsDeleted": {
      "en": "deleted",
      "zh": "已删除"
    },
    "rawMailsDesc": {
      "en": "Every N minutes, delete mails received more than M minutes ago. These are the mails you see in the web mailbox - temporary mails are only kept for a short time anyway.",
      "zh": "每隔一段时间，把 N 分钟前收到的邮件删掉。删的是网页邮箱里能看到的那些邮件，临时邮箱的邮件本来就只保留很短时间。"
    },
    "saveSuccess": {
      "en": "Save success",
      "zh": "保存成功"
    },
    "rawMailsEnableLabel": {
      "en": "Auto delete old mails",
      "zh": "定时删除旧邮件"
    },
    "sendBoxLabel": {
      "en": "Cleanup the sendbox before n days",
      "zh": "清理 n 天前的发件箱"
    },
    "rawMailsIntervalLabel": {
      "en": "Run every N minutes",
      "zh": "每 N 分钟执行一次"
    },
    "rawMailsOlderThanLabel": {
      "en": "Delete mails received more than N minutes ago",
      "zh": "删除 N 分钟前收到的邮件"
    },
    "sqlNamePlaceholder": {
      "en": "e.g. Clean old logs",
      "zh": "例如: 清理旧日志"
    },
    "rows": {
      "en": "rows",
      "zh": "条"
    },
    "sqlPlaceholder": {
      "en": "e.g. DELETE FROM mails WHERE created_at < datetime('now', '-30 day')",
      "zh": "例如: DELETE FROM mails WHERE created_at < datetime('now', '-30 day')"
    },
    "scheduleTab": {
      "en": "Scheduled Tasks",
      "zh": "定时任务"
    },
    "scheduledTip": {
      "en": "Each task below runs automatically on its own schedule. Changes take effect right after saving, no redeploy needed.",
      "zh": "下面每个任务都会按自己设定的时间自动执行，保存后立即生效，不用重新部署。"
    },
    "minutesPlaceholder": { "en": "Enter minutes", "zh": "请输入分钟数" },
    "minutesUnit": { "en": "min", "zh": "分钟" },
    "tip": {
      "en": "Please input the days",
      "zh": "请输入天数"
    },
    "confirmTitle": {
      "en": "Confirm",
      "zh": "确认操作"
    },
    "confirmCleanup": {
      "en": "This will permanently delete the selected data and cannot be undone. Continue?",
      "zh": "将永久删除选中的数据，无法恢复，确定继续吗？"
    },
    "positiveText": {
      "en": "Confirm",
      "zh": "确定"
    },
    "negativeText": {
      "en": "Cancel",
      "zh": "取消"
    }
  },
} as const

type MessageRegistry = typeof MESSAGE_REGISTRY

export type MessageNamespace = keyof MessageRegistry
export type MessageKey<N extends MessageNamespace> = keyof MessageRegistry[N]

export const getMessageSource = <N extends MessageNamespace>(
  namespace: N,
  key: MessageKey<N>,
  locale: 'en' | 'zh',
) => {
  const entry = MESSAGE_REGISTRY[namespace]?.[key] as unknown
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return undefined
  const record = entry as Record<string, unknown>
  // 普通叶子 { en, zh }
  if (locale in record && (typeof record[locale] === 'string' || record[locale] == null)) {
    return record[locale]
  }
  // 嵌套组（如 labels: { KEY: { en, zh } }）：逐项解析 locale
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (v != null && typeof v === 'object' && !Array.isArray(v) && locale in (v as Record<string, unknown>)) {
      out[k] = (v as Record<string, unknown>)[locale]
    }
  }
  return out
}
