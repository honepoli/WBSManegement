const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const dbFile = path.join(__dirname, 'wbs.db');
const db = new sqlite3.Database(dbFile);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
const initSql = `CREATE TABLE IF NOT EXISTS tasks (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_name TEXT NOT NULL,
  major_category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  assignee TEXT NOT NULL,
  planned_start_date TEXT NOT NULL,
  planned_end_date TEXT NOT NULL,
  actual_start_date TEXT,
  actual_end_date TEXT,
  progress_percent INTEGER DEFAULT 0,
  status TEXT NOT NULL
);`;

db.serialize(() => {
  db.run(initSql);
});

// Get all tasks
app.get('/tasks', (req, res) => {
  db.all('SELECT * FROM tasks ORDER BY task_id', (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

// Create task
app.post('/tasks', (req, res) => {
  const t = req.body;
  const sql = `INSERT INTO tasks (task_name, major_category, sub_category, assignee, planned_start_date, planned_end_date, actual_start_date, actual_end_date, progress_percent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [t.task_name, t.major_category, t.sub_category, t.assignee, t.planned_start_date, t.planned_end_date, t.actual_start_date || null, t.actual_end_date || null, t.progress_percent || 0, t.status];
  db.run(sql, params, function(err){
    if (err) return res.status(500).json({error: err.message});
    db.get('SELECT * FROM tasks WHERE task_id = ?', [this.lastID], (err, row) => {
      if (err) return res.status(500).json({error: err.message});
      res.status(201).json(row);
    });
  });
});

// Update task
app.patch('/tasks/:id', (req, res) => {
  const id = req.params.id;
  const fields = ['task_name','major_category','sub_category','assignee','planned_start_date','planned_end_date','actual_start_date','actual_end_date','progress_percent','status'];
  const updates = [];
  const params = [];

  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  });
  if (updates.length === 0) return res.status(400).json({error: 'No fields to update'});
  params.push(id);
  const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE task_id = ?`;
  db.run(sql, params, function(err){
    if (err) return res.status(500).json({error: err.message});
    db.get('SELECT * FROM tasks WHERE task_id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({error: err.message});
      res.json(row);
    });
  });
});

// Delete task
app.delete('/tasks/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM tasks WHERE task_id = ?', [id], function(err){
    if (err) return res.status(500).json({error: err.message});
    res.json({deleted: this.changes});
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
