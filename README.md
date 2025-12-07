# 🚚 M.M.H Delivery System - מדריך העלאה ל-Render

## 📋 מה יש בתיקייה הזו?

```
mmh-render/
├── server.js      # השרת (מותאם ל-Render)
├── package.json   # תלויות
└── README.md      # המדריך הזה
```

---

## 🚀 שלב 1: העלאה ל-GitHub

### אפשרות א: דרך GitHub Desktop או VS Code
1. צור repository חדש ב-GitHub
2. העלה את שני הקבצים: `server.js` ו-`package.json`

### אפשרות ב: דרך Terminal
```bash
# צור תיקייה חדשה
mkdir mmh-delivery
cd mmh-delivery

# העתק את הקבצים לתיקייה

# אתחל Git
git init
git add .
git commit -m "Initial commit"

# צור repo ב-GitHub ואז:
git remote add origin https://github.com/YOUR_USERNAME/mmh-delivery.git
git branch -M main
git push -u origin main
```

---

## 🌐 שלב 2: יצירת Web Service ב-Render

1. לך ל-[render.com](https://render.com) והתחבר (אפשר עם GitHub)

2. לחץ **"New +"** → **"Web Service"**

3. בחר **"Build and deploy from a Git repository"**

4. חבר את ה-GitHub repo שלך

5. הגדר את השירות:

| שדה | ערך |
|-----|-----|
| **Name** | `mmh-delivery` |
| **Region** | `Frankfurt (EU Central)` |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

6. בחר **Instance Type**:
   - **Free** - לבדיקות (נרדם אחרי 15 דקות)
   - **Starter ($7/חודש)** - לייצור (תמיד פעיל)

7. לחץ **"Create Web Service"**

---

## ⚙️ שלב 3: הגדרת Environment Variables

ב-Render, לך ל-**Environment** (בצד שמאל) והוסף:

| Key | Value |
|-----|-------|
| `WHAPI_TOKEN` | `a52q50FVgRAJNQaP4y165EoHx6fDixXw` |
| `COURIERS_GROUP_ID` | `120363404988099203@g.us` |
| `PUBLIC_URL` | `https://mmh-delivery.onrender.com` |
| `COMMISSION_RATE` | `0.25` |

⚠️ **חשוב:** ה-`PUBLIC_URL` צריך להיות ה-URL האמיתי שתקבל מ-Render (תראה אותו אחרי ה-deploy)

---

## 🔗 שלב 4: הגדרת Webhook ב-Whapi.Cloud

1. לך ל-[Whapi.Cloud Dashboard](https://whapi.cloud) → Webhooks

2. הוסף webhook חדש:
   - **URL:** `https://mmh-delivery.onrender.com/webhook/whapi`
   - **Events:** `messages`

---

## ✅ שלב 5: בדיקה

1. פתח את ה-URL שקיבלת מ-Render, למשל:
   ```
   https://mmh-delivery.onrender.com
   ```

2. אמור לראות:
   ```json
   {
     "name": "M.M.H Delivery System",
     "status": "running"
   }
   ```

3. בדוק health:
   ```
   https://mmh-delivery.onrender.com/health
   ```

---

## 🎨 שלב 6: הפעלת הממשק (Frontend)

הממשק (React) יכול לרוץ:

### אפשרות 1: מקומית על המחשב שלך
```bash
# צור פרויקט React
npx create-react-app mmh-frontend
cd mmh-frontend

# החלף את src/App.js בתוכן של mmh-delivery-system.jsx

# שנה את ה-WebSocket URL בקוד:
# מ: ws://localhost:3001
# ל: wss://mmh-delivery.onrender.com

npm start
```

### אפשרות 2: ב-Artifact של Claude
- העתק את `mmh-delivery-system.jsx` ל-Claude
- שנה את ה-WebSocket URL ל-Render שלך
- הפעל כ-artifact

---

## ⚠️ בעיות נפוצות ופתרונות

### 1. השרת לא עולה
- בדוק ב-Render → Logs אם יש שגיאות
- וודא ש-`package.json` קיים

### 2. Webhook לא מגיע
- וודא שה-URL נכון (עם `/webhook/whapi` בסוף)
- בדוק ב-Whapi Logs אם יש שגיאות

### 3. הודעות לא נשלחות
- בדוק ש-`WHAPI_TOKEN` נכון ב-Environment Variables
- וודא שהטוקן לא פג תוקף

### 4. השרת "נרדם" (Free tier בלבד)
- Render Free tier מכבה את השרת אחרי 15 דקות ללא תנועה
- פתרון: שדרג ל-Starter ($7/חודש) או הוסף health check ping

### 5. WebSocket מתנתק
- וודא שאתה משתמש ב-`wss://` (עם s) ולא `ws://`

---

## 📊 URLs חשובים אחרי Deploy

| מה | URL |
|----|-----|
| **השרת** | `https://mmh-delivery.onrender.com` |
| **Health Check** | `https://mmh-delivery.onrender.com/health` |
| **Webhook** | `https://mmh-delivery.onrender.com/webhook/whapi` |
| **WebSocket** | `wss://mmh-delivery.onrender.com` |
| **הזמנות API** | `https://mmh-delivery.onrender.com/api/orders` |

---

## 🔄 עדכון הקוד

כל פעם שתעשה push ל-GitHub, Render יעשה deploy אוטומטי!

```bash
git add .
git commit -m "Update"
git push
```

---

בהצלחה! 🚀
