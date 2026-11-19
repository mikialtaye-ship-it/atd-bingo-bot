# ATD Bingo Bot 🎱

Production-ready Telegram Bot (`@atd_bingo_bot`) with **two fully separated modes** inside one bot:
- **Mode A** — Offline Shop Balance Sync & App Distribution (physical Bingo/Keno shops)
- **Mode B** — Online Gaming Hub (Bingo, Keno, Aviator) with dedicated online wallets

---

## 📁 Project Structure

```
atd-bingo-bot/
├── src/
│   ├── index.js                  # Main entry: Express + Telegraf + cron
│   ├── config/
│   │   └── env.js                # Centralized env loader & validator
│   ├── services/
│   │   ├── supabase.js           # Supabase client & all DB operations
│   │   ├── syncApi.js            # ATD Control Dashboard HTTP client (3 retries)
│   │   └── webhook.js            # Express REST routes (health, SMS, game API)
│   ├── utils/
│   │   ├── smsParser.js          # Telebirr / CBE / Abyssinia SMS regex parser
│   │   └── keyboards.js          # 100% Amharic keyboards & inline buttons
│   └── handlers/
│       ├── start.js              # /start, contact linking, shop registration
│       ├── deposit.js            # 5-step deposit flow (Offline + Online)
│       ├── onlineGames.js        # Online game launcher hub
│       ├── offlineApp.js         # Offline .zip distribution
│       └── support.js            # Balance, history, help, Amharic FAQs
├── schema.sql                    # Supabase PostgreSQL schema + atomic RPCs
├── .env.example                  # All environment variable templates
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Setup

### 1. Clone & Install
```bash
git clone https://github.com/your-org/atd-bingo-bot.git
cd atd-bingo-bot
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your real credentials
```

### 3. Run Supabase Schema
1. Open your Supabase project → **SQL Editor**
2. Paste the entire contents of `schema.sql`
3. Click **Run**

The schema creates: `shops`, `telegram_links`, `online_wallets`, `transactions`, `app_settings` + two atomic RPC functions.

### 4. Start the Bot (Local)
```bash
npm start
```

### 5. Deploy to Render
1. Push repo to GitHub (`.env` is in `.gitignore` ✅)
2. Create a new **Web Service** on [render.com](https://render.com)
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Add all variables from `.env.example` as **Environment Variables** in Render
6. Set `RENDER_EXTERNAL_URL` to your Render URL (e.g. `https://atd-bingo-bot.onrender.com`)
7. The bot auto-pings `/health` every 10 minutes to stay alive

---

## 🎮 Plugging In Online Games (Mode B)

Each game is a **separate GitHub/Render web app** that uses this bot's REST API to read/write `online_wallets.balance`.

### Wallet REST API

| Method | Endpoint | Auth Header | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/online-user/:telegram_id` | `Authorization: Bearer ONLINE_GAME_API_SECRET` | Get wallet balance |
| `POST` | `/api/online-user/bet-result` | `Authorization: Bearer ONLINE_GAME_API_SECRET` | Debit (bet) or credit (win) |

### POST `/api/online-user/bet-result` Body
```json
{
  "telegram_id": 123456789,
  "amount": -500,
  "description": "Bingo round #42 — loss"
}
```
- **Positive** `amount` → credit (player won)
- **Negative** `amount` → debit (player bet/lost)

### Steps to Add a Game
1. Build & deploy your web game to Render/GitHub Pages
2. Set the URL in `.env`: `ONLINE_BINGO_URL=https://your-game.onrender.com`
3. Use `Authorization: Bearer YOUR_ONLINE_GAME_API_SECRET` on all wallet API calls
4. The bot auto-appends `?tg_id=TELEGRAM_USER_ID` to the WebApp URL

---

## 📱 SMS Forwarder Webhook

Install **SMS Forwarder** (Android) and configure:
```
URL:    POST https://your-bot.onrender.com/webhook/sms-forwarder
Header: X-Webhook-Secret: YOUR_SMS_WEBHOOK_SECRET
Body:   { "from": "+251...", "text": "SMS body" }
```
Parsed results are forwarded to `ADMIN_TELEGRAM_ID` automatically.

---

## 🔑 Admin Commands

| Command / Button | Description |
|-----------------|-------------|
| `/setapp` | Reply to a `.zip` file → sets offline app file_id in DB |
| ✅ Approve (Offline) | Runs `approve_offline_deposit_and_sync` RPC → pushes to `bingo-sync-api.onrender.com` |
| ✅ Approve (Online) | Runs `approve_online_deposit` RPC → credits `online_wallets.balance` |
| ✅ Approve Shop | Activates shop registration (status → ACTIVE) |
| ❌ Reject | Rejects deposit or shop, notifies user in Amharic |

---

## 🏪 Mode A: Offline Shop Sync Flow

1. User clicks **💰 ባላንስ መሙላት** → selects **🏪 ለኦፍላይን ቤት**
2. Bot verifies `shop_id` + `username` against `shops` table (status = `ACTIVE`)
3. User enters deposit amount → sees payment accounts (Telebirr / CBE / Abyssinia)
4. User pastes SMS or sends screenshot
5. SMS parser extracts `transaction_id` + `amount`; duplicate check runs
6. Admin gets forwarded proof + **✅ Approve / ❌ Reject** inline buttons
7. On approval: RPC runs → `bingo-sync-api.onrender.com` gets `{ shop_id, username, amount, ref_id, status: "READY_TO_SYNC" }` with up to **3 auto-retries**
8. User gets Amharic notification with **Wi-Fi + "Sync Balance"** instructions

---

## 📞 Support
- Phone: **0962025699** / **0969920066**  
- Telegram: `@atd_support`
