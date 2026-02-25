const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Load .env ──────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.substring(0, idx).trim();
            let value = trimmed.substring(idx + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
              value = value.slice(1, -1);
            if (!process.env[key]) process.env[key] = value;
          }
        }
      });
    }
  } catch (_) { /* ignore */ }
}
loadEnv();

const JWT_SECRET = process.env.JWT_SECRET || 'garage-services-secret-key-2026';
const PORT = process.env.PORT || process.env.API_PORT || 5000;
const portFile = path.join(__dirname, '.server-port');
const pidFile = path.join(__dirname, '.server-pid');

// ── Database (PostgreSQL on Render, MySQL locally) ─────────
const isPostgres = !!process.env.DATABASE_URL;
let dbPool;

if (isPostgres) {
  const { Pool } = require('pg');
  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  const mysql = require('mysql2/promise');
  dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.JAVA_DB_USER || process.env.DB_USER || 'root',
    password: process.env.JAVA_DB_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'garage',
    waitForConnections: true,
    connectionLimit: 10,
  });
}

// Universal query wrapper: converts MySQL ? placeholders to PostgreSQL $1,$2,...
async function db(sql, params = []) {
  if (isPostgres) {
    let idx = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
    const result = await dbPool.query(pgSql, params);
    return [result.rows, result];
  }
  return dbPool.query(sql, params);
}

// ── Nodemailer ─────────────────────────────────────────────
function getMailTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.JAVA_SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT || process.env.JAVA_SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || process.env.JAVA_SMTP_USER || '',
      pass: process.env.SMTP_PASS || process.env.JAVA_SMTP_PASS || '',
    },
  });
}

async function sendMail(to, subject, html) {
  try {
    const t = getMailTransporter();
    await t.sendMail({
      from: `"Garage Services" <${process.env.SMTP_USER || process.env.JAVA_SMTP_USER || 'noreply@garage-services.me'}>`,
      to, subject, html,
    });
    return true;
  } catch (err) {
    console.error('Email error:', err.message);
    return false;
  }
}

// ── OTP helper ─────────────────────────────────────────────
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendOTP(email, otp) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="color:#1e40af;margin-bottom:8px">Garage Services</h2>
      <p style="color:#4b5563">Your One-Time Password is:</p>
      <div style="text-align:center;margin:24px 0">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1e40af;background:#eff6ff;padding:16px 32px;border-radius:12px;display:inline-block">${otp}</span>
      </div>
      <p style="color:#6b7280;font-size:14px">This OTP expires in <b>10 minutes</b>. Do not share it with anyone.</p>
    </div>
  `;
  return sendMail(email, `Your OTP: ${otp} — Garage Services`, html);
}

// ── Order ID Generator ─────────────────────────────────────
async function generateOrderId() {
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `GS-${dateStr}-`;
  const [rows] = await db(
    "SELECT order_id FROM GarageServiceBookings WHERE order_id LIKE ? ORDER BY order_id DESC LIMIT 1",
    [`${prefix}%`]
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].order_id;
    const lastSeq = parseInt(last.split('-').pop(), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// ── Initialize all tables (PostgreSQL) ─────────────────────
async function initPostgresTables() {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS Users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE,
      password VARCHAR(255),
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(20),
      role VARCHAR(20) NOT NULL DEFAULT 'Customer',
      approval_status VARCHAR(20) DEFAULT NULL,
      otp VARCHAR(10),
      otp_expires TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS GarageServiceBookings (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES Users(id) ON DELETE SET NULL,
      order_id VARCHAR(50),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      wheeler_type VARCHAR(20) NOT NULL,
      service_type VARCHAR(50) DEFAULT 'Standard',
      cost DOUBLE PRECISION NOT NULL,
      appointment_date TIMESTAMP,
      status VARCHAR(20) DEFAULT 'Pending',
      notes TEXT,
      assigned_worker_id INT REFERENCES Users(id) ON DELETE SET NULL,
      booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS Notifications (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      booking_id INT REFERENCES GarageServiceBookings(id) ON DELETE SET NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'General',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      actor_id INT REFERENCES Users(id) ON DELETE SET NULL,
      is_read SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbPool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON Notifications (user_id, is_read, created_at)
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS CustomerFeedback (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES Users(id) ON DELETE SET NULL,
      name VARCHAR(100),
      feedback_text TEXT NOT NULL,
      rating INT CHECK (rating BETWEEN 1 AND 5),
      feedback_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS Settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default settings
  const defaults = [
    ['two_wheeler_cost', '500'],
    ['three_wheeler_cost', '750'],
    ['four_wheeler_cost', '1000'],
    ['premium_discount', '10'],
    ['business_name', 'Premium Garage Services'],
    ['business_email', 'contact@garageservices.com'],
    ['business_phone', '+1-234-567-8900'],
  ];
  for (const [key, value] of defaults) {
    await dbPool.query(
      `INSERT INTO Settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO NOTHING`,
      [key, value]
    );
  }

  // Create default manager account if none exists
  const { rows: managers } = await dbPool.query(`SELECT id FROM Users WHERE role = 'Manager' LIMIT 1`);
  if (managers.length === 0) {
    const hashedPw = await bcrypt.hash('admin123', 10);
    await dbPool.query(
      `INSERT INTO Users (username, password, full_name, email, role) VALUES ($1, $2, $3, $4, $5)`,
      ['admin', hashedPw, 'Admin Manager', 'admin@garage-services.me', 'Manager']
    );
    console.log('  Default manager created: username=admin, password=admin123');
  }
}

async function ensureNotificationsTable() {
  if (isPostgres) return; // Already handled by initPostgresTables
  await db(`
    CREATE TABLE IF NOT EXISTS Notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      booking_id INT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'General',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      actor_id INT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_user_read_created (user_id, is_read, created_at),
      CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
      CONSTRAINT fk_notifications_booking FOREIGN KEY (booking_id) REFERENCES GarageServiceBookings(id) ON DELETE SET NULL,
      CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES Users(id) ON DELETE SET NULL
    )
  `);
}

async function getUserDisplayName(userId, fallback = 'User') {
  try {
    const [rows] = await db(
      'SELECT full_name, username, email FROM Users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!rows.length) return fallback;
    return rows[0].full_name || rows[0].username || rows[0].email || fallback;
  } catch (_) {
    return fallback;
  }
}

async function createNotification({ userId, bookingId = null, type = 'General', title, message, actorId = null }) {
  if (!userId || !title || !message) return;
  try {
    await db(
      'INSERT INTO Notifications (user_id, booking_id, type, title, message, actor_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, bookingId, type, title, message, actorId]
    );
  } catch (err) {
    console.error('Create notification error:', err.message);
  }
}

// ── Express App ────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve frontend build if available
const distPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Garage Services API' }));

// ── Auth Middleware ─────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}

// ════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════

// ── Customer: Request OTP ──────────────────────────────────
app.post('/api/auth/customer/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Check if customer exists
    const [rows] = await db('SELECT id FROM Users WHERE email = ? AND role = \'Customer\'', [email]);

    if (rows.length === 0) {
      // Auto-create customer account (no password)
      await db(
        'INSERT INTO Users (email, full_name, role, otp, otp_expires) VALUES (?, ?, \'Customer\', ?, ?)',
        [email, email.split('@')[0], otp, otpExpires]
      );
    } else {
      await db('UPDATE Users SET otp = ?, otp_expires = ? WHERE email = ? AND role = \'Customer\'', [otp, otpExpires, email]);
    }

    const sent = await sendOTP(email, otp);
    if (!sent) return res.status(500).json({ error: 'Failed to send OTP. Check email config.' });

    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error('Customer OTP error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Customer: Verify OTP & Login ───────────────────────────
app.post('/api/auth/customer/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    const [rows] = await db(
      'SELECT * FROM Users WHERE email = ? AND role = \'Customer\' AND otp = ? AND otp_expires > NOW()',
      [email, otp]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid or expired OTP' });

    const user = rows[0];
    // Clear OTP after use
    await db('UPDATE Users SET otp = NULL, otp_expires = NULL WHERE id = ?', [user.id]);

    const token = jwt.sign({ id: user.id, email: user.email, role: 'Customer' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, role: 'Customer' },
    });
  } catch (err) {
    console.error('Customer verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Worker: Register (email + password) ────────────────────
app.post('/api/auth/worker/register', async (req, res) => {
  try {
    const { email, fullName, phone, password } = req.body;
    if (!email || !fullName || !password) return res.status(400).json({ error: 'Email, full name and password are required' });

    // Check duplicate email
    const [existing] = await db('SELECT id FROM Users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email already registered' });

    // Send OTP first for email verification
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    const hashedPw = await bcrypt.hash(password, 10);

    await db(
      'INSERT INTO Users (email, full_name, phone, password, role, approval_status, otp, otp_expires) VALUES (?, ?, ?, ?, \'Worker\', \'Pending\', ?, ?)',
      [email, fullName, phone || null, hashedPw, otp, otpExpires]
    );

    const sent = await sendOTP(email, otp);
    if (!sent) return res.status(500).json({ error: 'Failed to send OTP email' });

    res.json({ message: 'OTP sent. Verify your email to complete registration.' });
  } catch (err) {
    console.error('Worker register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Worker: Verify OTP (email verification) ────────────────
app.post('/api/auth/worker/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    const [rows] = await db(
      'SELECT * FROM Users WHERE email = ? AND role = \'Worker\' AND otp = ? AND otp_expires > NOW()',
      [email, otp]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid or expired OTP' });

    // Clear OTP
    await db('UPDATE Users SET otp = NULL, otp_expires = NULL WHERE id = ?', [rows[0].id]);

    res.json({ message: 'Email verified. Your account is pending manager approval.' });
  } catch (err) {
    console.error('Worker verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Worker: Login (email + password, must be approved) ─────
app.post('/api/auth/worker/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const [rows] = await db('SELECT * FROM Users WHERE email = ? AND role = \'Worker\'', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    if (user.approval_status !== 'Approved') {
      return res.status(403).json({ error: `Your account is ${user.approval_status === 'Pending' ? 'pending manager approval' : 'rejected'}` });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: 'Worker' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, role: 'Worker' },
    });
  } catch (err) {
    console.error('Worker login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Manager: Login (username + password) ───────────────────
app.post('/api/auth/manager/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    const [rows] = await db('SELECT * FROM Users WHERE username = ? AND role = \'Manager\'', [username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: 'Manager', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, role: 'Manager' },
    });
  } catch (err) {
    console.error('Manager login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get current user ───────────────────────────────────────
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db('SELECT id, username, email, full_name, phone, role, approval_status FROM Users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    res.json({ id: u.id, username: u.username, email: u.email, fullName: u.full_name, phone: u.phone, role: u.role, approvalStatus: u.approval_status });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Notifications ───────────────────────────────────────────
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

    const [rows] = await db(
      `SELECT n.*, b.order_id, b.status AS booking_status
       FROM Notifications n
       LEFT JOIN GarageServiceBookings b ON n.booking_id = b.id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ?`,
      [req.user.id, limit]
    );

    const [unreadRows] = await db(
      'SELECT COUNT(*) AS unread FROM Notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    res.json({
      items: rows,
      unread: Number(unreadRows[0]?.unread) || 0,
    });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await db('UPDATE Notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Read all notifications error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }

    await db(
      'UPDATE Notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [notificationId, req.user.id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Read notification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════
//  DASHBOARD  (role-scoped)
// ════════════════════════════════════════════════════════════
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const { role, id } = req.user;
    let whereClause = '';
    let params = [];

    if (role === 'Customer') {
      whereClause = 'WHERE user_id = ?';
      params = [id];
    } else if (role === 'Worker') {
      whereClause = 'WHERE (assigned_worker_id = ? OR user_id = ?)';
      params = [id, id];
    }
    // Manager sees everything (no WHERE)

    const [totalRows] = await db(`SELECT COUNT(*) as total FROM GarageServiceBookings ${whereClause}`, params);
    const [revenueRows] = await db(`SELECT COALESCE(SUM(cost), 0) as revenue FROM GarageServiceBookings ${whereClause}`, params);
    const [pendingRows] = await db(`SELECT COUNT(*) as pending FROM GarageServiceBookings ${whereClause ? whereClause + ' AND' : 'WHERE'} status = 'Pending'`, params);
    const [completedRows] = await db(`SELECT COUNT(*) as completed FROM GarageServiceBookings ${whereClause ? whereClause + ' AND' : 'WHERE'} status = 'Completed'`, params);
    const dashWhere = whereClause.replace(/\buser_id\b/g, 'b.user_id').replace(/\bassigned_worker_id\b/g, 'b.assigned_worker_id');
    const [recent] = await db(`SELECT b.*, w.full_name AS assigned_worker_name FROM GarageServiceBookings b LEFT JOIN Users w ON b.assigned_worker_id = w.id ${dashWhere} ORDER BY b.booking_date DESC LIMIT 5`, params);

    // Service summary
    const [serviceSummary] = await db(
      `SELECT service_type, COUNT(*) as count FROM GarageServiceBookings ${whereClause} GROUP BY service_type ORDER BY count DESC LIMIT 5`,
      params
    );

    res.json({
      stats: {
        total: Number(totalRows[0].total),
        revenue: Number(revenueRows[0].revenue),
        pending: Number(pendingRows[0].pending),
        completed: Number(completedRows[0].completed),
      },
      recentBookings: recent,
      serviceSummary,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════
//  BOOKINGS CRUD  (role-scoped)
// ════════════════════════════════════════════════════════════

// ── List bookings ──────────────────────────────────────────
app.get('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const { role, id } = req.user;
    const { search, status } = req.query;
    let sql = 'SELECT b.*, w.full_name AS assigned_worker_name FROM GarageServiceBookings b LEFT JOIN Users w ON b.assigned_worker_id = w.id';
    const conditions = [];
    const params = [];

    // Scope by role
    if (role === 'Customer') {
      conditions.push('b.user_id = ?');
      params.push(id);
    } else if (role === 'Worker') {
      conditions.push('(b.assigned_worker_id = ? OR b.user_id = ?)');
      params.push(id, id);
    }

    if (status && status !== 'all') {
      conditions.push('b.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(b.name LIKE ? OR b.email LIKE ? OR b.wheeler_type LIKE ? OR b.service_type LIKE ? OR b.order_id LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY b.booking_date DESC';

    const [rows] = await db(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('List bookings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Create booking ─────────────────────────────────────────
app.post('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, wheelerType, serviceType, appointmentDate, cost, notes } = req.body;
    if (!name || !email || !wheelerType || !cost) {
      return res.status(400).json({ error: 'Name, email, vehicle type, and cost are required' });
    }

    const orderId = await generateOrderId();

    let insertedId;
    if (isPostgres) {
      const { rows: inserted } = await dbPool.query(
        'INSERT INTO GarageServiceBookings (user_id, name, email, phone, wheeler_type, service_type, cost, appointment_date, notes, status, order_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, \'Pending\', $10) RETURNING id',
        [req.user.id, name, email, phone || null, wheelerType, serviceType || 'Standard', cost, appointmentDate || null, notes || null, orderId]
      );
      insertedId = inserted[0].id;
    } else {
      const [result] = await db(
        'INSERT INTO GarageServiceBookings (user_id, name, email, phone, wheeler_type, service_type, cost, appointment_date, notes, status, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "Pending", ?)',
        [req.user.id, name, email, phone || null, wheelerType, serviceType || 'Standard', cost, appointmentDate || null, notes || null, orderId]
      );
      insertedId = result.insertId;
    }

    await createNotification({
      userId: req.user.id,
      bookingId: insertedId,
      type: 'BookingCreated',
      title: `Booking submitted: ${orderId}`,
      message: `We received your ${serviceType || 'Service'} request for your ${wheelerType}. Watch for assignment and status updates here.`,
      actorId: req.user.id,
    });

    // Send confirmation email
    const bookingHtml = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#1e40af">Booking Confirmed</h2>
        <p>Hi <b>${name}</b>, your service booking has been received!</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#6b7280">Order ID</td><td style="padding:8px;font-weight:600;color:#1e40af">${orderId}</td></tr>
          <tr><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px;font-weight:600">${serviceType || 'Standard'}</td></tr>
          <tr><td style="padding:8px;color:#6b7280">Vehicle</td><td style="padding:8px;font-weight:600">${wheelerType}</td></tr>
          <tr><td style="padding:8px;color:#6b7280">Cost</td><td style="padding:8px;font-weight:600">Rs.${cost}</td></tr>
          <tr><td style="padding:8px;color:#6b7280">Status</td><td style="padding:8px;font-weight:600;color:#f59e0b">Pending</td></tr>
        </table>
        <p style="color:#6b7280;font-size:14px">We'll notify you of any updates.</p>
      </div>
    `;
    sendMail(email, 'Booking Confirmation — Garage Services', bookingHtml);

    const [booking] = await db('SELECT * FROM GarageServiceBookings WHERE id = ?', [insertedId]);
    res.status(201).json(booking[0]);
  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update booking status (Workers & Managers only) ────────
app.patch('/api/bookings/:id/status', authMiddleware, requireRole('Worker', 'Manager'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const [beforeRows] = await db('SELECT * FROM GarageServiceBookings WHERE id = ?', [req.params.id]);
    if (beforeRows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const beforeBooking = beforeRows[0];
    const previousStatus = beforeBooking.status || 'Pending';

    await db('UPDATE GarageServiceBookings SET status = ? WHERE id = ?', [status, req.params.id]);
    const [rows] = await db(
      'SELECT b.*, w.full_name AS assigned_worker_name FROM GarageServiceBookings b LEFT JOIN Users w ON b.assigned_worker_id = w.id WHERE b.id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    // Notify customer of status change
    const booking = rows[0];
    const statusColors = { Pending: '#f59e0b', Confirmed: '#3b82f6', 'In Progress': '#8b5cf6', Completed: '#10b981', Cancelled: '#ef4444' };
    sendMail(booking.email, `${booking.order_id || 'Booking #' + booking.id} — ${status}`, `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#1e40af">Booking Update</h2>
        <p>Hi <b>${booking.name}</b>, your booking <b style="color:#1e40af">${booking.order_id || '#' + booking.id}</b> status has been updated:</p>
        <p style="text-align:center;margin:20px 0"><span style="font-size:20px;font-weight:700;color:${statusColors[status] || '#1e40af'};background:#f3f4f6;padding:12px 24px;border-radius:12px">${status}</span></p>
      </div>
    `);

    const actorName = await getUserDisplayName(req.user.id, req.user.role);
    if (booking.user_id && previousStatus !== status) {
      const orderLabel = booking.order_id || `#${booking.id}`;
      await createNotification({
        userId: booking.user_id,
        bookingId: booking.id,
        type: 'StatusChanged',
        title: `Order ${orderLabel} status changed to ${status}`,
        message: `${req.user.role} ${actorName} changed your order status from ${previousStatus} to ${status}.`,
        actorId: req.user.id,
      });
    }

    // Notify assigned worker (if any) about status updates initiated by others
    const assignedWorkerId = booking.assigned_worker_id ? Number(booking.assigned_worker_id) : null;
    if (assignedWorkerId && assignedWorkerId !== req.user.id && previousStatus !== status) {
      const orderLabel = booking.order_id || `#${booking.id}`;
      await createNotification({
        userId: assignedWorkerId,
        bookingId: booking.id,
        type: 'StatusChanged',
        title: `Order ${orderLabel} status is now ${status}`,
        message: `${req.user.role} ${actorName} updated ${orderLabel} to ${status}.`,
        actorId: req.user.id,
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete booking (Workers & Managers only) ───────────────
app.delete('/api/bookings/:id', authMiddleware, requireRole('Worker', 'Manager'), async (req, res) => {
  try {
    const [rows] = await db('SELECT * FROM GarageServiceBookings WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    await db('DELETE FROM GarageServiceBookings WHERE id = ?', [req.params.id]);
    res.json({ message: 'Booking deleted' });
  } catch (err) {
    console.error('Delete booking error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Assign worker to booking (Manager only) ────────────────
app.patch('/api/bookings/:id/assign', authMiddleware, requireRole('Manager'), async (req, res) => {
  try {
    const { workerId } = req.body;
    const nextWorkerId = workerId ? Number(workerId) : null;
    if (workerId && (!Number.isInteger(nextWorkerId) || nextWorkerId <= 0)) {
      return res.status(400).json({ error: 'Invalid worker id' });
    }

    const [beforeRows] = await db('SELECT * FROM GarageServiceBookings WHERE id = ?', [req.params.id]);
    if (beforeRows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const beforeBooking = beforeRows[0];
    const previousWorkerId = beforeBooking.assigned_worker_id ? Number(beforeBooking.assigned_worker_id) : null;

    await db('UPDATE GarageServiceBookings SET assigned_worker_id = ? WHERE id = ?', [nextWorkerId, req.params.id]);
    const [rows] = await db('SELECT b.*, w.full_name AS assigned_worker_name FROM GarageServiceBookings b LEFT JOIN Users w ON b.assigned_worker_id = w.id WHERE b.id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = rows[0];
    const orderLabel = booking.order_id || `#${booking.id}`;
    const managerName = await getUserDisplayName(req.user.id, 'Manager');

    // Notify assigned worker via email
    if (nextWorkerId) {
      const [workerRows] = await db('SELECT id, email, full_name FROM Users WHERE id = ? AND role = \'Worker\'', [nextWorkerId]);
      if (workerRows.length > 0) {
        sendMail(workerRows[0].email, `New Assignment: ${booking.order_id || '#' + booking.id}`, `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
            <h2 style="color:#1e40af">New Work Assignment</h2>
            <p>Hi <b>${workerRows[0].full_name}</b>, you have been assigned a new booking:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;color:#6b7280">Order ID</td><td style="padding:8px;font-weight:600;color:#1e40af">${booking.order_id || '#' + booking.id}</td></tr>
              <tr><td style="padding:8px;color:#6b7280">Customer</td><td style="padding:8px;font-weight:600">${booking.name}</td></tr>
              <tr><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px;font-weight:600">${booking.service_type}</td></tr>
              <tr><td style="padding:8px;color:#6b7280">Vehicle</td><td style="padding:8px;font-weight:600">${booking.wheeler_type}</td></tr>
            </table>
          </div>
        `);

        await createNotification({
          userId: workerRows[0].id,
          bookingId: booking.id,
          type: 'WorkAssigned',
          title: `New assignment: ${orderLabel}`,
          message: `Manager ${managerName} assigned ${orderLabel} (${booking.service_type || 'Service'}) to you.`,
          actorId: req.user.id,
        });
      }
    }

    if (previousWorkerId && previousWorkerId !== nextWorkerId) {
      await createNotification({
        userId: previousWorkerId,
        bookingId: booking.id,
        type: 'WorkUnassigned',
        title: `Assignment updated: ${orderLabel}`,
        message: `You were unassigned from ${orderLabel} by Manager ${managerName}.`,
        actorId: req.user.id,
      });
    }

    if (booking.user_id && previousWorkerId !== nextWorkerId) {
      await createNotification({
        userId: booking.user_id,
        bookingId: booking.id,
        type: 'AssignmentChanged',
        title: `Order ${orderLabel} assignment updated`,
        message: nextWorkerId
          ? `Manager ${managerName} assigned ${booking.assigned_worker_name || 'a worker'} to your order.`
          : `Manager ${managerName} removed the assigned worker from your order.`,
        actorId: req.user.id,
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Assign worker error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════
//  WORKER MANAGEMENT  (Manager only)
// ════════════════════════════════════════════════════════════

// ── List workers (all statuses) ────────────────────────────
app.get('/api/workers', authMiddleware, requireRole('Manager'), async (req, res) => {
  try {
    const [rows] = await db(
      'SELECT id, email, full_name, phone, approval_status, created_at FROM Users WHERE role = \'Worker\' ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('List workers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── List approved workers (for assigning) ──────────────────
app.get('/api/workers/approved', authMiddleware, requireRole('Manager', 'Worker'), async (req, res) => {
  try {
    const [rows] = await db(
      'SELECT id, email, full_name, phone FROM Users WHERE role = \'Worker\' AND approval_status = \'Approved\''
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Approve / Reject worker ────────────────────────────────
app.patch('/api/workers/:id/approval', authMiddleware, requireRole('Manager'), async (req, res) => {
  try {
    const { status } = req.body; // 'Approved' or 'Rejected'
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Approved or Rejected' });
    }

    await db('UPDATE Users SET approval_status = ? WHERE id = ? AND role = \'Worker\'', [status, req.params.id]);
    const [rows] = await db('SELECT id, email, full_name, phone, approval_status FROM Users WHERE id = ?', [req.params.id]);

    if (rows.length > 0) {
      const worker = rows[0];
      const statusMsg = status === 'Approved'
        ? 'Your worker account has been <b style="color:#10b981">approved</b>! You can now log in.'
        : 'Your worker account has been <b style="color:#ef4444">rejected</b>.';
      sendMail(worker.email, `Account ${status} — Garage Services`, `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
          <h2 style="color:#1e40af">Garage Services</h2>
          <p>Hi <b>${worker.full_name}</b>,</p>
          <p>${statusMsg}</p>
        </div>
      `);
    }

    res.json(rows[0] || { message: 'Worker not found' });
  } catch (err) {
    console.error('Approve worker error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════
//  SETTINGS  (Manager only for writes)
// ════════════════════════════════════════════════════════════
app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db('SELECT setting_key, setting_value FROM Settings');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/settings', authMiddleware, requireRole('Manager'), async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      if (isPostgres) {
        await dbPool.query(
          'INSERT INTO Settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $3, updated_at = NOW()',
          [key, value, value]
        );
      } else {
        await db(
          'INSERT INTO Settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
          [key, value, value]
        );
      }
    }
    res.json({ message: 'Settings saved' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════
//  FEEDBACK
// ════════════════════════════════════════════════════════════
app.post('/api/feedback', authMiddleware, async (req, res) => {
  try {
    const { customerName, email, rating, comments } = req.body;
    if (!customerName || !email || !rating || !comments) {
      return res.status(400).json({ error: 'All feedback fields are required' });
    }
    await db(
      'INSERT INTO CustomerFeedback (user_id, name, feedback_text, rating) VALUES (?, ?, ?, ?)',
      [req.user.id, customerName, comments, rating]
    );
    res.json({ message: 'Feedback submitted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── List all feedback (Manager only) ───────────────────────
app.get('/api/feedback', authMiddleware, requireRole('Manager'), async (req, res) => {
  try {
    const [rows] = await db('SELECT * FROM CustomerFeedback ORDER BY feedback_date DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── SPA fallback (serve index.html for non-API routes) ────
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}

// ── Start ──────────────────────────────────────────────────
async function startServer() {
  try {
    if (isPostgres) {
      console.log('  Using PostgreSQL (Render)...');
      await initPostgresTables();
    } else {
      console.log('  Using MySQL (local)...');
      await ensureNotificationsTable();
    }
    const server = app.listen(PORT, () => {
      console.log(`\n  Garage Services API running on http://localhost:${PORT}\n`);
      try {
        fs.writeFileSync(portFile, String(PORT), 'utf8');
        fs.writeFileSync(pidFile, String(process.pid), 'utf8');
      } catch (err) {
        console.warn('Could not write server port/pid files:', err.message);
      }
    });
    server.on('close', () => {
      try { fs.unlinkSync(portFile); } catch (_) { /* ignore */ }
      try { fs.unlinkSync(pidFile); } catch (_) { /* ignore */ }
    });
  } catch (err) {
    console.error('Failed to initialize server:', err);
    process.exit(1);
  }
}

startServer();
