# M.M.H Delivery System Pro v4.0

מערכת ניהול משלוחים מקצועית עם אינטגרציית WhatsApp

## 🚀 מה חדש בגרסה 4.0

### אבטחה משופרת
- ✅ הפרדת credentials לקובץ `.env` נפרד
- ✅ JWT עם access token (15 דקות) + refresh token (7 ימים)
- ✅ Rate limiting על כל ה-endpoints
- ✅ Security headers (XSS, CSRF, Clickjacking protection)
- ✅ אימות דו-שלבי (2FA) לאדמינים
- ✅ נעילת חשבון אחרי 5 ניסיונות כושלים
- ✅ לוג אבטחה מלא

### ארכיטקטורה נקייה
- ✅ הפרדה לקבצים לוגיים (routes, middleware, utils, config)
- ✅ HTML נפרד מהשרת
- ✅ Database connection pooling עם health check
- ✅ Graceful shutdown
- ✅ Error handling מסודר

### שיפורים נוספים
- ✅ Validation לטלפון ישראלי, אימייל, ת.ז
- ✅ ניקוי קלט (XSS sanitization)
- ✅ WebSocket עם reconnect אוטומטי
- ✅ תמיכה ב-refresh token

---

## 📦 התקנה

### 1. Clone והתקנה
```bash
git clone <repo>
cd mmh-delivery-v4
npm install
```

### 2. הגדרת Environment Variables
```bash
cp .env.example .env
# ערוך את .env עם הערכים האמיתיים שלך
```

### 3. הגדרת Database
```bash
npm run db:init
npm run db:migrate
npm run db:migrate-security
```

### 4. הפעלה
```bash
# Production
npm start

# Development
npm run dev
```

---

## ⚙️ הגדרות נדרשות

### Database (PostgreSQL)
ב-Render.com:
1. צור PostgreSQL database
2. העתק את ה-Internal Database URL

### JWT Secrets
ייצר secrets חזקים:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### WhatsApp (Whapi.Cloud)
1. הירשם ל-[whapi.cloud](https://whapi.cloud)
2. חבר את ה-WhatsApp שלך
3. העתק את ה-API Token
4. מצא את ה-Group ID של קבוצת השליחים

### Google Maps (אופציונלי)
1. צור פרויקט ב-Google Cloud Console
2. הפעל Distance Matrix API
3. צור API Key

---

## 📁 מבנה הפרויקט

```
mmh-delivery-v4/
├── config/
│   ├── index.js        # הגדרות מרכזיות
│   └── database.js     # חיבור לדאטאבייס
├── middleware/
│   └── security.js     # אבטחה, auth, rate limiting
├── routes/
│   ├── auth.js         # התחברות והרשאות
│   ├── orders.js       # ניהול הזמנות
│   ├── users.js        # ניהול משתמשים
│   ├── couriers.js     # ניהול שליחים
│   ├── payments.js     # תשלומים
│   ├── reports.js      # דוחות וייצוא
│   └── admin.js        # כלי אדמין
├── utils/
│   ├── whatsapp.js     # אינטגרציית WhatsApp
│   └── maps.js         # חישוב מרחקים
├── views/
│   ├── dashboard.html  # ממשק ראשי
│   ├── take-order.html # דף תפיסת משלוח
│   ├── pickup.html     # אישור איסוף
│   ├── deliver.html    # אישור מסירה
│   └── courier-app.html# אפליקציית שליח
├── scripts/
│   ├── init-db.js      # יצירת טבלאות
│   └── migrate-*.js    # מיגרציות
├── server.js           # נקודת כניסה
├── package.json
├── .env.example        # דוגמה להגדרות
└── .gitignore
```

---

## 🔐 אבטחה

### Environment Variables
**לעולם אל תעלה את `.env` ל-Git!**

ב-Render.com הוסף את כל המשתנים דרך:
Dashboard → Environment → Environment Variables

### JWT Tokens
- Access Token: תוקף 15 דקות
- Refresh Token: תוקף 7 ימים
- מאוחסן בדאטאבייס לביטול מרחוק

### Rate Limiting
- 100 בקשות בדקה (כללי)
- 5 ניסיונות התחברות בדקה
- נעילת חשבון ל-15 דקות אחרי 5 כשלונות

---

## 📱 WhatsApp Integration

### הודעות אוטומטיות
- 📤 פרסום משלוח חדש לקבוצה
- ✅ אישור תפיסת משלוח
- 📦 פרטי איסוף לשליח
- 🏠 פרטי מסירה לשליח
- 💰 אישור מסירה והרווח
- ❌ הודעת ביטול

### Webhook
הגדר webhook ב-Whapi:
```
https://your-app.onrender.com/webhook/whapi
```

---

## 🚀 Deploy ל-Render.com

1. חבר את ה-repo ל-Render
2. הגדר:
   - Build Command: `npm install`
   - Start Command: `npm start`
3. הוסף Environment Variables
4. Deploy!

---

## 📝 API Endpoints

### Auth
- `POST /api/auth/login` - התחברות
- `POST /api/auth/refresh` - חידוש טוקן
- `POST /api/auth/logout` - התנתקות
- `GET /api/auth/me` - מידע על המשתמש

### Orders
- `GET /api/orders` - רשימת הזמנות
- `POST /api/orders` - יצירת הזמנה
- `PUT /api/orders/:id` - עדכון הזמנה
- `POST /api/orders/:id/publish` - פרסום
- `POST /api/orders/:id/cancel` - ביטול
- `DELETE /api/orders/:id` - מחיקה

### Couriers
- `GET /api/couriers` - רשימת שליחים
- `GET /api/couriers/:id` - פרטי שליח
- `PUT /api/couriers/:id` - עדכון שליח

### Payments
- `GET /api/payments` - רשימת תשלומים
- `POST /api/payments` - יצירת תשלום

### Reports
- `GET /api/reports/daily` - דוח יומי
- `GET /api/reports/export/orders` - ייצוא CSV

---

## 🆘 תמיכה

בעיות? שאלות?
- 📧 support@mmhakmon.co.il
- 📱 WhatsApp

---

**גרסה 4.0** | נבנה עם ❤️ על ידי M.M.H Deliveries
