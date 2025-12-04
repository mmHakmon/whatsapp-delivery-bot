const express = require('express');
const { pool } = require('../config/database');
const { auth, superAdmin } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');

const router = express.Router();

// Get all settings
router.get('/', auth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings ORDER BY key');

    // Convert to object format
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
});

// Get single setting
router.get('/:key', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM system_settings WHERE key = $1',
      [req.params.key]
    );

    if (result.rows.length === 0) {
      throw new AppError('הגדרה לא נמצאה', 404);
    }

    res.json({
      success: true,
      setting: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Update setting
router.put('/:key', auth, async (req, res, next) => {
  try {
    const { value, description } = req.body;

    const result = await pool.query(
      `UPDATE system_settings 
       SET value = $1, description = COALESCE($2, description), 
           updated_by = $3, updated_at = NOW()
       WHERE key = $4
       RETURNING *`,
      [JSON.stringify(value), description, req.admin.id, req.params.key]
    );

    if (result.rows.length === 0) {
      // Create if not exists
      const insertResult = await pool.query(
        `INSERT INTO system_settings (key, value, description, updated_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.params.key, JSON.stringify(value), description, req.admin.id]
      );
      
      return res.json({
        success: true,
        setting: insertResult.rows[0]
      });
    }

    res.json({
      success: true,
      setting: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Get delivery zones
router.get('/zones/list', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM delivery_zones WHERE is_active = true ORDER BY name'
    );

    res.json({
      success: true,
      zones: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create delivery zone
router.post('/zones', auth, async (req, res, next) => {
  try {
    const { name, cities, base_price, price_per_km, courier_rate } = req.body;

    if (!name || !cities || !base_price) {
      throw new AppError('נדרש שם, ערים ומחיר בסיס', 400);
    }

    const result = await pool.query(
      `INSERT INTO delivery_zones (name, cities, base_price, price_per_km, courier_rate)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, cities, base_price, price_per_km || 2, courier_rate]
    );

    res.status(201).json({
      success: true,
      zone: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Update delivery zone
router.put('/zones/:id', auth, async (req, res, next) => {
  try {
    const { name, cities, base_price, price_per_km, courier_rate, is_active } = req.body;

    const result = await pool.query(
      `UPDATE delivery_zones 
       SET name = COALESCE($1, name),
           cities = COALESCE($2, cities),
           base_price = COALESCE($3, base_price),
           price_per_km = COALESCE($4, price_per_km),
           courier_rate = COALESCE($5, courier_rate),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [name, cities, base_price, price_per_km, courier_rate, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('אזור לא נמצא', 404);
    }

    res.json({
      success: true,
      zone: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Delete delivery zone (soft delete)
router.delete('/zones/:id', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE delivery_zones SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('אזור לא נמצא', 404);
    }

    res.json({
      success: true,
      message: 'אזור הושבת בהצלחה'
    });
  } catch (error) {
    next(error);
  }
});

// Get admins list (super admin only)
router.get('/admins/list', auth, superAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, role, is_active, created_at FROM admins ORDER BY name'
    );

    res.json({
      success: true,
      admins: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Update admin (super admin only)
router.put('/admins/:id', auth, superAdmin, async (req, res, next) => {
  try {
    const { name, email, phone, role, is_active } = req.body;

    // Can't deactivate yourself
    if (req.params.id === req.admin.id && is_active === false) {
      throw new AppError('לא ניתן להשבית את עצמך', 400);
    }

    const result = await pool.query(
      `UPDATE admins 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           role = COALESCE($4, role),
           is_active = COALESCE($5, is_active),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, email, phone, role, is_active`,
      [name, email, phone, role, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('מנהל לא נמצא', 404);
    }

    res.json({
      success: true,
      admin: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Export all data (for backup)
router.get('/export', auth, superAdmin, async (req, res, next) => {
  try {
    const [deliveries, couriers, payments, settings] = await Promise.all([
      pool.query('SELECT * FROM deliveries ORDER BY created_at DESC LIMIT 1000'),
      pool.query('SELECT * FROM couriers'),
      pool.query('SELECT * FROM courier_payments ORDER BY created_at DESC LIMIT 500'),
      pool.query('SELECT * FROM system_settings')
    ]);

    res.json({
      success: true,
      exported_at: new Date().toISOString(),
      data: {
        deliveries: deliveries.rows,
        couriers: couriers.rows,
        payments: payments.rows,
        settings: settings.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
