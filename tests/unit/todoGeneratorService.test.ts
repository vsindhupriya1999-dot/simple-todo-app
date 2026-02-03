import { TodoGeneratorService } from '../../src/services/todoGeneratorService';

type Status = 'pending' | 'in-progress' | 'completed';

describe('TodoGeneratorService', () => {
  // ============================================
  // UNIT TEST 1: validateRequest - Valid Input
  // ============================================
  describe('validateRequest - Happy Path', () => {
    it('should validate a request with valid count parameter', () => {
      const request = { count: 5 };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a request with valid status parameter', () => {
      const request = { status: 'pending' as Status };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a request with multiple valid parameters', () => {
      const request = {
        count: 3,
        status: 'in-progress' as Status,
        titleKeywords: ['test', 'review'],
        maxDeadlineDays: 14,
        randomizeCreationDate: true,
        maxCreationDaysAgo: 30,
      };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate an empty request object', () => {
      const request = {};
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // ============================================
  // UNIT TEST 2: validateRequest - Invalid Count
  // ============================================
  describe('validateRequest - Count Validation (Edge Cases & Invalid Inputs)', () => {
    it('should reject count greater than MAX_GENERATION_COUNT (15)', () => {
      const request = { count: 16 };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Count must be a number between 1 and 15');
    });

    it('should reject count of 0', () => {
      const request = { count: 0 };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Count must be a number between 1 and 15');
    });

    it('should reject negative count', () => {
      const request = { count: -5 };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Count must be a number between 1 and 15');
    });

    it('should reject non-numeric count', () => {
      const request = { count: 'five' as any };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Count must be a number between 1 and 15');
    });
  });

  // ============================================
  // UNIT TEST 3: validateRequest - Invalid Status
  // ============================================
  describe('validateRequest - Status Validation (Edge Cases & Invalid Inputs)', () => {
    it('should reject invalid status value', () => {
      const request = { status: 'invalid-status' as any };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Status must be one of: pending, in-progress, completed');
    });

    it('should reject status as number', () => {
      const request = { status: 123 as any };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Status must be one of: pending, in-progress, completed');
    });

    it('should accept all valid status values', () => {
      const statuses: Status[] = ['pending', 'in-progress', 'completed'];
      statuses.forEach((status) => {
        const request = { status: status as any };
        const result = TodoGeneratorService.validateRequest(request);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  // ============================================
  // UNIT TEST 4: validateRequest - Invalid Arrays & Number Params
  // ============================================
  describe('validateRequest - Array & Number Parameters (Edge Cases & Invalid Inputs)', () => {
    it('should reject titleKeywords if not an array', () => {
      const request = { titleKeywords: 'not-an-array' as any };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('titleKeywords must be an array of strings');
    });

    it('should reject titleKeywords with non-string elements', () => {
      const request = { titleKeywords: ['valid', 123, 'string'] as any };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('titleKeywords must be an array of strings');
    });

    it('should reject negative maxDeadlineDays', () => {
      const request = { maxDeadlineDays: -5 };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maxDeadlineDays must be a positive number');
    });

    it('should reject maxDeadlineDays as string', () => {
      const request = { maxDeadlineDays: '10' as any };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maxDeadlineDays must be a positive number');
    });

    it('should reject non-boolean randomizeCreationDate', () => {
      const request = { randomizeCreationDate: 'true' as any };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('randomizeCreationDate must be a boolean');
    });

    it('should reject negative maxCreationDaysAgo', () => {
      const request = { maxCreationDaysAgo: -10 };
      const result = TodoGeneratorService.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maxCreationDaysAgo must be a positive number');
    });
  });

  // ============================================
  // UNIT TEST 5: getGenerationInfo - Statistics & Metadata
  // ============================================
  describe('getGenerationInfo - Happy Path & Edge Cases', () => {
    it('should return generation info with correct max count', () => {
      const info = TodoGeneratorService.getGenerationInfo();
      expect(info.maxCount).toBe(15);
    });

    it('should return generation info with available templates', () => {
      const info = TodoGeneratorService.getGenerationInfo();
      expect(info.availableTemplates).toBeGreaterThan(0);
      expect(typeof info.availableTemplates).toBe('number');
    });

    it('should return generation info with template stats', () => {
      const info = TodoGeneratorService.getGenerationInfo();
      expect(info.templateStats).toBeDefined();
      expect(info.templateStats.total).toBeGreaterThan(0);
      expect(info.templateStats.byStatus).toBeDefined();
      expect(info.templateStats.byStatus.pending).toBeGreaterThanOrEqual(0);
      expect(info.templateStats.byStatus['in-progress']).toBeGreaterThanOrEqual(0);
      expect(info.templateStats.byStatus.completed).toBeGreaterThanOrEqual(0);
    });

    it('should return generation info with supported statuses', () => {
      const info = TodoGeneratorService.getGenerationInfo();
      expect(info.supportedStatuses).toEqual(['pending', 'in-progress', 'completed']);
    });

    it('should return generation info with features list', () => {
      const info = TodoGeneratorService.getGenerationInfo();
      expect(Array.isArray(info.features)).toBe(true);
      expect(info.features.length).toBeGreaterThan(0);
      expect(info.features[0]).toContain('Generate');
    });

    it('should return generation info with randomization options', () => {
      const info = TodoGeneratorService.getGenerationInfo();
      expect(info.randomizationOptions).toBeDefined();
      expect(info.randomizationOptions.randomizeCreationDate).toBeDefined();
      expect(info.randomizationOptions.maxCreationDaysAgo).toBeDefined();
    });
  });
});
