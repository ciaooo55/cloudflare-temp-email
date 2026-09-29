# Configure Telegram Bot

Try it here: [@cf_temp_mail_bot](https://t.me/cf_temp_mail_bot)

::: warning Note
The default `worker.dev` domain certificate for worker is not supported by Telegram. Please use a custom domain when configuring Telegram Bot.
:::

> [!NOTE]
> If you want to use Telegram Bot, please bind `KV` first
>
> If you don't need Telegram Bot, you can skip this step
>
> If you want Telegram to have stronger email parsing capabilities, refer to [Configure worker to use wasm for email parsing](/en/guide/feature/mail_parser_wasm_worker)

## Telegram Bot Configuration

Please first create a Telegram Bot, obtain the `token`, then execute the following command to add the `token` to secrets

> [!NOTE]
> If you find it troublesome, you can also put it in plain text under `[vars]` in `wrangler.toml`, but this is not recommended

If you deployed via UI, you can add it under `Variables and Secrets` in the Cloudflare UI interface

```bash
# Switch to worker directory
cd worker
pnpm wrangler secret put TELEGRAM_BOT_TOKEN
```

## Bot

- Can set whitelist users
- Click `Initialize` to complete the configuration.
- Click `View Status` to check the current configuration status.

![telegram](/feature/telegram.png)

## Language Switching

> [!NOTE]
> This feature is available since v1.2.0

Telegram Bot supports Chinese and English switching. Users can set their language preference via the `/lang` command.

### Enable Language Switching

You need to configure `TG_ALLOW_USER_LANG = true` in worker variables to enable this feature.

### Usage

- `/lang zh` - Switch to Chinese
- `/lang en` - Switch to English
- `/lang` - View current language setting

Language preferences are saved to KV, and each user can set their preference independently.

## Per-User Mail Push

Telegram Bot supports **per-user push notifications**. After a user binds an address, emails received at that address are automatically pushed to the corresponding user.

### User Workflow

1. Find your deployed Bot in Telegram
2. Use `/new [name@domain]` to create a new address, or `/bind <credential>` to bind an existing address
3. Once bound, you will **automatically receive push notifications** when the address receives mail
4. Use `/address` to view your bound addresses
5. Use `/unbind <address>` to unbind an address

> [!TIP]
> Each user can bind up to `TG_MAX_ADDRESS` (default 5) addresses

### Global Push

Admins can enable **global mail push** in the admin panel under `Settings` -> `Telegram`, pushing all emails to a specified list of Telegram user IDs.

- `enableGlobalMailPush`: Enable global push
- `globalMailPushList`: List of Telegram user IDs to receive global push

> [!NOTE]
> Global push and per-user push can work simultaneously. If an address is bound to a user who is also in the global push list, they will receive two notifications.

### Attachment Push

> [!NOTE]
> This feature is available since v1.5.0

Set `ENABLE_TG_PUSH_ATTACHMENT = true` to enable sending email attachments via Telegram push.

- Single file size limit is 50MB (Telegram Bot API limit), oversized attachments are skipped
- Multiple attachments are sent in batches via `sendMediaGroup`, up to 6 per batch
- The first attachment includes the sender and subject as caption

## Managing Multiple Telegram Bots in the Admin Console

> [!NOTE]
> This feature requires a KV binding

The Admin console **Telegram** page lets you add multiple bots directly without touching environment variables:

- Add: enter a bot token; saved bots can be enabled / disabled / deleted from the table
- Test: validate the token via `getMe`, or send a test message to a specific chat id
- Webhook: set an independent webhook (`/telegram/webhook/:botId`) for each web-added bot, separate from env-configured bots
- Web-added bots are merged with environment variables (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN_2`, etc.) and pushed together, with tokens deduplicated

## Bark Push

> [!NOTE]
> This feature requires a KV binding

Bark and Telegram are **peer concurrent pushes**: sent in parallel via `Promise.allSettled`, never blocking each other, **one failing does not affect the other**. The mail snapshot is still created once and shared by both.

The Admin console **Bark** page lets you configure multiple Bark devices:

- Each device has a key and can be enabled / disabled / deleted individually
- The push server URL is configurable (default `https://api.day.app`), self-hosted bark-server supported
- Test: send a test notification to a single device or to all devices
- Environment variable `BARK_DEVICE_KEYS` (comma separated) still works; web settings and env config are merged and deduplicated

## Mail Snapshots

> [!NOTE]
> This feature requires a KV binding

### Auto-delete of regular snapshots

Regular mail snapshots (`/m/:token`) created during pushes are deleted automatically after 24 hours by default. The auto-delete duration can be changed in the Admin console **Snapshot** page.

### Pinned snapshot bindings

You can bind a **fixed snapshot URL** to a mailbox address:

- Once bound, new mail to that address **overwrites** the snapshot content while the URL stays the same; refresh to see the latest mail
- Bind, update, set an expiration, or invalidate / destroy early from the web page
- The link expires and the binding is removed automatically on expiry
- Re-binding the same address invalidates the old snapshot URL immediately
- Pinned snapshots live for the binding duration only and are not affected by the regular snapshot auto-delete duration

## Mini App

Can be deployed via command line or UI interface

### UI Deployment

For other steps, refer to `Frontend and Backend Separation Deployment` in [UI Deployment](/en/guide/cli/pages)

> [!NOTE]
> Download the zip from here, [telegram-frontend.zip](https://github.com/dreamhunter2333/cloudflare_temp_email/releases/latest/download/telegram-frontend.zip)
>
> Modify the index-xxx.js file in the zip, where xx is a random string
>
> Search for `https://temp-email-api.xxx.xxx`, replace it with your worker domain, then deploy the new zip file

### Command Line Deployment

```bash
cd frontend
pnpm install
cp .env.example .env.prod
# Edit .env.prod and set VITE_IS_TELEGRAM=true
# --project-name can create a separate pages for mini app, you can also share one pages, but may encounter js loading issues
pnpm run deploy:telegram --project-name=<your_project_name>
```

> [!WARNING]
> Windows users: The inline `VITE_IS_TELEGRAM=true` environment variable in npm scripts does not work on Windows.
> Please set `VITE_IS_TELEGRAM=true` in your `.env.prod` file manually, then use the regular build command instead:
> ```bash
> pnpm run build
> ```

- After deployment, please fill in the web URL in the `Settings` -> `Telegram Mini App` page `Telegram Mini App URL` in the admin backend.
- Please execute `/setmenubutton` in `@BotFather`, then enter your web address to set the `Open App` button in the lower left corner.
- Please execute `/newapp` in `@BotFather` to create a new app and register the mini app.
