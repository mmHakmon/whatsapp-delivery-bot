# 🚚 M.M.H Delivery System

מערכת ניהול משלוחים מתקדמת עם אוטומציה מלאה, מעקב בזמן אמת ואינטגרציית WhatsApp.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## 📋 תוכן עניינים

- [תכונות](#-תכונות)
- [דרישות מערכת](#-דרישות-מערכת)
- [התקנה](#-התקנה)
- [הגדרות](#-הגדרות)
- [הרצה](#-הרצה)
- [מבנה הפרויקט](#-מבנה-הפרויקט)
- [API Documentation](#-api-documentation)
- [Deployment](#-deployment)
- [תחזוקה](#-תחזוקה)

---

## ✨ תכונות

### 🎯 תכונות עיקריות
- ✅ **מערכת הזמנות מלאה** - יצירה, עריכה, מעקב וביטול
- ✅ **ניהול שליחים** - רישום, אישור, חסימה ותשלומים
- ✅ **חישוב מחירים אוטומטי** - Google Maps Distance Matrix API
- ✅ **WhatsApp אוטומטי** - התראות ללקוחות ושליחים דרך Whapi.cloud
- ✅ **WebSocket Real-time** - עדכונים חיים לכל המשתמשים
- ✅ **GPS Tracking** - מעקב אחר מיקום שליחים בזמן אמת
- ✅ **מערכת תשלומים** - ניהול יתרות ובקשות משיכה
- ✅ **דשבורד אנליטי** - סטטיסטיקות ודוחות מפורטים

### 🏢 למנהלים
- דשבורד מרכזי עם סטטיסטיקות
- ניהול הזמנות (יצירה, פרסום, ביטול)
- ניהול שליחים (אישור, חסימה)
- אישור תשלומים לשליחים
- יצוא נתונים ודוחות

### 🏍️ לשליחים
- אפליקציה פשוטה ונוחה
- התחברות עם מספר טלפון בלבד
- רשימת משלוחים זמינים
- ניהול משלוחים פעילים
- דשבורד רווחים ובקשות משיכה
- ניווט אוטומטי ל-Waze

### 👤 ללקוחות
- טופס הזמנה פשוט
- חישוב מחיר מיידי
- מעקב אחר משלוח בזמן אמת
- התראות WhatsApp אוטומטיות
- דירוג שליחים

---

## 🔧 דרישות מערכת

### תוכנה נדרשת
- **Node.js** >= 18.0.0
- **PostgreSQL** >= 15
- **npm** או **yarn**

### שירותים חיצוניים
- **Google Maps API** - חישוב מרחקים
- **Whapi.cloud** - שליחת הודעות WhatsApp
- **Render.com** (או hosting דומה) - deployment

---

## 📦 התקנה

### 1. Clone הפרויקט
```bash
git clone https://github.com/yourusername/mmh-delivery.git
cd mmh-delivery
```

### 2. התקנת Dependencies
```bash
npm install
```

### 3. הגדרת Environment Variables

העתק את קובץ `.env.example` ל-`.env`:
```bash
cp .env.example .env
```

ערוך את הקובץ `.env` והזן את הערכים שלך:
```bash
# דאטאבייס
DATABASE_URL=postgresql://user:password@localhost:5432/mmh_delivery

# JWT Secrets (צור secrets חזקים!)
JWT_SECRET=your-generated-secret-key
JWT_REFRESH_SECRET=your-generated-refresh-key

# WhatsApp
WHAPI_TOKEN=your-whapi-token
COURIERS_GROUP_ID=your-group-id

# Google Maps
GOOGLE_API_KEY=your-google-api-key
```

### 4. יצירת בסיס נתונים
```bash
# התחבר ל-PostgreSQL
psql -U postgres

# צור database
CREATE DATABASE mmh_delivery;
\q

# הרץ את סקריפט היצירה
npm run init-db
```

---

## ⚙️ הגדרות

### מחירון

ערוך את המחירים ב-`.env`:
```bash
MOTORCYCLE_BASE_PRICE=70      # מחיר בסיס אופנוע
MOTORCYCLE_PRICE_PER_KM=2.5   # מחיר לק"מ

CAR_BASE_PRICE=75
CAR_PRICE_PER_KM=2.5

VAN_BASE_PRICE=120
VAN_PRICE_PER_KM=3.0

TRUCK_BASE_PRICE=200
TRUCK_PRICE_PER_KM=4.0

FREE_KM=1                     # ק"מ ראשון חינם
VAT_RATE=0.18                 # מע"מ 18%
COMMISSION_RATE=0.25          # עמלה 25%
```

### משתמש מנהל ברירת מחדל

לאחר `npm run init-db`:
```
Username: admin
Password: Admin123!
```

**חשוב:** שנה את הסיסמה מיד לאחר ההתחברות הראשונה!

---

## 🚀 הרצה

### Development Mode
```bash
npm run dev
```

השרת ירוץ על: `http://localhost:10000`

### Production Mode
```bash
npm start
```

### דפים זמינים

- **Admin Panel**: http://localhost:10000/admin
- **Courier App**: http://localhost:10000/courier
- **Customer Form**: http://localhost:10000/
- **Health Check**: http://localhost:10000/health

---

## 📁 מבנה הפרויקט
```
mmh-delivery/
├── server.js                 # נקודת כניסה ראשית
├── package.json
├── .env
├── .gitignore
│
├── config/                   # הגדרות
│   ├── database.js          # חיבור PostgreSQL
│   ├── constants.js         # קבועים
│   └── pricing.js           # לוגיקת תמחור
│
├── middleware/              # Middleware
│   ├── auth.js             # JWT authentication
│   ├── validation.js       # Validation rules
│   └── errorHandler.js     # Error handling
│
├── routes/                  # Routes
│   ├── auth.routes.js
│   ├── orders.routes.js
│   ├── couriers.routes.js
│   ├── payments.routes.js
│   └── admin.routes.js
│
├── controllers/             # Controllers
│   ├── auth.controller.js
│   ├── orders.controller.js
│   ├── couriers.controller.js
│   └── payments.controller.js
│
├── services/                # Services
│   ├── whatsapp.service.js # WhatsApp
│   ├── maps.service.js     # Google Maps
│   └── websocket.service.js # Real-time
│
├── utils/                   # Utilities
│   ├── helpers.js
│   └── logger.js
│
├── database/                # Database
│   ├── init.sql
│   └── init.js
│
└── public/                  # Frontend
    ├── index.html          # Customer form
    ├── admin/
    │   ├── index.html
    │   └── admin.js
    └── courier/
        ├── index.html
        └── courier.js
```

---

## 📚 API Documentation

### Authentication

#### POST `/api/auth/login`
התחברות מנהל
```json
{
  "username": "admin",
  "password": "Admin123!"
}
```

#### POST `/api/auth/courier-login`
התחברות שליח
```json
{
  "phone": "0501234567"
}
```

### Orders

#### GET `/api/orders`
רשימת הזמנות (דורש אימות)

Query params:
- `status`: new, published, taken, picked, delivered, cancelled
- `limit`: מספר תוצאות (default: 50)
- `offset`: offset לדפדוף

#### POST `/api/orders`
יצירת הזמנה חדשה (דורש אימות)
```json
{
  "senderName": "שם שולח",
  "senderPhone": "0501234567",
  "pickupAddress": "כתובת איסוף",
  "receiverName": "שם מקבל",
  "receiverPhone": "0509876543",
  "deliveryAddress": "כתובת מסירה",
  "vehicleType": "motorcycle",
  "packageDescription": "תיאור"
}
```

#### POST `/api/orders/:id/publish`
פרסום הזמנה (דורש אימות admin)

#### POST `/api/orders/:id/take`
תפיסת הזמנה (דורש אימות courier)

#### POST `/api/orders/:id/pickup`
סימון כנאסף (דורש אימות courier)

#### POST `/api/orders/:id/deliver`
סימון כנמסר (דורש אימות courier)

### Couriers

#### GET `/api/couriers`
רשימת שליחים (דורש אימות admin)

#### POST `/api/couriers/register`
רישום שליח חדש
```json
{
  "firstName": "יוסי",
  "lastName": "כהן",
  "idNumber": "123456789",
  "phone": "0501234567",
  "vehicleType": "motorcycle"
}
```

#### GET `/api/couriers/available-orders`
משלוחים זמינים (דורש אימות courier)

#### GET `/api/couriers/my-statistics`
סטטיסטיקות שליח (דורש אימות courier)

### Payments

#### POST `/api/payments/payout-request`
בקשת משיכה (דורש אימות courier)
```json
{
  "amount": 500,
  "paymentMethod": "bank_transfer",
  "accountInfo": "12-345-67890"
}
```

#### GET `/api/payments/requests`
רשימת בקשות משיכה (דורש אימות admin)

#### POST `/api/payments/requests/:id/approve`
אישור בקשת משיכה (דורש אימות admin)

---

## 🌐 Deployment

### Render.com (מומלץ)

1. **צור Web Service חדש**
   - Repository: החיבור ל-GitHub
   - Build Command: `npm install`
   - Start Command: `npm start`

2. **צור PostgreSQL Database**
   - הוסף את ה-`DATABASE_URL` ל-Environment Variables

3. **הגדר Environment Variables**
   - העתק את כל המשתנים מ-`.env`
   - הוסף אותם ב-Render Dashboard

4. **Deploy!**
   - Render יבצע deploy אוטומטית

### Railway / Heroku

דומה ל-Render, רק הקפד על:
- Build Pack: Node.js
- PostgreSQL add-on
- Environment Variables

---

## 🔒 אבטחה

### Best Practices

✅ **JWT Tokens**
- Access token: 15 דקות
- Refresh token: 7 יום
- Secrets חזקים בלבד

✅ **Passwords**
- bcrypt עם 12 rounds
- מינימום 8 תווים
- Never log passwords

✅ **Rate Limiting**
- 100 requests/minute global
- 5 login attempts/minute

✅ **Database**
- Parameterized queries (מונע SQL injection)
- SSL בסביבת production

✅ **Headers**
- Helmet.js לאבטחת headers
- CORS configuration

---

## 🔄 תחזוקה

### Logs

Logs נשמרים בתיקיית `/logs`:
```bash
# צפייה ב-logs
tail -f logs/$(date +%Y-%m-%d).log
```

### Backup Database
```bash
# גיבוי
pg_dump -U postgres mmh_delivery > backup.sql

# שחזור
psql -U postgres mmh_delivery < backup.sql
```

### עדכון Dependencies
```bash
# בדיקת עדכונים
npm outdated

# עדכון
npm update

# עדכון major versions
npm install package@latest
```

---

## 🐛 Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED
```

**פתרון:**
- בדוק ש-PostgreSQL רץ: `sudo service postgresql status`
- בדוק את `DATABASE_URL` ב-`.env`

### WhatsApp Not Sending

**פתרון:**
- בדוק את `WHAPI_TOKEN` תקף
- בדוק את `COURIERS_GROUP_ID` נכון
- צפה ב-console logs

### Google Maps Error

**פתרון:**
- בדוק ש-Distance Matrix API מופעל
- בדוק credit ב-Google Cloud Console
- בדוק את `GOOGLE_API_KEY`

---

## 📊 סטטיסטיקות

מערכת תומכת ב:
- 1000+ משלוחים ביום
- 100+ שליחים פעילים
- Real-time updates ל-1000+ משתמשים
- <2 שניות זמן תגובה

---

## 🤝 תרומה

רוצה לתרום? נהדר!

1. Fork the repo
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📝 License

MIT License - ראה [LICENSE](LICENSE) לפרטים

---

## 👨‍💻 יוצר

**Haki** - M.M.H Delivery System

- GitHub: [@yourusername](https://github.com/yourusername)
- Email: your.email@example.com

---

## 🙏 תודות

- [Express.js](https://expressjs.com/)
- [PostgreSQL](https://www.postgresql.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Google Maps API](https://developers.google.com/maps)
- [Whapi.cloud](https://whapi.cloud/)
- [Render.com](https://render.com/)

---

**עשוי עם ❤️ בישראל**