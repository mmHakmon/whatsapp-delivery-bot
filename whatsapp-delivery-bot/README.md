# 🚚 מערכת ניהול משלוחים עם WhatsApp Bot

מערכת מלאה לניהול משלוחים עם בוט WhatsApp אוטומטי שמאפשר לשליחים לקחת משלוחים ולעדכן סטטוסים ישירות מהוואטסאפ.

## ✨ תכונות עיקריות

### 📱 בוט WhatsApp
- פרסום אוטומטי של משלוחים לקבוצת השליחים
- כפתורים אינטראקטיביים - "אני לוקח", "נאסף", "נמסר"
- הראשון שלוחץ מקבל את המשלוח (מנגנון נעילה)
- שליחת פרטים מלאים בפרטי לשליח שלקח
- סיכום יומי אוטומטי לכל שליח
- ביטול אוטומטי של משלוחים שלא נלקחו

### 🖥️ פאנל ניהול
- דשבורד בזמן אמת עם גרפים וסטטיסטיקות
- ניהול משלוחים - יצירה, עריכה, פרסום, ביטול
- ניהול שליחים - פרופילים, דירוגים, היסטוריה
- מערכת תשלומים - חישוב אוטומטי, אישור, סימון כשולם
- הגדרות מערכת - תעריפים, שעות פעילות, WhatsApp API

## 🚀 התקנה מהירה

```bash
# 1. Clone
git clone <repo>
cd whatsapp-delivery-bot

# 2. Backend
cd backend && npm install
cp .env.example .env  # ערוך עם הפרטים שלך

# 3. Database
createdb delivery_bot
psql delivery_bot < ../database/schema.sql

# 4. Frontend
cd ../frontend && npm install

# 5. Run
cd ../backend && npm run dev  # Terminal 1
cd ../frontend && npm run dev  # Terminal 2
```

## 📱 הגדרת WhatsApp API

1. צור חשבון Meta Business
2. צור אפליקציית WhatsApp Business
3. העתק Phone Number ID, Business Account ID, Access Token
4. הגדר Webhook: `https://your-domain.com/webhook`

## 📄 מבנה הפרויקט

```
whatsapp-delivery-bot/
├── backend/              # Node.js API Server
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── middlewares/  # Auth, error handling
│   │   └── config/       # Database config
│   └── package.json
├── frontend/             # React Admin Panel
│   ├── src/
│   │   ├── pages/        # Login, Dashboard, etc.
│   │   ├── components/   # Layout, shared components
│   │   ├── hooks/        # Auth store, custom hooks
│   │   └── utils/        # API client, helpers
│   └── package.json
├── database/
│   └── schema.sql        # PostgreSQL schema
└── README.md
```

## 🔑 Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/delivery_bot
JWT_SECRET=your-secret-key
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_BUSINESS_ACCOUNT_ID=xxx
WHATSAPP_ACCESS_TOKEN=xxx
WHATSAPP_VERIFY_TOKEN=xxx
WHATSAPP_COURIERS_GROUP_ID=xxx
```

## 📄 רישיון

MIT
