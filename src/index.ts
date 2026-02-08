import express from 'express';
import path from 'path';
import fs from 'fs';
import { TodoGeneratorService } from './services/todoGeneratorService';

const app = express();
const PORT = process.env.PORT || 3013;

// Read version from package.json
const packageJson = require('../package.json');
const APP_VERSION = packageJson.version;

// Middleware
app.use(express.json());
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

function logDebug(message: string, ...args: any[]) {
  console.log(`[DEBUG] ${message}`, ...args);
}

// Todo interface
interface Todo {
  id: number;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  deadline?: Date; // Optional deadline field
}

// In-memory storage (you can replace this with a database)
let todos: Todo[] = [];
let nextId = 1;

// Routes

// GET /api/todos - List all todos with optional status filter
app.get('/api/todos', (req, res) => {
  const { status } = req.query;
  logDebug('Fetching todos with status filter:', status);

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
  logDebug('Fetching todo with ID:', id);

  const todo = todos.find((t) => t.id === id);

  if (!todo) {
    logDebug('Todo not found for ID:', id);
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
  logDebug('Creating new todo with:', { title, description, deadline });

  if (!title) {
    logDebug('Title is required for new todo');
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
  logDebug('New todo created:', newTodo);
  res.status(201).json({
    success: true,
    data: newTodo,
    message: 'Todo created successfully',
  });
});

// PUT /api/todos/:id - Update todo
app.put('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  logDebug('Updating todo with ID:', id);

  const todoIndex = todos.findIndex((t) => t.id === id);

  if (todoIndex === -1) {
    logDebug('Todo not found for ID:', id);
    return res.status(404).json({
      success: false,
      message: 'Todo not found',
    });
  }

  const { title, description, status, deadline } = req.body;
  logDebug('Updating todo with data:', { title, description, status, deadline });

  // Validate status if provided
  if (status && !['pending', 'in-progress', 'completed'].includes(status)) {
    logDebug('Invalid status provided:', status);
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
  logDebug('Todo updated:', { todo: todos[todoIndex] });
  res.json({
    success: true,
    data: todos[todoIndex],
    message: 'Todo updated successfully',
  });
});

// DELETE /api/todos/:id - Delete todo
app.delete('/api/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  logDebug('Deleting todo with ID:', id);

  const todoIndex = todos.findIndex((t) => t.id === id);

  if (todoIndex === -1) {
    logDebug('Todo not found for ID:', id);
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

// GET /api/todos/status/:status - Filter todos by status
app.get('/api/todos/status/:status', (req, res) => {
  const { status } = req.params;
  logDebug('Filtering todos by status:', status);

  if (!['pending', 'in-progress', 'completed'].includes(status)) {
    logDebug('Invalid status provided:', status);
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

// GET /api/help - API documentation
app.get('/api/help', (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'TODO App API Documentation',
      version: APP_VERSION,
      description: 'A simple REST API for managing TODO items',
      endpoints: {
        'GET /api/todos': {
          description: 'List all todos with optional status filter',
          parameters: {
            status: 'optional query parameter (pending|in-progress|completed)',
          },
          example: 'GET /api/todos?status=pending',
        },
        'POST /api/todos': {
          description: 'Create a new todo. Only title is required, description and deadline are optional.',
          body: {
            title: 'required - string',
            description: 'optional - string',
            deadline: 'optional - string (ISO date format, e.g. "2025-07-31T23:59:59Z")',
          },
          example: '{"title": "Buy groceries", "description": "Milk, bread, eggs", "deadline": "2025-07-31T23:59:59Z"}',
        },
        'GET /api/todos/:id': {
          description: 'Get a specific todo by ID',
          parameters: {
            id: 'required path parameter - number',
          },
          example: 'GET /api/todos/1',
        },
        'PUT /api/todos/:id': {
          description: 'Update a todo. All fields are optional - only provide the fields you want to update.',
          parameters: {
            id: 'required path parameter - number',
          },
          body: {
            title: 'optional - string',
            description: 'optional - string',
            status: 'optional - string (pending|in-progress|completed)',
            deadline: 'optional - string (ISO date format, e.g. "2025-07-31T23:59:59Z")',
          },
          example: '{"status": "completed", "deadline": "2025-07-31T23:59:59Z"}',
        },
        'DELETE /api/todos/:id': {
          description: 'Delete a todo',
          parameters: {
            id: 'required path parameter - number',
          },
          example: 'DELETE /api/todos/1',
        },
        'GET /api/todos/status/:status': {
          description: 'Filter todos by status',
          parameters: {
            status: 'required path parameter (pending|in-progress|completed)',
          },
          example: 'GET /api/todos/status/completed',
        },
        'POST /api/todos/generate': {
          description: 'Generate sample todos from predefined templates',
          body: {
            count: 'optional - number (1-15, default: 1)',
            status: 'optional - string (pending|in-progress|completed)',
            titleKeywords: 'optional - array of strings to filter templates',
            maxDeadlineDays: 'optional - number (maximum deadline days from now)',
            randomizeCreationDate: 'optional - boolean (randomize creation dates, default: true)',
            maxCreationDaysAgo: 'optional - number (maximum days ago for creation date, default: 30)',
          },
          example:
            '{"count": 3, "status": "pending", "titleKeywords": ["review", "test"], "randomizeCreationDate": false, "maxCreationDaysAgo": 14}',
        },
        'GET /api/todos/generate/info': {
          description: 'Get information about todo generator capabilities and statistics',
          example: 'GET /api/todos/generate/info',
        },
      },
      statusCodes: {
        '200': 'Success',
        '201': 'Created',
        '400': 'Bad Request',
        '404': 'Not Found',
        '500': 'Internal Server Error',
      },
    },
  });
});

// GET /api/about - API information
app.get('/api/about', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'TODO App API',
      version: APP_VERSION,
      description: 'A simple REST API for managing TODO App items with status tracking',
      author: 'jaktestowac.pl',
      created: '2025-07-05',
      features: [
        'Create, read, update, delete todos',
        'Status management (pending, in-progress, completed)',
        'Filter todos by status',
        'In-memory storage',
        'RESTful API design',
        'Sample todo generation',
        'Deadline tracking',
      ],
      technology: {
        runtime: 'Node.js',
        framework: 'Express.js',
        language: 'TypeScript',
      },
      endpoints: {
        total: 9,
        available: [
          '/api/todos',
          '/api/todos/:id',
          '/api/todos/status/:status',
          '/api/todos/generate',
          '/api/help',
          '/api/about',
        ],
      },
    },
  });
});

// POST /api/todos/generate - Generate sample todos
app.post('/api/todos/generate', (req, res) => {
  logDebug('Generating todos with params:', req.body);

  // Generate todos using the service (which handles validation internally)
  const nextIdRef = { value: nextId };
  const result = TodoGeneratorService.generateTodos(req.body, nextIdRef, todos);

  // Update nextId
  nextId = nextIdRef.value;

  if (result.success) {
    logDebug('Generated todos:', result.data);
    res.status(201).json(result);
  } else {
    res.status(400).json(result);
  }
});

// GET /api/todos/generate/info - Get todo generator information
app.get('/api/todos/generate/info', (req, res) => {
  logDebug('Getting todo generator information');

  const info = TodoGeneratorService.getGenerationInfo();

  res.json({
    success: true,
    data: info,
    message: 'Todo generator information retrieved successfully',
  });
});

const server = app.listen(PORT, () => {
  var address = server.address();
  if (address && typeof address === 'object') {
    address = address.address == '::' ? 'localhost' : address.address;
    console.log(`\n🚀 TODO App API v${APP_VERSION} is running!`);
    console.log(`Visit it on -> http://${address}:${PORT}`);
    console.log(`Server is running on port ${PORT}`);
    console.log('\nAPI Endpoints:');
    console.log('GET    /api/todos - List all todos (optional ?status=pending|in-progress|completed)');
    console.log('POST   /api/todos - Add new todo');
    console.log('PUT    /api/todos/:id - Update todo');
    console.log('DELETE /api/todos/:id - Delete todo');
    console.log('GET    /api/todos/:id - Get specific todo');
    console.log('GET    /api/todos/status/:status - Filter by status');
    console.log('POST   /api/todos/generate - Generate sample todos');
    console.log('GET    /api/todos/generate/info - Get generator information');
    console.log('GET    /api/help - API documentation');
    console.log('GET    /api/about - API information');
  }
});
