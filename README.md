# 🎱 ATD Bingo Telegram Bot

> **Production-ready, 24/7 Telegram Bot for ATD Bingo**  
> Automates wallet deposits (Telebirr, CBE, Bank of Abyssinia), distributes the ~170MB offline application directly via Telegram, delivers rich Amharic customer support, synchronizes balances with Supabase & `bingo-sync-api`, and stays awake 24/7 on Render free/starter tiers.

---

## 🌟 Key Features

1. **🇪🇹 Complete Amharic UI (አማርኛ)**:
   - Natural, polite, and user-friendly Amharic messages and interactive keyboards.
   - Persistent quick-action menu (ባላንስ መሙላት, የእኔ ባላንስ, ኦፍላይን አፕ አውርድ, የግብይት ታሪክ, እርዳታ).

2. **⚡ Automated Deposit Flow & Ethiopian Banks Support**:
   - Supports **Telebirr (ቴሌብር)**, **Commercial Bank of Ethiopia (CBE / የኢትዮጵያ ንግድ ባንክ)**, and **Bank of Abyssinia (BOA / አቢሲኒያ ባንክ)**.
   - Intelligent **Regex SMS Parser** that automatically extracts the **Transaction ID / Reference Number** and **Amount (ETB)** from pasted SMS in English or Amharic.
   - Accepts **Receipt Screenshot Photos** and immediately forwards them to the Admin with 1-click **[✅ አጽድቅ (Approve)]** and **[❌ ውድቅ አድርግ (Reject)]** inline buttons.
   - **Strict Double-Spending Protection**: Unique database constraints prevent any transaction ID from ever being claimed more than once.

3. **📲 170MB Offline App Distribution System (Dual-Mode)**:
   - Standard bot upload limit is 50MB, but Telegram supports up to **2GB** for cached files!
   - **Telegram Cached FILE_ID Mode**: The Admin uploads `ATD-Bingo-Offline.zip` (~170MB) directly to the bot once and tags it with `/setapp`. The bot caches the `file_id` in Supabase `app_settings` and directly serves the 170MB .zip file to users via `ctx.replyWithDocument(fileId)`.
   - **Fallback Direct Link**: If no file is cached yet, automatically provides an inline download link to your hosted archive (e.g. GitHub Releases, Google Drive, or S3).
   - Clear step-by-step Amharic installation guide sent with every download.

4. **🔄 Supabase Atomic RPC & Real-time Controller Sync**:
   - Atomic PostgreSQL stored procedure `approve_deposit_and_sync_balance` with row-level locking (`FOR UPDATE`) eliminates race conditions.
   - Dispatches a real-time HTTP POST webhook to `bingo-sync-api` at `/api/balance-updated` with `{ user_id, amount, new_balance, transaction_id }`.

5. **🤖 Android SMS Forwarder Webhook (`/webhook/sms-forwarder`)**:
   - Connects to Android SMS forwarder apps running on your merchant phone.
   - Incoming bank SMS messages automatically match pending user deposits and credit their wallet balance in real-time with zero manual admin clicks.

6. **⏰ 24/7 Render Keep-Alive / Anti-Sleep System**:
   - Integrated Express web server on port 3000 with a `/health` endpoint.
   - In-app **Self-Pinger** (`keepAliveService`) pings `${RENDER_EXTERNAL_URL}/health` every 10 minutes to prevent Render free/starter tiers from idling or spinning down.

---

## 📁 Project Structure

```
atd-bingo-bot/
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore configuration
├── package.json              # Dependencies and scripts
├── schema.sql                # Supabase PostgreSQL schema, tables, indices & RPCs
├── README.md                 # Complete documentation
├── test/
│   └── smsParser.test.js     # Comprehensive SMS regex parser test suite
└── src/
    ├── index.js              # Application entry point (Bot + Express + Keep-Alive)
    ├── config.js             # Environment validator & typed configuration
    ├── bot.js                # Telegraf bot configuration, commands, and routing
    ├── server.js             # Express server setup (Health + Webhooks)
    ├── routes/
    │   ├── health.js         # GET /health endpoint for Render pinger
    │   └── webhook.js        # POST /webhook/sms-forwarder endpoint
    ├── handlers/
    │   ├── start.js          # /start, account linking (Phone/Username)
    │   ├── balance.js        # "💳 የእኔ ባላንስ" & "📜 የግብይት ታሪክ"
    │   ├── deposit.js        # "💰 ባላንስ መሙላት", SMS parsing & photo receipt flow
    │   ├── download.js       # "📲 ኦፍላይን አፕ አውርድ" & /setapp admin command
    │   ├── support.js        # "📞 እርዳታ" & Amharic FAQ troubleshooting
    │   └── admin.js          # Admin inline approval & rejection actions
    ├── services/
    │   ├── supabase.js       # Supabase database client and queries
    │   ├── smsParser.js      # Robust regex parser for Telebirr, CBE & BOA
    │   ├── bingoSync.js      # Main game controller balance sync (bingo-sync-api)
    │   └── keepAlive.js      # Render 10-minute self-pinger
    ├── keyboards/
    │   └── amharicKeyboards.js # Persistent menus and inline action keyboards
    └── utils/
        ├── logger.js         # Timestamped terminal logger
        └── sessionStore.js   # In-memory user step session store with TTL
```

---

## 🛠️ Step 1: Database Setup (Supabase)

1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** -> **New query**.
3. Copy the entire contents of [`schema.sql`](./schema.sql) and paste it into the editor.
4. Click **Run**.
5. This creates:
   - `users`: Stores player profiles, balances, and linked Telegram IDs.
   - `transactions`: Stores deposit records with unique `transaction_id` constraints.
   - `app_settings`: Key-value storage for the cached 170MB offline app `file_id`.
   - `approve_deposit_and_sync_balance`: Atomic PostgreSQL RPC function for safe balance updates.
   - `reject_deposit`: RPC function to handle deposit rejections.
   - `link_telegram_account`: Safe RPC to link Telegram accounts by username or phone.

---

## ⚙️ Step 2: Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your configuration variables in `.env`:

```ini
# ================================================================
# TELEGRAM BOT CREDENTIALS
# ================================================================
TELEGRAM_BOT_TOKEN=7123456789:AAEjK...YourTokenFromBotFather...
ADMIN_TELEGRAM_ID=123456789       # Your Telegram numeric user ID (from @userinfobot)

# ================================================================
# SUPABASE DATABASE
# ================================================================
SUPABASE_URL=https://your-project.supabase.co
# Use the SERVICE_ROLE_KEY (secret) for server-side balance updates
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ================================================================
# PAYMENT ACCOUNTS (ETHIOPIA)
# ================================================================
TELEBIRR_NUMBER=0969920066
TELEBIRR_NAME=ATD Bingo
CBE_ACCOUNT=1000123456789
CBE_NAME=ATD BINGO ENTERTAINMENT
BOA_ACCOUNT=87654321
BOA_NAME=ATD BINGO ENTERTAINMENT

# ================================================================
# VERIFICATION & CONTROLLER SYNC
# ================================================================
VERIFICATION_MODE=ADMIN            # ADMIN (manual approval) or AUTO (automatic)
SMS_WEBHOOK_SECRET=your_sms_secret_key_here
BINGO_SYNC_API_URL=https://bingo-sync-api.onrender.com

# ================================================================
# OFFLINE APP (~170MB .ZIP) DISTRIBUTION
# ================================================================
OFFLINE_APP_FILE_ID=              # Automatically set via /setapp in Telegram
OFFLINE_APP_DOWNLOAD_URL=https://github.com/your-org/atd-bingo-offline/releases/latest/download/ATD-Bingo-Offline.zip
OFFLINE_APP_VERSION=v2.4.0

# ================================================================
# CUSTOMER SUPPORT
# ================================================================
SUPPORT_PHONE=0969920066
SUPPORT_TELEGRAM_USERNAME=atd_bingo_support

# ================================================================
# RENDER 24/7 KEEP-ALIVE
# ================================================================
PORT=3000
RENDER_EXTERNAL_URL=https://atd-bingo-bot.onrender.com
```

---

## 📦 Step 3: Uploading the ~170MB Offline App via Telegram (`/setapp`)

Telegram Bot API has a strict 50MB limit when bots upload files from a server via HTTP, but Telegram servers support documents up to **2 GB** when sent by a user and referenced by **`file_id`**.

Here is how you register your 170MB offline app once:

1. **Package your Offline Application**:
   - Compress your ATD Bingo offline app files into a `.zip` archive named `ATD-Bingo-Offline.zip` (~147MB - 170MB).
2. **Send to the Bot**:
   - Open Telegram Desktop or Mobile and open your bot's chat.
   - Send the `ATD-Bingo-Offline.zip` document directly to the bot.
   - In the caption, write:
     ```
     /setapp v2.4.0
     ```
   - *(Or send the file first, then right-click and **Reply** to it with `/setapp v2.4.0`)*.
3. **Automatic Registration**:
   - The bot verifies that you are `ADMIN_TELEGRAM_ID`.
   - It captures the Telegram `file_id`, file size, and version, and automatically updates the `app_settings` table in Supabase.
   - From that moment forward, whenever any user taps **📲 ኦፍላይን አፕ አውርድ**, Telegram instantly serves the full 170MB file directly to them with zero bandwidth cost to your server!

---

## 🚀 Step 4: Running Locally

Install dependencies:
```bash
npm install
```

Run tests to verify the SMS Parser:
```bash
npm test
```

Start the bot in development mode:
```bash
npm run dev
```

Or run in production:
```bash
npm start
```

---

## ☁️ Step 5: Deploying on Render (with 24/7 Anti-Sleep)

Because Render free/starter tiers go to sleep after 15 minutes of inactivity, this project includes a built-in **Self-Pinger** that calls `/health` every 10 minutes to keep your bot alive 24/7.

1. **Push your code to GitHub / GitLab**.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Web Service**.
3. Connect your repository.
4. Set the following settings:
   - **Name**: `atd-bingo-bot`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free` or `Starter`
5. Click **Advanced** -> **Add Environment Variable** and paste all variables from your `.env` file.
   - **Important**: Set `RENDER_EXTERNAL_URL` to your Render app URL:
     `https://atd-bingo-bot.onrender.com`
6. Click **Deploy Web Service**.
7. Once deployed:
   - Your bot will start polling Telegram immediately.
   - The Express server starts on port `3000` (or `$PORT`).
   - The Keep-Alive service begins pinging `https://atd-bingo-bot.onrender.com/health` every 10 minutes, keeping your service awake 24/7!

---

## 📱 Step 6: Android SMS Forwarder Setup (Optional Automation)

To auto-approve deposits without any manual admin intervention:

1. Install an SMS Forwarder app (e.g. **SMS Forwarder** by antony-jr, or **Sms2Webhook**) on the Android phone receiving Telebirr/CBE SMS messages.
2. In the app settings, add a new forwarder rule:
   - **Trigger**: Incoming SMS from `telebirr`, `127`, `CBE`, or `Bank of Abyssinia`.
   - **Target**: `POST Webhook / HTTP URL`
   - **URL**: `https://atd-bingo-bot.onrender.com/webhook/sms-forwarder`
   - **Headers**:
     `x-sms-secret: <YOUR_SMS_WEBHOOK_SECRET>`
   - **Payload format**: JSON (`{ "text": "{sms_body}", "from": "{sms_sender}" }`)
3. When an SMS arrives:
   - The forwarder posts the SMS to your bot's `/webhook/sms-forwarder`.
   - The bot parses the Transaction ID and Amount.
   - If a matching pending deposit from a player exists, it auto-approves the transaction, updates their Supabase balance via the atomic RPC, dispatches the webhook to `bingo-sync-api`, and notifies the player on Telegram!

---

## 🔒 Security Best Practices

- **Atomic DB Updates**: All balance modifications go through PostgreSQL RPC `approve_deposit_and_sync_balance` with row-level locks (`FOR UPDATE`), making double-spends and race conditions impossible.
- **Service Role Key**: Stored securely on the server (`.env`) and never exposed to the client.
- **Admin Verification**: Only the numeric `ADMIN_TELEGRAM_ID` can approve/reject deposits or invoke `/setapp`.
- **Webhook Authentication**: Protected with the `SMS_WEBHOOK_SECRET` header.

---

## 📞 Customer Support & FAQ

- **Phone**: `0969920066` / `0962025699`
- **Telegram Support**: [@atd_bingo_support](https://t.me/atd_bingo_support)
- **Built for**: ATD Bingo Ethiopia 🇪🇹
