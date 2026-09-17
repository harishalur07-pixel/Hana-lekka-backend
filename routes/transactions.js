const express = require('express');
const { pool } = require('../db/database');
const authenticateToken = require('../middleware/authenticateToken');

const router = express.Router();

router.use(authenticateToken);

router.post('/', async (req, res) => {
  try {
    const { type, amount, category, note, date } = req.body;
    const userId = req.user.id;

    if (!type || !['income', 'expense'].includes(type)) {
      return res.status(400).json({ success: false, message: "'type' income ಅಥವಾ expense ಆಗಿರಬೇಕು" });
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'ಸರಿಯಾದ ಮೊತ್ತ ನಮೂದಿಸಿ' });
    }

    const txnDate = date || new Date().toISOString().slice(0, 10);

    const result = await pool.query(
      `INSERT INTO transactions (user_id, type, amount, category, note, txn_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, type, amount, category || null, note || null, txnDate]
    );

    return res.status(201).json({ success: true, message: 'ಸೇರಿಸಲಾಗಿದೆ', transaction: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, from, to } = req.query;

    let query = 'SELECT * FROM transactions WHERE user_id = $1';
    const params = [userId];

    if (type && ['income', 'expense'].includes(type)) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }
    if (from) {
      params.push(from);
      query += ` AND txn_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      query += ` AND txn_date <= $${params.length}`;
    }
    query += ' ORDER BY txn_date DESC, id DESC';

    const result = await pool.query(query, params);
    return res.json({ success: true, transactions: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const { from, to } = req.query;

    let query = `
      SELECT type, COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE user_id = $1
    `;
    const params = [userId];

    if (from) {
      params.push(from);
      query += ` AND txn_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      query += ` AND txn_date <= $${params.length}`;
    }
    query += ' GROUP BY type';

    const result = await pool.query(query, params);

    let income = 0;
    let expense = 0;
    result.rows.forEach((row) => {
      if (row.type === 'income') income = Number(row.total);
      if (row.type === 'expense') expense = Number(row.total);
    });

    return res.json({
      success: true,
      summary: { income, expense, balance: income - expense }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ಈ Transaction ಸಿಗಲಿಲ್ಲ' });
    }
    return res.json({ success: true, message: 'ಡಿಲೀಟ್ ಆಗಿದೆ' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { type, amount, category, note, date } = req.body;

    if (type && !['income', 'expense'].includes(type)) {
      return res.status(400).json({ success: false, message: "'type' income ಅಥವಾ expense ಆಗಿರಬೇಕು" });
    }

    const existing = await pool.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ಈ Transaction ಸಿಗಲಿಲ್ಲ' });
    }
    const current = existing.rows[0];

    const result = await pool.query(
      `UPDATE transactions
       SET type = $1, amount = $2, category = $3, note = $4, txn_date = $5
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [
        type || current.type,
        amount || current.amount,
        category !== undefined ? category : current.category,
        note !== undefined ? note : current.note,
        date || current.txn_date,
        id,
        userId
      ]
    );

    return res.json({ success: true, message: 'ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ', transaction: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ದೋಷ' });
  }
});

module.exports = router;
