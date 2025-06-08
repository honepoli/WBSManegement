const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// simple in-memory storage for SSE clients
const clients = [];

const ALLOWED_STATUSES = ['未着手', '進行中', '遅延', '完了', '保留'];

function validateTaskFields(task) {
  if (task.progress_percent !== undefined) {
    const p = Number(task.progress_percent);
    if (isNaN(p) || p < 0 || p > 100) {
      return { error: 'Invalid progress_percent' };
    }
  }
  if (task.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(task.status)) {
      return { error: 'Invalid status' };
    }
  }
  return null;
}

const app = express();
const db = new Database(path.join(__dirname, 'wbs.db'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SSE endpoint for task change notifications
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  clients.push(res);
  req.on('close', () => {
    const idx = clients.indexOf(res);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => c.write(payload));
}

// Initialize database
const initSql = `
CREATE TABLE IF NOT EXISTS tasks (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  expires DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);`;

try {
  db.exec(initSql);
} catch (err) {
  console.error('DB init error', err);
}

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
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?,?) RETURNING user_id, username');
    const user = stmt.get(username, hash);
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const accessToken = jwt.sign({ user_id: user.user_id, username: user.username }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ user_id: user.user_id }, JWT_SECRET, { expiresIn: '7d' });
    db.prepare("INSERT INTO refresh_tokens(token, user_id, expires) VALUES (?, ?, datetime('now','+7 days'))").run(refreshToken, user.user_id);
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
    const rToken = db.prepare("SELECT * FROM refresh_tokens WHERE token=? AND expires>datetime('now')").get(token);
    if (!rToken) return res.status(403).json({ error: 'Invalid token' });
    const userRow = db.prepare('SELECT user_id, username FROM users WHERE user_id=?').get(payload.user_id);
    if (!userRow) return res.status(403).json({ error: 'Invalid token' });
    const accessToken = jwt.sign({ user_id: userRow.user_id, username: userRow.username }, JWT_SECRET, { expiresIn: '15m' });
    res.json({ accessToken });
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
});

app.post('/auth/logout', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    db.prepare('DELETE FROM refresh_tokens WHERE token=?').run(token);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all tasks
app.get('/tasks', async (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM tasks ORDER BY parent_task_id, sort_order, task_id').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
app.post('/tasks', authenticateToken, async (req, res) => {
  const t = req.body;
  const validation = validateTaskFields(t);
  if (validation) return res.status(400).json(validation);
  const sql = `INSERT INTO tasks (task_name, major_category, sub_category, assignee, planned_start_date, planned_end_date, actual_start_date, actual_end_date, progress_percent, status, parent_task_id, sort_order)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`;
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
    const task = db.prepare(sql).get(params);
    res.status(201).json(task);
    broadcast('taskCreated', task);
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

  const validation = validateTaskFields(req.body);
  if (validation) return res.status(400).json(validation);

  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      params.push(req.body[f]);
      updates.push(`${f} = ?`);
    }
  });
  if (updates.length === 0) return res.status(400).json({error: 'No fields to update'});
  params.push(id);
  const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE task_id = ? RETURNING *`;
  try {
    const task = db.prepare(sql).get(params);
    res.json(task);
    broadcast('taskUpdated', task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task
app.delete('/tasks/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    const result = db.prepare('DELETE FROM tasks WHERE task_id = ?').run(id);
    res.json({ deleted: result.changes });
    broadcast('taskDeleted', { task_id: Number(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

module.exports = { app, db };
