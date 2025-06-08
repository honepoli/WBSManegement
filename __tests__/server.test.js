const request = require('supertest');

jest.mock('pg', () => {
  const mClient = { query: jest.fn(() => Promise.resolve({ rows: [] })) };
  return { Pool: jest.fn(() => mClient) };
});

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token, secret, cb) => cb(null, { user_id: 1, username: 'test' }))
}));

const { app } = require('../server');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

beforeEach(() => {
  Pool.mockClear();
  jwt.verify.mockClear();
});

describe('Task API', () => {
  test('GET /tasks returns tasks', async () => {
    const mockPool = new Pool();
    mockPool.query.mockResolvedValue({ rows: [{ task_id: 1 }] });
    const res = await request(app).get('/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ task_id: 1 }]);
  });

  test('POST /tasks creates task with auth', async () => {
    const mockPool = new Pool();
    mockPool.query.mockResolvedValue({ rows: [{ task_id: 1, task_name: 'New' }] });
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', 'Bearer token')
      .send({ task_name: 'New', major_category: 'A', sub_category: 'B', assignee: 'User', planned_start_date: '2023-01-01', planned_end_date: '2023-01-02', status: '未着手' });
    expect(res.statusCode).toBe(201);
    expect(res.body.task_id).toBe(1);
  });

  test('PATCH /tasks/:id updates task', async () => {
    const mockPool = new Pool();
    mockPool.query.mockResolvedValue({ rows: [{ task_id: 1, progress_percent: 50 }] });
    const res = await request(app)
      .patch('/tasks/1')
      .set('Authorization', 'Bearer token')
      .send({ progress_percent: 50 });
    expect(res.statusCode).toBe(200);
    expect(res.body.progress_percent).toBe(50);
  });

  test('DELETE /tasks/:id deletes task', async () => {
    const mockPool = new Pool();
    mockPool.query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app)
      .delete('/tasks/1')
      .set('Authorization', 'Bearer token');
    expect(res.statusCode).toBe(200);
    expect(res.body.deleted).toBe(1);
  });
});
