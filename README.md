# ATD Bingo Telegram Bot

Telegram wallet top-ups for Telebirr, CBE, and Abyssinia Bank, backed by Supabase. All bot-facing copy is in Amharic. Admin approval is the default; balance changes happen only through the database RPC.

## Requirements

- Node.js 20 or newer
- A Telegram bot token and the numeric Telegram ID of the administrator
- A Supabase project whose existing `public.users` table has `id` (UUID primary key) and numeric `balance` columns

The bot can match accounts on `username`, `phone`, or both. Set `USER_IDENTIFIER_COLUMNS` to columns that actually exist in `public.users`; the default `username,phone` skips missing columns. Account linking by a typed identifier does not prove ownership. For stronger identity checks, ask users to share their own Telegram contact and configure `phone` as an identifier; for high-assurance linking, add an application-issued one-time linking code before production use.

## Setup

1. Apply [`schema.sql`](schema.sql) to the Supabase project. Review it against your existing schema before applying. It expects `users.id` to be UUID and `users.balance` to be numeric; it does not create or alter `users`.
2. Copy `.env.example` to `.env` and set the bot token, Supabase URL and **service-role** key, administrator Telegram ID, and merchant payment details. Never expose the service-role key to the bot's users or commit `.env`.
3. Configure `USER_IDENTIFIER_COLUMNS` to match your `users` table. For example, use `phone` if that is the only supported account identifier.
4. Install and start:

   ```sh
   npm install
   npm test
   npm start
   ```

The bot uses Telegram long polling. The Express service also exposes `GET /health` for deployment health checks.

## Deposit verification

In the default `VERIFICATION_MODE=admin`, the bot parses a confirmation message or photo caption for a transaction/reference ID and ETB amount, stores a pending transaction, and sends the administrator an approval/rejection card (including receipt photos). Only the configured admin Telegram ID can use the buttons. The database unique constraint prevents a reference from being reused, and the approval RPC locks the transaction and updates the wallet balance in one database transaction.

For a photo, users must include the reference and amount in its caption. Receipt images are forwarded to the admin; Telegram file URLs are not persisted. If the admin cannot read a reference, use `/setref <request-id> <transaction-id>` and then approve it. `/pending` lists pending requests if delivery of an admin card fails.

The optional SMS forwarder endpoint is `POST /webhook/sms-forwarder`. Set `VERIFICATION_MODE=auto` and a long random `SMS_FORWARDER_TOKEN`; send the SMS text as JSON with a `message`, `text`, `body`, or `sms` field, and set `Authorization: Bearer <token>` (or `x-forwarder-token`). Auto verification requires a matching pending reference and exact amount. Configure your forwarder to call the endpoint only for incoming merchant payment confirmations, protect it with HTTPS, and test the actual SMS format before enabling it. An amount/reference match alone cannot authenticate a payment if arbitrary or outgoing SMS messages are forwarded; retain admin mode unless the source phone and forwarder are controlled.

## Deploying on Render

Create a separate Node web service for this folder alongside `bingo-sync-api`. Use `npm install` as the build command and `npm start` as the start command; add the variables from `.env.example` in Render's environment settings. Set the health check path to `/health`. Do not run multiple replicas of this polling bot with the same Telegram token. If you enable the SMS endpoint, configure the Android forwarder to use the Render HTTPS URL ending in `/webhook/sms-forwarder` and the matching bearer token.

## Operations

- Keep `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, and `SMS_FORWARDER_TOKEN` secret and rotate them if exposed.
- Restrict the administrator account and verify receipts before approving deposits.
- Monitor process logs and Supabase errors; database RPC errors leave a transaction pending rather than crediting it partially.
- Keep backups and review `schema.sql` and the assumed `users` columns against the live database before deployment.