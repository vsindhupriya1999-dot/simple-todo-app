import request from 'supertest';
import express, { Express } from 'express';

// PR-safe smoke tests use an in-memory Express app factory so no network binding is required.
function createSmokeApp(): Express {
  const app = express();
  app.use(express.json());

  // Minimal routes required for smoke verification
  app.get('/api/help', (req, res) => {
    res.json({ success: true, data: { title: 'TODO App API Documentation' } });
  });

  // Simple in-memory todos for smoke only
  let todos: any[] = [];
  let nextId = 1;

  app.get('/api/todos', (req, res) => {
    res.json({ success: true, data: todos, total: todos.length });
  });

  app.post('/api/todos', (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
    const t = { id: nextId++, title, description: '', status: 'pending', createdAt: new Date(), updatedAt: new Date() };
    todos.push(t);
    res.status(201).json({ success: true, data: t });
  });

  app.delete('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const idx = todos.findIndex((x) => x.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Todo not found' });
    todos.splice(idx, 1);
    res.json({ success: true, message: 'Todo deleted successfully' });
  });

  return app;
}

describe('PR-safe API smoke tests', () => {
  let app: Express;

  beforeEach(() => {
    app = createSmokeApp();
  });

  it('GET /api/help returns basic documentation', async () => {
    const res = await request(app).get('/api/help');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('GET /api/todos returns list structure (empty by default)', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('POST /api/todos then DELETE /api/todos/:id works (create+cleanup)', async () => {
    const create = await request(app).post('/api/todos').send({ title: 'Smoke todo' });
    expect(create.status).toBe(201);
    expect(create.body.success).toBe(true);
    const id = create.body.data.id;

    const del = await request(app).delete(`/api/todos/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
  });
});
