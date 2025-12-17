# M.M.H Delivery System v4.0 - Security Edition 🔒

## מה חדש באבטחה

### 1. Rate Limiting ✅
- **100 בקשות בדקה** - הגבלה גלובלית
- **5 ניסיונות התחברות בדקה** - למניעת brute force
- ניקוי אוטומטי של הזיכרון כל דקה

### 2. הצפנת סיסמאות חזקה ✅
- **bcrypt rounds: 12** (במקום 10)
- סיסמה מינימלית: 6 תווים

### 3. Security Headers (Helmet-style) ✅
- `X-Frame-Options: DENY` - מונע clickjacking
- `X-Content-Type-Options: nosniff` - מונע MIME sniffing
- `X-XSS-Protection: 1; mode=block` - הגנת XSS
- `Content-Security-Policy` - הגבלת מקורות
- `Strict-Transport-Security` - HSTS (בproduction)

### 4. HTTPS Redirect ✅
- בproduction - הפניה אוטומטית מ-HTTP ל-HTTPS

### 5. JWT Refresh Tokens ✅
- **Access Token**: 15 דקות
- **Refresh Token**: 7 ימים
- רענון אוטומטי בצד הלקוח
- ביטול refresh token ב-logout

### 6. נעילת חשבון ✅
- **5 ניסיונות כושלים** = נעילה ל-15 דקות
- לוג של כל ניסיון כושל
- התראה למשתמש על זמן הנעילה

### 7. 2FA - אימות דו-שלבי ✅
- זמין למנהלים (admin)
- קוד 6 ספרות נשלח בווצאפ
- תוקף: 5 דקות
- ניתן להפעיל/לבטל

---

## איך להתקין

### אם יש לך דאטאבייס קיים:
```bash
node migrate-security.js
```

### אם מתחילים מאפס:
```bash
node scripts/init-db.js
```

---

## משתני סביבה חדשים (.env)
```env
JWT_SECRET=your-super-secret-key-change-this
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this
NODE_ENV=production
```

---

## API Endpoints חדשים

```
POST /api/auth/login        - התחברות (עם תמיכה ב-2FA)
POST /api/auth/refresh      - רענון טוקן
POST /api/auth/logout       - התנתקות
POST /api/auth/toggle-2fa   - הפעלת/ביטול 2FA
GET  /api/admin/security-logs - לוג אבטחה
```

---

## לוג אבטחה

המערכת מתעדת:
- `LOGIN_SUCCESS` - התחברות מוצלחת
- `LOGIN_FAILED` - ניסיון כושל
- `LOGIN_BLOCKED` - חשבון נעול
- `ACCOUNT_LOCKED` - נעילת חשבון
- `2FA_SENT` - קוד 2FA נשלח
- `2FA_FAILED` - קוד שגוי
- `2FA_ENABLED` / `2FA_DISABLED` - שינוי 2FA
- `RATE_LIMIT` - חסימת rate limit
- `USER_CREATED` - יצירת משתמש
- `PASSWORD_CHANGED` - שינוי סיסמה

---

## המלצות נוספות

1. **שנה את הסודות ב-.env** - אל תשתמש בברירת מחדל!
2. **הפעל 2FA לכל המנהלים**
3. **בדוק לוג אבטחה באופן קבוע**
4. **גבה את הדאטאבייס**

---

**גרסה:** 4.0.0 Security Edition
**תאריך:** דצמבר 2025
