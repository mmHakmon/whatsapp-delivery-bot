/**
 * M.M.H Delivery System Pro v4.0
 * Reports & Export Routes
 */

const express = require('express');
const router = express.Router();

const { query } = require('../config/database');
const { requireAuth, requireRole } = require('../middleware/security');
const { sendDailyReport } = require('../utils/whatsapp');

// ══════════════════════════════════════════════════════════════
// DAILY REPORT
// ══════════════════════════════════════════════════════════════

router.get('/daily', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END), 0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END), 0) as profit
      FROM orders 
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at) 
      ORDER BY date DESC
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Daily report error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// WEEKLY REPORT
// ══════════════════════════════════════════════════════════════

router.get('/weekly', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT DATE_TRUNC('week', created_at) as week,
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END), 0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END), 0) as profit
      FROM orders 
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', created_at) 
      ORDER BY week DESC
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Weekly report error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// HOURLY REPORT
// ══════════════════════════════════════════════════════════════

router.get('/hourly', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered
      FROM orders 
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM created_at) 
      ORDER BY hour
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Hourly report error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// DAILY SUMMARY (for WhatsApp)
// ══════════════════════════════════════════════════════════════

router.get('/daily-summary', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END), 0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END), 0) as profit
      FROM orders 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    const stats = result.rows[0];
    const date = new Date().toLocaleDateString('he-IL');
    
    const report = `📊 *דוח יומי - ${date}*

📦 סה"כ הזמנות: ${stats.total}
✅ נמסרו: ${stats.delivered}
❌ בוטלו: ${stats.cancelled}
💰 הכנסות: ₪${stats.revenue}
📈 רווח נקי: ₪${stats.profit}

יום טוב! 🚀`;
    
    res.json({ report, stats });
    
  } catch (error) {
    console.error('Daily summary error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// SEND DAILY REPORT TO WHATSAPP
// ══════════════════════════════════════════════════════════════

router.post('/send-daily', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END), 0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END), 0) as profit
      FROM orders 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    await sendDailyReport(result.rows[0]);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Send daily report error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// EXPORT ORDERS TO CSV
// ══════════════════════════════════════════════════════════════

router.get('/export/orders', requireAuth, async (req, res) => {
  try {
    const { from, to, status } = req.query;
    
    let sql = `
      SELECT o.*, c.first_name as courier_first, c.last_name as courier_last, c.phone as courier_phone
      FROM orders o 
      LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;
    
    if (from) {
      sql += ` AND o.created_at >= $${i++}`;
      params.push(from);
    }
    if (to) {
      sql += ` AND o.created_at <= $${i++}`;
      params.push(to + ' 23:59:59');
    }
    if (status && status !== 'all') {
      sql += ` AND o.status = $${i++}`;
      params.push(status);
    }
    
    sql += ' ORDER BY o.created_at DESC';
    
    const result = await query(sql, params);
    
    // Build CSV with BOM for Hebrew support
    const BOM = '\uFEFF';
    let csv = BOM + 'מספר הזמנה,תאריך,שולח,טלפון שולח,כתובת איסוף,מקבל,טלפון מקבל,כתובת מסירה,מחיר,עמלה,לשליח,סטטוס,שליח\n';
    
    const statusLabels = {
      new: 'חדש',
      published: 'מפורסם',
      taken: 'נתפס',
      picked: 'נאסף',
      delivered: 'נמסר',
      cancelled: 'בוטל'
    };
    
    result.rows.forEach(o => {
      const statusLabel = statusLabels[o.status] || o.status;
      const courier = o.courier_first ? `${o.courier_first} ${o.courier_last}` : '';
      const date = new Date(o.created_at).toLocaleString('he-IL');
      
      csv += `"${o.order_number}","${date}","${o.sender_name || ''}","${o.sender_phone || ''}","${o.pickup_address || ''}","${o.receiver_name || ''}","${o.receiver_phone || ''}","${o.delivery_address || ''}",${o.price},${o.commission},${o.courier_payout},"${statusLabel}","${courier}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=orders-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
    
  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// EXPORT COURIERS TO CSV
// ══════════════════════════════════════════════════════════════

router.get('/export/couriers', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT c.*, 
        COUNT(CASE WHEN o.status='delivered' THEN 1 END) as total_deliveries,
        COALESCE(SUM(CASE WHEN o.status='delivered' THEN o.courier_payout END), 0) as total_earned
      FROM couriers c 
      LEFT JOIN orders o ON c.id = o.courier_id
      GROUP BY c.id 
      ORDER BY total_deliveries DESC
    `);
    
    const BOM = '\uFEFF';
    let csv = BOM + 'שם פרטי,שם משפחה,ת.ז,טלפון,סטטוס,משלוחים,סה"כ הרוויח,יתרה\n';
    
    result.rows.forEach(c => {
      const status = c.status === 'active' ? 'פעיל' : 'לא פעיל';
      csv += `"${c.first_name}","${c.last_name}","${c.id_number}","${c.phone}","${status}",${c.total_deliveries},${c.total_earned},${c.balance}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=couriers-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
    
  } catch (error) {
    console.error('Export couriers error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// EXPORT PAYMENTS TO CSV
// ══════════════════════════════════════════════════════════════

router.get('/export/payments', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, c.first_name, c.last_name, u.name as paid_by
      FROM payments p 
      JOIN couriers c ON p.courier_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `);
    
    const BOM = '\uFEFF';
    let csv = BOM + 'תאריך,שליח,סכום,אמצעי תשלום,הערות,שולם ע"י\n';
    
    const methodLabels = {
      cash: 'מזומן',
      transfer: 'העברה',
      bit: 'ביט'
    };
    
    result.rows.forEach(p => {
      const date = new Date(p.created_at).toLocaleString('he-IL');
      const method = methodLabels[p.method] || p.method;
      csv += `"${date}","${p.first_name} ${p.last_name}",${p.amount},"${method}","${p.notes || ''}","${p.paid_by || ''}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=payments-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
    
  } catch (error) {
    console.error('Export payments error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
