# 🚀 מדריך פריסה - M.M.H Delivery

מדריך שלב אחר שלב לפריסת המערכת ל-production.

---

## 📍 Render.com (מומלץ)

### שלב 1: הכנת Repository
```bash
# צור repository ב-GitHub
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/mmh-delivery.git
git push -u origin main
```

### שלב 2: יצירת Database

1. היכנס ל-[Render Dashboard](https://dashboard.render.com/)
2. לחץ על **New +** → **PostgreSQL**
3. הגדרות:
   - Name: `mmh-database`
   - Region: `Frankfurt (EU Central)`
   - Plan: `Free` (או `Starter` לפרודקשן)
4. לחץ **Create Database**
5. **שמור את ה-Internal Database URL!**

### שלב 3: יצירת Web Service

1. לחץ על **New +** → **Web Service**
2. חבר את ה-GitHub repository
3. הגדרות:
   - Name: `mmh-delivery`
   - Region: `Frankfurt (EU Central)`
   - Branch: `main`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: `Free` (או `Starter`)

### שלב 4: Environment Variables

הוסף את המשתנים הבאים:
```
DATABASE_URL=<ה-Internal Database URL מהשלב 2>
PORT=10000
NODE_ENV=production
PUBLIC_URL=https://your-app-name.onrender.com

JWT_SECRET=<צור secret חזק>
JWT_REFRESH_SECRET=<צור secret חזק>

WHAPI_TOKEN=<ה-token שלך>
COURIERS_GROUP_ID=<ה-group id שלך>
WHATSAPP_IMAGE_URL=<לוגו של החברה>

GOOGLE_API_KEY=<ה-API key שלך>

MOTORCYCLE_BASE_PRICE=70
MOTORCYCLE_PRICE_PER_KM=2.5
CAR_BASE_PRICE=100
CAR_PRICE_PER_KM=2.5
VAN_BASE_PRICE=350
VAN_PRICE_PER_KM=3.0
TRUCK_BASE_PRICE=950
TRUCK_PRICE_PER_KM=4.0

FREE_KM=1
VAT_RATE=0.18
COMMISSION_RATE=0.25
MIN_PAYOUT_AMOUNT=50

LOGO_URL=<לוגו של החברה>
```

### שלב 5: Deploy

1. לחץ **Create Web Service**
2. Render יתחיל לבנות ולפרוס
3. המתן כ-5-10 דקות
4. כשהסטטוס יהיה `Live` - המערכת פועלת!

### שלב 6: אתחול Database

1. פתח Shell ב-Render:
   - Web Service → **Shell**
2. הרץ:
```bash
npm run init-db
```

### שלב 7: בדיקה

1. גש ל-`https://your-app-name.onrender.com/health`
2. צריך לקבל: `{"status":"OK"}`
3. גש ל-`https://your-app-name.onrender.com/admin`
4. התחבר עם: `admin` / `Admin123!`

---

## ⚡ Railway.app

### התקנה מהירה
```bash
# התקן Railway CLI
npm install -g railway

# Login
railway login

# Init project
railway init

# Add PostgreSQL
railway add

# Deploy
railway up
```

### Environment Variables

הוסף דרך Dashboard או CLI:
```bash
railway variables set JWT_SECRET=your-secret
railway variables set WHAPI_TOKEN=your-token
# וכו'...
```

---

## 🐳 Docker (אופציונלי)

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 10000

CMD ["npm", "start"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "10000:10000"
    env_file:
      - .env
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: mmh_delivery
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### הרצה
```bash
docker-compose up -d
```

---

## 🔐 אבטחה לאחר Deploy

### 1. שנה סיסמת Admin

התחבר ל-`/admin` ושנה סיסמה מיד!

### 2. הגדר Secrets חזקים

צור JWT secrets חזקים:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. הגבל CORS

ב-`server.js`:
```javascript
app.use(cors({
  origin: ['https://your-domain.com'],
  credentials: true
}));
```

### 4. הפעל Rate Limiting

כבר מוגדר במערכת ✅

---

## 📊 Monitoring

### Render

- **Logs**: Dashboard → Logs
- **Metrics**: Dashboard → Metrics
- **Alerts**: Dashboard → Settings → Notifications

### Uptime Monitoring

השתמש ב:
- [UptimeRobot](https://uptimerobot.com/) (חינם)
- [Pingdom](https://www.pingdom.com/)

הגדר ping ל:
```
https://your-app.onrender.com/health
```

---

## 🔄 CI/CD

### Auto Deploy on Push

Render עושה זאת אוטומטית! 🎉

כל push ל-`main` יפעיל deploy חדש.

### Manual Deploy
```bash
# דרך Render Dashboard
Dashboard → Manual Deploy → Deploy latest commit
```

---

## 💾 Backup

### Database Backup (Render)
```bash
# דרך Render Dashboard
Database → Backups → Create Backup
```

### Automatic Backups

הגדר ב-Database Settings:
- Daily backups: 3:00 AM
- Retention: 7 days

---

## 🎉 סיימנו!

המערכת שלך פועלת ב-production! 🚀

### קישורים חשובים:

- **Admin**: https://your-app.onrender.com/admin
- **Courier**: https://your-app.onrender.com/courier
- **Customer**: https://your-app.onrender.com/
- **Health**: https://your-app.onrender.com/health

**זכור:** המשתמש הראשון הוא `admin` / `Admin123!`

**שנה את הסיסמה מיד!** 🔒