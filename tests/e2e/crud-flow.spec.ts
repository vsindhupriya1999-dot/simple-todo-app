import { test, expect, APIRequestContext } from '@playwright/test';

test.describe('TODO App E2E Tests - Create/Read/Update/Delete Flow', () => {
  let apiContext: APIRequestContext;
  const baseURL = 'http://localhost:3013';

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: baseURL,
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  // ============================================
  // E2E TEST 1: Create -> Read -> Update -> Delete Flow
  // ============================================
  test('E2E Test 1: Complete CRUD flow with single todo', async () => {
    // STEP 1: CREATE - Add a new todo
    const createResponse = await apiContext.post('/api/todos', {
      data: {
        title: 'E2E Test: Learn Playwright',
        description: 'Complete comprehensive end-to-end testing guide',
        deadline: '2025-12-31T23:59:59Z',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();
    expect(createBody.success).toBe(true);
    expect(createBody.message).toBe('Todo created successfully');

    const todoId = createBody.data.id;
    expect(todoId).toBeDefined();
    expect(createBody.data.title).toBe('E2E Test: Learn Playwright');
    expect(createBody.data.status).toBe('pending');
    expect(createBody.data.description).toBe('Complete comprehensive end-to-end testing guide');

    // STEP 2: READ - Verify the todo was created
    const getResponse = await apiContext.get(`/api/todos/${todoId}`);
    expect(getResponse.ok()).toBeTruthy();
    const getBody = await getResponse.json();
    expect(getBody.success).toBe(true);
    expect(getBody.data.title).toBe('E2E Test: Learn Playwright');
    expect(getBody.data.id).toBe(todoId);

    // STEP 3: UPDATE - Change status to in-progress
    const updateResponse = await apiContext.put(`/api/todos/${todoId}`, {
      data: {
        status: 'in-progress',
        description: 'Currently working on Playwright E2E testing',
      },
    });

    expect(updateResponse.ok()).toBeTruthy();
    const updateBody = await updateResponse.json();
    expect(updateBody.success).toBe(true);
    expect(updateBody.data.status).toBe('in-progress');
    expect(updateBody.data.description).toBe('Currently working on Playwright E2E testing');
    expect(updateBody.message).toBe('Todo updated successfully');

    // STEP 4: DELETE - Remove the todo
    const deleteResponse = await apiContext.delete(`/api/todos/${todoId}`);
    expect(deleteResponse.ok()).toBeTruthy();
    const deleteBody = await deleteResponse.json();
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.message).toBe('Todo deleted successfully');

    // STEP 5: VERIFY DELETION - Confirm the todo no longer exists
    const verifyDeleteResponse = await apiContext.get(`/api/todos/${todoId}`);
    expect(verifyDeleteResponse.status()).toBe(404);
    const verifyDeleteBody = await verifyDeleteResponse.json();
    expect(verifyDeleteBody.success).toBe(false);
    expect(verifyDeleteBody.message).toBe('Todo not found');
  });

  // ============================================
  // E2E TEST 2: Multi-todo workflow - Create multiple, filter, update statuses
  // ============================================
  test('E2E Test 2: Multi-todo workflow with filtering and status transitions', async () => {
    // STEP 1: CREATE - Generate multiple sample todos
    const generateResponse = await apiContext.post('/api/todos/generate', {
      data: {
        count: 3,
        status: 'pending',
      },
    });

    expect(generateResponse.ok()).toBeTruthy();
    const generateBody = await generateResponse.json();
    expect(generateBody.success).toBe(true);
    expect(generateBody.data.length).toBe(3);

    const generatedTodos = generateBody.data;
    const todoId1 = generatedTodos[0].id;
    const todoId2 = generatedTodos[1].id;
    const todoId3 = generatedTodos[2].id;

    // STEP 2: READ - List all todos
    const listResponse = await apiContext.get('/api/todos');
    expect(listResponse.ok()).toBeTruthy();
    const listBody = await listResponse.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data.length).toBeGreaterThanOrEqual(3);
    expect(listBody.total).toBeGreaterThanOrEqual(3);

    // STEP 3: READ - Filter by status (pending)
    const pendingFilterResponse = await apiContext.get('/api/todos/status/pending');
    expect(pendingFilterResponse.ok()).toBeTruthy();
    const pendingFilterBody = await pendingFilterResponse.json();
    expect(pendingFilterBody.success).toBe(true);
    expect(pendingFilterBody.data.length).toBeGreaterThanOrEqual(3);

    // STEP 4: UPDATE - Transition statuses (pending -> in-progress -> completed)
    const updateToInProgressResponse = await apiContext.put(`/api/todos/${todoId1}`, {
      data: { status: 'in-progress' },
    });
    expect(updateToInProgressResponse.ok()).toBeTruthy();

    const updateToCompletedResponse = await apiContext.put(`/api/todos/${todoId2}`, {
      data: { status: 'completed' },
    });
    expect(updateToCompletedResponse.ok()).toBeTruthy();

    // STEP 5: READ - Filter by status (in-progress)
    const inProgressResponse = await apiContext.get('/api/todos/status/in-progress');
    expect(inProgressResponse.ok()).toBeTruthy();
    const inProgressBody = await inProgressResponse.json();
    expect(inProgressBody.data.some((t: any) => t.id === todoId1)).toBe(true);

    // STEP 6: READ - Filter by status (completed)
    const completedResponse = await apiContext.get('/api/todos/status/completed');
    expect(completedResponse.ok()).toBeTruthy();
    const completedBody = await completedResponse.json();
    expect(completedBody.data.some((t: any) => t.id === todoId2)).toBe(true);

    // STEP 7: DELETE - Clean up created todos
    await apiContext.delete(`/api/todos/${todoId1}`);
    await apiContext.delete(`/api/todos/${todoId2}`);
    await apiContext.delete(`/api/todos/${todoId3}`);

    // STEP 8: VERIFY - Confirm todos are deleted
    const verifyId1 = await apiContext.get(`/api/todos/${todoId1}`);
    expect(verifyId1.status()).toBe(404);
  });

  // ============================================
  // E2E TEST 3: Generator info retrieval and edge cases
  // ============================================
  test('E2E Test 3: Generator functionality with validation and edge cases', async () => {
    // STEP 1: READ - Get generator information
    const generatorInfoResponse = await apiContext.get('/api/todos/generate/info');
    expect(generatorInfoResponse.ok()).toBeTruthy();
    const generatorInfoBody = await generatorInfoResponse.json();
    expect(generatorInfoBody.success).toBe(true);
    expect(generatorInfoBody.data.maxCount).toBe(15);
    expect(generatorInfoBody.data.availableTemplates).toBeGreaterThan(0);
    expect(generatorInfoBody.data.supportedStatuses).toEqual(['pending', 'in-progress', 'completed']);

    // STEP 2: CREATE - Generate single todo with keywords filter
    const singleWithKeywordsResponse = await apiContext.post('/api/todos/generate', {
      data: {
        count: 1,
        titleKeywords: ['test', 'playwright'],
      },
    });

    expect(singleWithKeywordsResponse.ok()).toBeTruthy();
    const singleWithKeywordsBody = await singleWithKeywordsResponse.json();
    expect(singleWithKeywordsBody.success).toBe(true);
    expect(singleWithKeywordsBody.data.length).toBe(1);

    // STEP 3: CREATE - Generate at max limit (15 todos)
    const maxLimitResponse = await apiContext.post('/api/todos/generate', {
      data: {
        count: 15,
      },
    });

    expect(maxLimitResponse.ok()).toBeTruthy();
    const maxLimitBody = await maxLimitResponse.json();
    expect(maxLimitBody.success).toBe(true);
    expect(maxLimitBody.data.length).toBe(15);

    // STEP 4: CREATE - Try to exceed max limit (should fail with 400)
    const exceedLimitResponse = await apiContext.post('/api/todos/generate', {
      data: {
        count: 20,
      },
    });

    expect(exceedLimitResponse.status()).toBe(400);
    const exceedLimitBody = await exceedLimitResponse.json();
    expect(exceedLimitBody.success).toBe(false);
    expect(exceedLimitBody.message).toContain('Cannot generate more than 15 todos');

    // STEP 5: CREATE - Generate with specific deadline constraint
    const deadlineConstraintResponse = await apiContext.post('/api/todos/generate', {
      data: {
        count: 2,
        maxDeadlineDays: 7,
      },
    });

    expect(deadlineConstraintResponse.ok()).toBeTruthy();
    const deadlineConstraintBody = await deadlineConstraintResponse.json();
    expect(deadlineConstraintBody.success).toBe(true);
    expect(deadlineConstraintBody.data.length).toBe(2);

    // STEP 6: DELETE - Clean up all generated todos
    const listAllResponse = await apiContext.get('/api/todos');
    const allTodos = (await listAllResponse.json()).data;
    for (const todo of allTodos) {
      await apiContext.delete(`/api/todos/${todo.id}`);
    }

    // STEP 7: VERIFY - Confirm all todos are deleted
    const finalListResponse = await apiContext.get('/api/todos');
    const finalListBody = await finalListResponse.json();
    expect(finalListBody.data.length).toBe(0);
  });
});
