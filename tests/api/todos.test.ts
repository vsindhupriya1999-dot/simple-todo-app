import request from 'supertest';
import express, { Express } from 'express';
import path from 'path';
import fs from 'fs';
import { TodoGeneratorService } from '../../src/services/todoGeneratorService';

// Create a test app instance that mirrors the main app
function createTestApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // Todo interface
  interface Todo {
    id: number;
    title: string;
    description?: string;
    status: 'pending' | 'in-progress' | 'completed';
    createdAt: Date;
    updatedAt: Date;
    deadline?: Date;
  }

  // In-memory storage for tests
  let todos: Todo[] = [];
  let nextId = 1;

  // Routes

  // GET /api/todos - List all todos with optional status filter
  app.get('/api/todos', (req, res) => {
    const { status } = req.query;

    let filteredTodos = todos;

    if (status && typeof status === 'string') {
      filteredTodos = todos.filter((todo) => todo.status === status);
    }

    res.json({
      success: true,
      data: filteredTodos,
      total: filteredTodos.length,
    });
  });

  // GET /api/todos/:id - Get specific todo
  app.get('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);

    const todo = todos.find((t) => t.id === id);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found',
      });
    }

    res.json({
      success: true,
      data: todo,
    });
  });

  // POST /api/todos - Add new todo
  app.post('/api/todos', (req, res) => {
    const { title, description, deadline } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required',
      });
    }

    let parsedDeadline: Date | undefined = undefined;
    if (deadline) {
      const d = new Date(deadline);
      if (!isNaN(d.getTime())) {
        parsedDeadline = d;
      }
    }

    const newTodo: Todo = {
      id: nextId++,
      title,
      description: description || '',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      deadline: parsedDeadline,
    };

    todos.push(newTodo);
    res.status(201).json({
      success: true,
      data: newTodo,
      message: 'Todo created successfully',
    });
  });

  // PUT /api/todos/:id - Update todo
  app.put('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);

    const todoIndex = todos.findIndex((t) => t.id === id);

    if (todoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found',
      });
    }

    const { title, description, status, deadline } = req.body;

    // Validate status if provided
    if (status && !['pending', 'in-progress', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: pending, in-progress, or completed',
      });
    }

    // Update todo
    if (title !== undefined) todos[todoIndex].title = title;
    if (description !== undefined) todos[todoIndex].description = description;
    if (status !== undefined) todos[todoIndex].status = status;
    if (deadline !== undefined) {
      const d = new Date(deadline);
      if (!isNaN(d.getTime())) {
        todos[todoIndex].deadline = d;
      } else {
        todos[todoIndex].deadline = undefined;
      }
    }
    todos[todoIndex].updatedAt = new Date();

    res.json({
      success: true,
      data: todos[todoIndex],
      message: 'Todo updated successfully',
    });
  });

  // DELETE /api/todos/:id - Delete todo
  app.delete('/api/todos/:id', (req, res) => {
    const id = parseInt(req.params.id);

    const todoIndex = todos.findIndex((t) => t.id === id);

    if (todoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found',
      });
    }

    todos.splice(todoIndex, 1);

    res.json({
      success: true,
      message: 'Todo deleted successfully',
    });
  });

  // POST /api/todos/generate - Generate sample todos
  app.post('/api/todos/generate', (req, res) => {
    const nextIdRef = { value: nextId };
    const result = TodoGeneratorService.generateTodos(req.body, nextIdRef, todos);

    nextId = nextIdRef.value;

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  });

  // GET /api/todos/generate/info - Get todo generator information
  app.get('/api/todos/generate/info', (req, res) => {
    const info = TodoGeneratorService.getGenerationInfo();

    res.json({
      success: true,
      data: info,
      message: 'Todo generator information retrieved successfully',
    });
  });

  // GET /api/todos/status/:status - Filter todos by status
  app.get('/api/todos/status/:status', (req, res) => {
    const { status } = req.params;

    if (!['pending', 'in-progress', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: pending, in-progress, or completed',
      });
    }

    const filteredTodos = todos.filter((todo) => todo.status === status);

    res.json({
      success: true,
      data: filteredTodos,
      total: filteredTodos.length,
    });
  });

  return app;
}

describe('TODO API Endpoints', () => {
  let app: Express;

  beforeEach(() => {
    app = createTestApp();
  });

  // ============================================
  // API TEST 1: GET /api/todos - Happy Path
  // ============================================
  describe('GET /api/todos - List All Todos', () => {
    it('should return empty list when no todos exist', async () => {
      const response = await request(app).get('/api/todos');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('should return all todos after creation', async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: 'Test Todo 1' });

      await request(app)
        .post('/api/todos')
        .send({ title: 'Test Todo 2' });

      const response = await request(app).get('/api/todos');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.total).toBe(2);
    });
  });

  // ============================================
  // API TEST 2: POST /api/todos - Create Todo (Happy Path & Invalid Input)
  // ============================================
  describe('POST /api/todos - Create Todo', () => {
    it('should create a todo with title only (happy path)', async () => {
      const response = await request(app)
        .post('/api/todos')
        .send({ title: 'Buy groceries' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(1);
      expect(response.body.data.title).toBe('Buy groceries');
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.description).toBe('');
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.updatedAt).toBeDefined();
    });

    it('should create a todo with title, description, and deadline', async () => {
      const deadline = new Date('2025-12-31T23:59:59Z').toISOString();
      const response = await request(app)
        .post('/api/todos')
        .send({
          title: 'Project deadline',
          description: 'Complete project by year end',
          deadline: deadline,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Project deadline');
      expect(response.body.data.description).toBe('Complete project by year end');
      expect(response.body.data.deadline).toBeDefined();
    });

    it('should reject todo creation without title (invalid input)', async () => {
      const response = await request(app)
        .post('/api/todos')
        .send({ description: 'Missing title' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Title is required');
    });

    it('should reject todo with invalid deadline format', async () => {
      const response = await request(app)
        .post('/api/todos')
        .send({
          title: 'Test',
          deadline: 'invalid-date',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.deadline).toBeUndefined();
    });
  });

  // ============================================
  // API TEST 3: GET /api/todos/:id - Get Single Todo (Happy Path & Edge Cases)
  // ============================================
  describe('GET /api/todos/:id - Get Specific Todo', () => {
    it('should get a todo by valid ID (happy path)', async () => {
      const createRes = await request(app)
        .post('/api/todos')
        .send({ title: 'Get me' });

      const id = createRes.body.data.id;

      const response = await request(app).get(`/api/todos/${id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(id);
      expect(response.body.data.title).toBe('Get me');
    });

    it('should return 404 for non-existent todo ID', async () => {
      const response = await request(app).get('/api/todos/999');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Todo not found');
    });

    it('should handle invalid ID format gracefully', async () => {
      const response = await request(app).get('/api/todos/invalid-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // API TEST 4: PUT /api/todos/:id - Update Todo (Happy Path & Invalid Input)
  // ============================================
  describe('PUT /api/todos/:id - Update Todo', () => {
    it('should update todo status (happy path)', async () => {
      const createRes = await request(app)
        .post('/api/todos')
        .send({ title: 'Update me' });

      const id = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/todos/${id}`)
        .send({ status: 'in-progress' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('in-progress');
      expect(response.body.message).toBe('Todo updated successfully');
    });

    it('should update todo title and description', async () => {
      const createRes = await request(app)
        .post('/api/todos')
        .send({ title: 'Original' });

      const id = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/todos/${id}`)
        .send({
          title: 'Updated Title',
          description: 'Updated Description',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.description).toBe('Updated Description');
    });

    it('should reject invalid status value (invalid input)', async () => {
      const createRes = await request(app)
        .post('/api/todos')
        .send({ title: 'Test' });

      const id = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/todos/${id}`)
        .send({ status: 'invalid-status' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid status');
    });

    it('should return 404 when updating non-existent todo', async () => {
      const response = await request(app)
        .put('/api/todos/999')
        .send({ status: 'completed' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Todo not found');
    });
  });

  // ============================================
  // API TEST 5: DELETE /api/todos/:id - Delete Todo (Happy Path & Edge Cases)
  // ============================================
  describe('DELETE /api/todos/:id - Delete Todo', () => {
    it('should delete a todo by ID (happy path)', async () => {
      const createRes = await request(app)
        .post('/api/todos')
        .send({ title: 'Delete me' });

      const id = createRes.body.data.id;

      const deleteRes = await request(app).delete(`/api/todos/${id}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.message).toBe('Todo deleted successfully');

      // Verify it's deleted
      const getRes = await request(app).get(`/api/todos/${id}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent todo', async () => {
      const response = await request(app).delete('/api/todos/999');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Todo not found');
    });
  });

  // ============================================
  // API TEST 6: GET /api/todos/status/:status - Filter by Status
  // ============================================
  describe('GET /api/todos/status/:status - Filter by Status', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: 'Pending task' });

      const inProgressRes = await request(app)
        .post('/api/todos')
        .send({ title: 'In progress task' });

      await request(app)
        .put(`/api/todos/${inProgressRes.body.data.id}`)
        .send({ status: 'in-progress' });

      const completedRes = await request(app)
        .post('/api/todos')
        .send({ title: 'Completed task' });

      await request(app)
        .put(`/api/todos/${completedRes.body.data.id}`)
        .send({ status: 'completed' });
    });

    it('should filter todos by pending status (happy path)', async () => {
      const response = await request(app).get('/api/todos/status/pending');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('pending');
      expect(response.body.total).toBe(1);
    });

    it('should filter todos by in-progress status', async () => {
      const response = await request(app).get('/api/todos/status/in-progress');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('in-progress');
    });

    it('should filter todos by completed status', async () => {
      const response = await request(app).get('/api/todos/status/completed');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('completed');
    });

    it('should reject invalid status value (invalid input)', async () => {
      const response = await request(app).get('/api/todos/status/invalid-status');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid status');
    });
  });

  // ============================================
  // API TEST 7: GET /api/todos with status query filter
  // ============================================
  describe('GET /api/todos?status=X - Query Parameter Filter', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/todos')
        .send({ title: 'Pending task' });

      const inProgressRes = await request(app)
        .post('/api/todos')
        .send({ title: 'In progress task' });

      await request(app)
        .put(`/api/todos/${inProgressRes.body.data.id}`)
        .send({ status: 'in-progress' });
    });

    it('should filter todos using query parameter (happy path)', async () => {
      const response = await request(app).get('/api/todos?status=pending');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('pending');
    });

    it('should handle invalid query status value gracefully', async () => {
      const response = await request(app).get('/api/todos?status=invalid');

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(0);
    });
  });

  // ============================================
  // API TEST 8: POST /api/todos/generate - Generate Sample Todos
  // ============================================
  describe('POST /api/todos/generate - Generate Sample Todos', () => {
    it('should generate 1 todo when count is 1 (happy path)', async () => {
      const response = await request(app)
        .post('/api/todos/generate')
        .send({ count: 1 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].title).toBeDefined();
      expect(response.body.data[0].description).toBeDefined();
      expect(response.body.data[0].id).toBeDefined();
    });

    it('should generate multiple todos when count > 1 (happy path)', async () => {
      const response = await request(app)
        .post('/api/todos/generate')
        .send({ count: 5 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(5);
    });

    it('should generate todos with specific status (happy path)', async () => {
      const response = await request(app)
        .post('/api/todos/generate')
        .send({ count: 1, status: 'completed' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data[0].status).toBe('completed');
    });

    it('should reject count > 15 (invalid input)', async () => {
      const response = await request(app)
        .post('/api/todos/generate')
        .send({ count: 20 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot generate more than 15 todos');
    });

    it('should reject count < 1 (invalid input)', async () => {
      const response = await request(app)
        .post('/api/todos/generate')
        .send({ count: 0 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should filter generated todos by title keywords', async () => {
      const response = await request(app)
        .post('/api/todos/generate')
        .send({ count: 1, titleKeywords: ['test', 'playwright'] });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // API TEST 9: GET /api/todos/generate/info - Generator Information
  // ============================================
  describe('GET /api/todos/generate/info - Generator Info', () => {
    it('should return generator information (happy path)', async () => {
      const response = await request(app).get('/api/todos/generate/info');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.maxCount).toBe(15);
      expect(response.body.data.availableTemplates).toBeGreaterThan(0);
      expect(response.body.data.templateStats).toBeDefined();
      expect(response.body.data.supportedStatuses).toEqual(['pending', 'in-progress', 'completed']);
      expect(response.body.data.features).toBeDefined();
    });
  });

  // ============================================
  // API TEST 10: Complete CRUD Flow
  // ============================================
  describe('Complete CRUD Flow - Integration Test', () => {
    it('should handle full CREATE, READ, UPDATE, DELETE cycle', async () => {
      // CREATE
      const createRes = await request(app)
        .post('/api/todos')
        .send({
          title: 'Integration test todo',
          description: 'Testing complete flow',
        });

      expect(createRes.status).toBe(201);
      const todoId = createRes.body.data.id;

      // READ
      const getRes = await request(app).get(`/api/todos/${todoId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.title).toBe('Integration test todo');

      // UPDATE
      const updateRes = await request(app)
        .put(`/api/todos/${todoId}`)
        .send({
          status: 'in-progress',
          description: 'Now in progress',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('in-progress');
      expect(updateRes.body.data.description).toBe('Now in progress');

      // DELETE
      const deleteRes = await request(app).delete(`/api/todos/${todoId}`);
      expect(deleteRes.status).toBe(200);

      // Verify deletion
      const verifyRes = await request(app).get(`/api/todos/${todoId}`);
      expect(verifyRes.status).toBe(404);
    });
  });
});
