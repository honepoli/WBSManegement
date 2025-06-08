const request = require('supertest');

jest.mock('better-sqlite3', () => {
  const mockAll = jest.fn();
  const mockGet = jest.fn();
  const mockRun = jest.fn();
  const mockPrepare = jest.fn(() => ({ all: mockAll, get: mockGet, run: mockRun }));
  const mDb = { prepare: mockPrepare, exec: jest.fn() };
  const Database = jest.fn(() => mDb);
  Database.mockDb = mDb;
  Database.mockAll = mockAll;
  Database.mockGet = mockGet;
  Database.mockRun = mockRun;
  Database.mockPrepare = mockPrepare;
  return Database;
});

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token, secret, cb) => cb(null, { user_id: 1, username: 'test' }))
}));

const { app } = require('../server');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

beforeEach(() => {
  Database.mockAll.mockReset();
  Database.mockGet.mockReset();
  Database.mockRun.mockReset();
  Database.mockPrepare.mockClear();
  jwt.verify.mockClear();
});

describe('Task API', () => {
  test('GET /tasks returns tasks', async () => {
    Database.mockAll.mockReturnValue([{ task_id: 1 }]);
    const res = await request(app).get('/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ task_id: 1 }]);
  });

  test('POST /tasks creates task with auth', async () => {
    Database.mockGet.mockReturnValue({ task_id: 1, task_name: 'New' });
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', 'Bearer token')
      .send({ task_name: 'New', major_category: 'A', sub_category: 'B', assignee: 'User', planned_start_date: '2023-01-01', planned_end_date: '2023-01-02', status: '未着手' });
    expect(res.statusCode).toBe(201);
    expect(res.body.task_id).toBe(1);
  });

  test('PATCH /tasks/:id updates task', async () => {
    Database.mockGet.mockReturnValue({ task_id: 1, progress_percent: 50 });
    const res = await request(app)
      .patch('/tasks/1')
      .set('Authorization', 'Bearer token')
      .send({ progress_percent: 50 });
    expect(res.statusCode).toBe(200);
    expect(res.body.progress_percent).toBe(50);
  });

  test('DELETE /tasks/:id deletes task', async () => {
    Database.mockRun.mockReturnValue({ changes: 1 });
    const res = await request(app)
      .delete('/tasks/1')
      .set('Authorization', 'Bearer token');
    expect(res.statusCode).toBe(200);
    expect(res.body.deleted).toBe(1);
  });
});
