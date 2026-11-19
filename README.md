# ATD Bingo Bot 🎮

A production-ready Telegram bot combining two modes in one unified application:
- **Mode A — Offline Shop Sync**: For physical Bingo/Keno shop owners using the ATD Bingo desktop/mobile offline app, syncing approved deposits to `bingo-sync-api.onrender.com` and Supabase.
- **Mode B — Online Gaming Hub**: Online player wallet & Telegram Mini App launcher for Bingo, Keno, and Aviator games.

## 📁 Project Structure

```
atd-bingo-bot/
├── bot.js          # Complete bot + Express server (single entry point)
├── package.json    # Node.js project config
├── schema.sql      # Supabase PostgreSQL schema + RPC functions
├── .env.example    # All environment variable templates
├── .gitignore      # Git ignore rules
└── README.md       # This file
```

> [!IMPORTANT]
> This is a flat architecture — everything lives in the root folder. No `src/` or nested directories.

## 🛠️ Prerequisites

- **Node.js** ≥ 18.0.0
- **npm** (comes with Node.js)
- **Telegram Bot Token** — create via [@BotFather](https://t.me/BotFather)
- **Supabase account** — [app.supabase.com](https://app.supabase.com) (free tier works)
- **Render.com account** — [render.com](https://render.com) (free tier works)

## 🚀 Quick Start (Local Development)

### 1. Clone or copy the project files

```bash
git clone https://github.com/your-org/atd-bingo-bot.git
cd atd-bingo-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in all required values (see [Environment Variables](#environment-variables) section).

### 4. Set up Supabase

See the [Supabase Setup](#supabase-setup) section below.

### 5. Start the bot

```bash
npm start
```

You should see:
```
Express server running on port 3000
🤖 ATD Bingo Bot started!
```

## 🗄️ Supabase Setup

1. Go to [app.supabase.com](https://app.supabase.com) and create a new project
2. Navigate to **SQL Editor** → **New Query**
3. Copy the entire contents of `schema.sql` and paste into the editor
4. Click **Run** — all tables, indexes, triggers, RPC functions, and RLS policies will be created
5. Navigate to **Project Settings** → **API**:
   - Copy **Project URL** → set as `SUPABASE_URL` in `.env`
   - Copy **service_role** key (secret) → set as `SUPABASE_SERVICE_ROLE_KEY` in `.env`

### Tables Created

| Table | Purpose |
|-------|---------|
| `shops` | ATD Bingo offline shop/center registry |
| `telegram_links` | Links Telegram users to their offline shop |
| `online_wallets` | Online gaming balance per Telegram user |
| `transactions` | Central ledger for all deposits & game events |
| `app_settings` | Key-value store (e.g., offline app `file_id`) |

### RPC Functions

| Function | Description |
|----------|-------------|
| `approve_offline_deposit_and_sync(p_transaction_id)` | Marks offline deposit as SYNCED (balance goes via bingo-sync-api) |
| `approve_online_deposit(p_transaction_id)` | Marks online deposit APPROVED + credits online_wallets balance |

## ☁️ Render.com Deployment

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-org/atd-bingo-bot.git
git push -u origin main
```

> [!CAUTION]
> Never commit `.env` to GitHub. It's already in `.gitignore`. Only `.env.example` should be in the repo.

### Step 2: Create Render Web Service

1. Log in to [render.com](https://render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `atd-bingo-bot`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or Starter for always-on)

### Step 3: Set Environment Variables

In Render's **Environment** tab, add all variables from `.env.example`:

| Key | Value |
|-----|-------|
| `BOT_TOKEN` | Your Telegram bot token |
| `ADMIN_TELEGRAM_ID` | Your Telegram user ID |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key |
| `SYNC_API_URL` | `https://bingo-sync-api.onrender.com` |
| `SYNC_API_SECRET` | Your sync API secret |
| `TELEBIRR_NUMBER` | Telebirr account number |
| `TELEBIRR_NAME` | Telebirr account name |
| `CBE_ACCOUNT` | CBE bank account number |
| `CBE_NAME` | CBE account holder name |
| `BOA_ACCOUNT` | Abyssinia Bank account number |
| `BOA_NAME` | Abyssinia Bank account holder name |
| `SUPPORT_PHONE` | `0962025699 / 0969920066` |
| `SUPPORT_TELEGRAM_USERNAME` | Support Telegram username |
| `ONLINE_GAME_API_SECRET` | Random secret for game APIs |
| `SMS_WEBHOOK_SECRET` | Random secret for SMS webhook |
| `RENDER_EXTERNAL_URL` | Your Render app URL (e.g., `https://atd-bingo-bot.onrender.com`) |

### Step 4: Deploy

Click **Create Web Service**. Render will build and deploy automatically.

> [!TIP]
> The bot includes a node-cron job that pings `/health` every 10 minutes to keep the Render free tier service alive (free tier sleeps after 15 minutes of inactivity).

## 🤖 Bot Commands

| Command | Who | Description |
|---------|-----|-------------|
| `/start` | Everyone | Show main menu, create online wallet |
| `/setapp` | Admin only | Reply to a .zip file to set the offline app for distribution |

## 📱 Main Menu (Amharic UI)

```
🎮 ኦንላይን ጨዋታዎች    💰 ባላንስ መሙላት
💳 የእኔ ባላንስ         📲 ኦፍላይን አፕ አውርድ
📝 አዲስ ቤት መመዝገብ   📜 የግብይት ታሪክ
📞 እርዳታ
```

## 🏪 Mode A: Offline Shop Deposit & Sync Flow

> [!WARNING]
> The offline application runs without internet during gameplay, but **MUST be connected to Wi-Fi/Internet** at the exact moment the user clicks **"Sync Balance"** inside the ATD Bingo application to pull the approved balance from the server.

### Full User Journey

```
User: 💰 ባላንስ መሙላት → 🏪 ለኦፍላይን ቤት
         ↓
Bot: Confirm Shop ID (SHOP-XXXXXXXX) + Username
         ↓
User: Enters amount in ETB (e.g., 20000)
         ↓
Bot: Shows payment accounts (Telebirr, CBE, BOA)
         ↓
User: Pastes bank SMS text OR uploads receipt screenshot
         ↓
Bot: Parses transaction ref, checks duplicates
     → Forwards request to Admin with [✅ Approve] [❌ Reject]
         ↓
Admin: Clicks [✅ አጽድቅና Sync አድርግ]
         ↓
Bot: Runs Supabase RPC approve_offline_deposit_and_sync
     → HTTP POST to bingo-sync-api.onrender.com/api/transfers
     → Retries up to 3 times on failure
         ↓
User receives: "✅ ክፍያዎ ተረጋግጧል! [Amount] ብር ወደ [username] ተልኳል።"
              "⚠️ ዋይፋይ ያገናኙ → ATD Bingo ያክፈቱ → Sync Balance ይንኩ"
```

### Sync API Payload

```json
POST https://bingo-sync-api.onrender.com/api/transfers
Authorization: Bearer YOUR_SYNC_API_SECRET
Content-Type: application/json

{
  "shop_id": "SHOP-BF24C9E7",
  "username": "adis",
  "amount": 20000,
  "ref_id": "FT2411190001",
  "status": "READY_TO_SYNC"
}
```

## 🎮 Mode B: Online Gaming Hub

Online wallet is created automatically when any user sends `/start`.

### Deposit Flow

```
User: 💰 ባላንስ መሙላት → 🎮 ለኦንላይን ጨዋታ
         ↓
User: Enters amount
         ↓
User: Submits payment proof
         ↓
Admin: Approves → Supabase RPC approve_online_deposit credits balance
         ↓
User: Balance updated in online_wallets table
```

### Game Launcher

Games are launched as Telegram WebApps (Mini Apps). To enable a game:

1. Deploy the game to GitHub/Render
2. Set its URL in `.env`:
   ```
   ONLINE_BINGO_URL=https://your-bingo-game.onrender.com
   ```
3. Restart the bot — the WebApp button is **automatically enabled**

Until the URL is set, users see a friendly "🚧 Coming Soon" message.

## 🔌 REST API (for Game Web Apps)

### Authentication

All game API endpoints require:
```
Authorization: Bearer YOUR_ONLINE_GAME_API_SECRET
```

### Endpoints

#### `GET /health`
No authentication required.
```json
{
  "status": "ok",
  "timestamp": "2026-11-19T12:00:00.000Z",
  "service": "ATD Bingo Bot"
}
```

#### `GET /api/online-user/:telegram_id`
Returns the player's current balance.
```json
{
  "telegram_id": 123456789,
  "balance": 500.00
}
```

#### `POST /api/online-user/bet-result`
Updates the player's balance after a game event.

**Request body:**
```json
{
  "telegram_id": 123456789,
  "delta": -100,
  "game": "BINGO",
  "ref_id": "optional-game-round-id"
}
```
- Negative `delta` = bet placed (money deducted)
- Positive `delta` = win credited

**Response:**
```json
{
  "success": true,
  "new_balance": 400.00
}
```

#### `POST /webhook/sms-forwarder`
Receives SMS notifications and forwards to admin.

**Headers:** `x-sms-webhook-secret: YOUR_SMS_WEBHOOK_SECRET`

**Request body:**
```json
{
  "from": "+2519XXXXXXXX",
  "body": "Your Telebirr transaction of 500 ETB to 09XXXXXXXX was successful. Ref: ET241119001",
  "timestamp": "2026-11-19T12:00:00Z"
}
```

## 📝 Shop Registration Flow

```
User: 📝 አዲስ ቤት መመዝገብ
         ↓
Bot collects (one step at a time):
  1. Center Name (ማዕከሉ ስም)
  2. Username (ለ ATD ሲስተም)
  3. Phone Number (ስልክ ቁጥር)
  4. Region / Address (ክልል/አድራሻ)
  5. PC MAC Address (ኮምፒውተር MAC)
         ↓
Admin receives registration with [✅ አጽድቅና SHOP-ID ስጥ]
         ↓
Admin approves → Bot auto-generates SHOP-XXXXXXXX
                → Links to user's Telegram account
                → Notifies user with their new Shop ID
```

## 📲 Offline App Distribution

### Method 1: Via `/setapp` (Recommended)
1. Admin sends the `.zip` file in the bot chat
2. Admin replies to that message with `/setapp`
3. Bot caches the Telegram `file_id` in `app_settings` table
4. Users who tap **📲 ኦፍላይን አፕ አውርድ** receive the file directly (fast, no external hosting needed)

### Method 2: Via Download URL (Fallback)
Set `OFFLINE_APP_DOWNLOAD_URL` in `.env` with a direct link to the `.zip` file.

## 🌐 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `ADMIN_TELEGRAM_ID` | ✅ | Your Telegram user ID (get from @userinfobot) |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role secret key |
| `SYNC_API_URL` | ✅ | ATD sync server URL (`https://bingo-sync-api.onrender.com`) |
| `SYNC_API_SECRET` | ✅ | Bearer token for sync API |
| `TELEBIRR_NUMBER` | ✅ | Telebirr account number for deposits |
| `TELEBIRR_NAME` | ✅ | Telebirr account holder name |
| `CBE_ACCOUNT` | ✅ | CBE bank account number |
| `CBE_NAME` | ✅ | CBE account holder name |
| `BOA_ACCOUNT` | ✅ | Abyssinia Bank account number |
| `BOA_NAME` | ✅ | Abyssinia Bank account holder name |
| `SUPPORT_PHONE` | ✅ | Support phone numbers |
| `SUPPORT_TELEGRAM_USERNAME` | ✅ | Support Telegram username (without @) |
| `ONLINE_BINGO_URL` | Optional | Bingo game web app URL |
| `ONLINE_KENO_URL` | Optional | Keno game web app URL |
| `ONLINE_AVIATOR_URL` | Optional | Aviator game web app URL |
| `ONLINE_GAME_API_SECRET` | ✅ | Bearer token for game REST API |
| `OFFLINE_APP_FILE_ID` | Optional | Pre-set Telegram file_id for offline app |
| `OFFLINE_APP_DOWNLOAD_URL` | Optional | Fallback download URL for offline app |
| `SMS_WEBHOOK_SECRET` | ✅ | Secret for SMS forwarder webhook |
| `RENDER_EXTERNAL_URL` | ✅ | Render service URL (for keep-alive cron) |
| `PORT` | Optional | Server port (default: 3000) |

## 🔧 Troubleshooting

### Bot not responding
- Check `BOT_TOKEN` is correct
- Ensure only one bot instance is running (don't run locally while Render is also running)
- Check Render logs for errors

### Supabase errors
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
- Ensure `schema.sql` has been run successfully
- Check the service_role key has not been rotated

### Sync API failures
- The bot retries 3 times automatically
- Check `SYNC_API_URL` and `SYNC_API_SECRET` are correct
- Admin will be notified if all 3 retries fail

### Bot sleeping on Render free tier
- The keep-alive cron pings `/health` every 10 minutes
- Set `RENDER_EXTERNAL_URL` to your Render URL
- Consider upgrading to Render Starter plan for always-on service

### Offline app not distributing
- Use `/setapp` command (admin, reply to .zip file) to cache the file_id
- Alternatively set `OFFLINE_APP_DOWNLOAD_URL` in `.env`

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Telegram Users                       │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│                     bot.js (Render)                      │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │  Telegraf Bot   │    │      Express Server         │  │
│  │  (Mode A + B)   │    │  /health                    │  │
│  │                 │    │  /webhook/sms-forwarder     │  │
│  │  ┌───────────┐  │    │  /api/online-user/:id       │  │
│  │  │  State    │  │    │  /api/online-user/bet-result│  │
│  │  │  Manager  │  │    └────────────────────────────┘  │
│  │  └───────────┘  │    ┌────────────────────────────┐  │
│  └─────────────────┘    │   node-cron (keep-alive)   │  │
│                         └────────────────────────────┘  │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐    ┌─────────────────────────────┐
│    Supabase DB   │    │  bingo-sync-api.onrender.com│
│  - shops         │    │  POST /api/transfers         │
│  - telegram_links│    │  (Offline balance sync)      │
│  - online_wallets│    └─────────────────────────────┘
│  - transactions  │
│  - app_settings  │
└──────────────────┘
```

## 📄 License

UNLICENSED — Proprietary. All rights reserved by ATD Bingo.
