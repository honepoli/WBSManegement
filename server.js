const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost/wbs'
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
const initSql = `
CREATE TABLE IF NOT EXISTS tasks (
  task_id SERIAL PRIMARY KEY,
  task_name TEXT NOT NULL,
  major_category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  assignee TEXT NOT NULL,
  planned_start_date DATE NOT NULL,
  planned_end_date DATE NOT NULL,
  actual_start_date DATE,
  actual_end_date DATE,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  status TEXT NOT NULL,
  parent_task_id INTEGER REFERENCES tasks(task_id),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  expires TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);`;

pool.query(initSql).catch(err => console.error('DB init error', err));

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING user_id, username',
      [username, hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const accessToken = jwt.sign({ user_id: user.user_id, username: user.username }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ user_id: user.user_id }, JWT_SECRET, { expiresIn: '7d' });
    await pool.query("INSERT INTO refresh_tokens(token, user_id, expires) VALUES ($1,$2,NOW()+INTERVAL '7 days')", [refreshToken, user.user_id]);
    res.json({ accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/refresh', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query('SELECT * FROM refresh_tokens WHERE token=$1 AND expires>NOW()', [token]);
    if (rows.length === 0) return res.status(403).json({ error: 'Invalid token' });
    const { rows: userRows } = await pool.query('SELECT user_id, username FROM users WHERE user_id=$1', [payload.user_id]);
    if (userRows.length === 0) return res.status(403).json({ error: 'Invalid token' });
    const accessToken = jwt.sign({ user_id: userRows[0].user_id, username: userRows[0].username }, JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken });
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
});

app.post('/auth/logout', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    await pool.query('DELETE FROM refresh_tokens WHERE token=$1', [token]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all tasks
app.get('/tasks', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY parent_task_id, sort_order, task_id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
app.post('/tasks', authenticateToken, async (req, res) => {
  const t = req.body;
  const sql = `INSERT INTO tasks (task_name, major_category, sub_category, assignee, planned_start_date, planned_end_date, actual_start_date, actual_end_date, progress_percent, status, parent_task_id, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`;
  const params = [
    t.task_name,
    t.major_category,
    t.sub_category,
    t.assignee,
    t.planned_start_date,
    t.planned_end_date,
    t.actual_start_date || null,
    t.actual_end_date || null,
    t.progress_percent || 0,
    t.status,
    t.parent_task_id || null,
    t.sort_order || 0
  ];
  try {
    const { rows } = await pool.query(sql, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task
app.patch('/tasks/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  const fields = ['task_name','major_category','sub_category','assignee','planned_start_date','planned_end_date','actual_start_date','actual_end_date','progress_percent','status','parent_task_id','sort_order'];
  const updates = [];
  const params = [];

  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      params.push(req.body[f]);
      updates.push(`${f} = $${params.length}`);
    }
  });
  if (updates.length === 0) return res.status(400).json({error: 'No fields to update'});
  params.push(id);
  const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE task_id = $${params.length} RETURNING *`;
  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task
app.delete('/tasks/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query('DELETE FROM tasks WHERE task_id = $1', [id]);
    res.json({ deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
