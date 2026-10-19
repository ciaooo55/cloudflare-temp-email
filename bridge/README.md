# Cross-account email bridge

The 11 and 163 accounts run this small Email Worker. Their catch-all rules send incoming mail to it. It signs the original envelope recipient and forwards the message to `mail@ciaooo55.de5.net`. The 55 account's `cloudflaretempemail` Worker verifies the signature before storing mail under the original recipient.

Deploy with `wrangler.toml`. Set the `BRIDGE_SECRET` Worker secret on both the bridge Worker and the 55 receiver; never put its value in Git. The destination address must be verified in each forwarding account.

```sh
node --test worker.test.mjs
npx wrangler deploy
npx wrangler secret put BRIDGE_SECRET
```
