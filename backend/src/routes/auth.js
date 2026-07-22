const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

const router = express.Router();

const SALT_ROUNDS = 10;

// In-memory login throttle: max 5 FAILED attempts per (IP + email) per 15 min.
//
// Keyed by IP+email (not IP alone) so staff sharing one office IP / NAT don't
// lock each other out, and only FAILED attempts count — a successful login
// clears the counter (see the handler). Expired records are pruned so the Map
// can't grow unbounded.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const _loginAttempts = new Map();

function attemptKey(req) {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  return `${ip}|${email}`;
}

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const rec = _loginAttempts.get(attemptKey(req));
  if (rec && rec.resetAt > now && rec.count >= MAX_FAILURES) {
    const wait = Math.ceil((rec.resetAt - now) / 1000);
    return res.status(429).json({ success: false, error: `Too many attempts. Try again in ${wait}s.` });
  }
  next();
}

function recordFailedLogin(req) {
  const now = Date.now();
  const key = attemptKey(req);
  const rec = _loginAttempts.get(key);
  if (rec && rec.resetAt > now) {
    rec.count++;
  } else {
    _loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  }
  // Prune expired records so the Map stays bounded.
  for (const [k, r] of _loginAttempts) {
    if (r.resetAt <= now) _loginAttempts.delete(k);
  }
}

function clearLoginAttempts(req) {
  _loginAttempts.delete(attemptKey(req));
}

function validatePassword(pw) {
  if (typeof pw !== 'string') return 'New password must be a string';
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/\d/.test(pw)) {
    return 'Password must contain upper, lower, and a digit';
  }
  return null;
}

router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = await db('users').where({ email }).first();

    if (!user) {
      recordFailedLogin(req);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      recordFailedLogin(req);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    clearLoginAttempts(req);
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password — change own password (must supply current_password)
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: 'current_password and new_password are required' });
    }
    const validationError = validatePassword(new_password);
    if (validationError) return res.status(400).json({ success: false, error: validationError });
    if (current_password === new_password) {
      return res.status(400).json({ success: false, error: 'New password must differ from current' });
    }

    const user = await db('users').where({ id: req.user.id }).first();
    if (!user || !user.is_active) {
      return res.status(403).json({ success: false, error: 'Account not active' });
    }
    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await db('users').where({ id: user.id }).update({ password_hash: hash });

    await logAudit({
      table_name: 'users', record_id: user.id, action: 'UPDATE',
      user_id: req.user.id, changed_fields: { password_hash: true }, new_value: { password_changed: true },
    });

    res.json({ success: true, data: { changed: true } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — admin reset for another user (no old password needed)
router.post('/reset-password', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { user_id, new_password } = req.body || {};
    if (!user_id || !new_password) {
      return res.status(400).json({ success: false, error: 'user_id and new_password are required' });
    }
    const validationError = validatePassword(new_password);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const user = await db('users').where({ id: user_id }).first();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await db('users').where({ id: user.id }).update({ password_hash: hash });

    await logAudit({
      table_name: 'users', record_id: user.id, action: 'UPDATE',
      user_id: req.user.id,
      changed_fields: { password_hash: true },
      new_value: { admin_reset: true, target_user_id: user.id },
    });

    res.json({ success: true, data: { reset: true, user_id: user.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
