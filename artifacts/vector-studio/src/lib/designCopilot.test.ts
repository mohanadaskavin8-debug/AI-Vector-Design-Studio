import { describe, it, expect } from 'vitest';
import { validateCopilotPlan, executeCopilotPlan } from './designCopilot';
import { VectorObject } from './types';

describe('designCopilot', () => {
  const dummyObjects: VectorObject[] = [
    { id: '1', type: 'rect', name: 'R1', x: 0, y: 0, width: 10, height: 10, rotation: 0, fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true, locked: false },
    { id: '2', type: 'rect', name: 'R2', x: 20, y: 0, width: 10, height: 10, rotation: 0, fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true, locked: true },
    { id: '3', type: 'rect', name: 'R3', x: 40, y: 0, width: 10, height: 10, rotation: 0, fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true, locked: false },
  ];

  it('rejects malformed plans', () => {
    expect(validateCopilotPlan(null, dummyObjects).valid).toBe(false);
    expect(validateCopilotPlan({ version: 2 }, dummyObjects).valid).toBe(false);
    expect(validateCopilotPlan({ version: 1, operations: {} }, dummyObjects).valid).toBe(false);
    expect(validateCopilotPlan({ version: 1, operations: [{ op: 'unknown' }] }, dummyObjects).valid).toBe(false);
  });

  it('validates color/url() correctly', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'update', ids: ['1'], patch: { fill: 'url(#gradient)' } }
      ]
    };
    expect(validateCopilotPlan(raw, dummyObjects).valid).toBe(false);
  });

  it('validates non-finite numbers', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'update', ids: ['1'], patch: { x: Infinity } }
      ]
    };
    expect(validateCopilotPlan(raw, dummyObjects).valid).toBe(false);
  });

  it('validates oversized inserts', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'insert', objects: Array(61).fill({ type: 'rect', x: 0, y: 0, width: 10, height: 10 }) }
      ]
    };
    expect(validateCopilotPlan(raw, dummyObjects).valid).toBe(false);
  });

  it('drops unknown ids and locked objects with warnings', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'update', ids: ['unknown'], patch: { x: 10 } },
        { op: 'delete', ids: ['2'] }
      ]
    };
    const res = validateCopilotPlan(raw, dummyObjects);
    expect(res.valid).toBe(true);
    expect(res.warnings.length).toBe(2);
    expect(res.plan?.operations.length).toBe(0); // all validIds empty
  });

  it('executes valid plan and respects counts', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'duplicate', ids: ['1'] },
        { op: 'insert', objects: [{ type: 'rect', name: 'New', x: 0, y: 0, width: 10, height: 10 }] },
        { op: 'delete', ids: ['1'] }
      ]
    };
    const { plan } = validateCopilotPlan(raw, dummyObjects);
    const result = executeCopilotPlan(dummyObjects, plan!);
    
    expect(result.summary.added).toBe(2);
    expect(result.summary.removed).toBe(1);
    expect(result.summary.changed).toBe(0);
    expect(result.objects.length).toBe(4); // 3 original - 1 deleted + 1 dup + 1 ins
    expect(result.objects.find(o => o.id === '1')).toBeUndefined();
    expect(result.selection.includes('1')).toBe(false);
  });

  it('maintains preview purity (input objects deeply unchanged)', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'update', ids: ['1'], patch: { x: 100 } }
      ]
    };
    const { plan } = validateCopilotPlan(raw, dummyObjects);
    const result = executeCopilotPlan(dummyObjects, plan!);
    
    expect(dummyObjects[0].x).toBe(0); // unchanged
    expect(result.objects[0].x).toBe(100);
  });

  it('ensures duplicate and insert create unique ids', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'duplicate', ids: ['1'] },
        { op: 'insert', objects: [{ type: 'rect', x: 0, y: 0, width: 10, height: 10 }] }
      ]
    };
    const { plan } = validateCopilotPlan(raw, dummyObjects);
    const result = executeCopilotPlan(dummyObjects, plan!);
    
    const ids = new Set(result.objects.map(o => o.id));
    expect(ids.size).toBe(result.objects.length); // no dupes
  });

  it('executes align properly', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'align', ids: ['1', '3'], alignment: 'left' }
      ]
    };
    const { plan } = validateCopilotPlan(raw, dummyObjects);
    const result = executeCopilotPlan(dummyObjects, plan!);
    
    const obj1 = result.objects.find(o => o.id === '1')!;
    const obj3 = result.objects.find(o => o.id === '3')!;
    expect(obj1.x).toBe(0);
    expect(obj3.x).toBe(0); // Left aligned to min x which is 0
  });

  it('output selection contains only surviving ids', () => {
    const raw = {
      version: 1,
      operations: [
        { op: 'select', ids: ['1', '3'] },
        { op: 'delete', ids: ['3'] }
      ]
    };
    const { plan } = validateCopilotPlan(raw, dummyObjects);
    const result = executeCopilotPlan(dummyObjects, plan!);
    
    expect(result.selection).toContain('1');
    expect(result.selection).not.toContain('3');
  });

  it('drops operations on objects outside the selection scope', () => {
    const scoped = validateCopilotPlan({
      version: 1,
      operations: [{ op: 'update', ids: ['1', '3'], patch: { fill: '#ff0000' } }]
    }, dummyObjects, ['1']);
    expect(scoped.valid).toBe(true);
    expect(scoped.plan?.operations[0].ids).toEqual(['1']);
    expect(scoped.warnings.some(w => w.includes('outside the current selection'))).toBe(true);

    const unscoped = validateCopilotPlan({
      version: 1,
      operations: [{ op: 'update', ids: ['1', '3'], patch: { fill: '#ff0000' } }]
    }, dummyObjects, null);
    expect(unscoped.plan?.operations[0].ids).toEqual(['1', '3']);
  });

  const rigidPath: VectorObject = {
    id: 'p1', type: 'path', name: 'Imported', x: 0, y: 50, width: 20, height: 20, rotation: 0,
    fill: '#123456', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true, locked: false,
    points: 'M 0 50 L 20 70 Z'
  };

  it('keeps rigid imported paths in place but applies style updates', () => {
    const objects = [...dummyObjects, rigidPath];
    const raw = { version: 1, operations: [{ op: 'update', ids: ['p1'], patch: { x: 500, fill: '#ff0000' } }] };
    const { plan } = validateCopilotPlan(raw, objects);
    const result = executeCopilotPlan(objects, plan!);
    const target = result.objects.find(o => o.id === 'p1')!;
    expect(target.x).toBe(0);
    expect(target.points).toBe('M 0 50 L 20 70 Z');
    expect(target.fill).toBe('#ff0000');
    expect(result.warnings.some(w => w.includes('cannot be moved'))).toBe(true);
    expect(result.summary.changed).toBe(1);
  });

  it('re-validating a validated plan drops newly-locked objects (apply-time rebase)', () => {
    const raw = { version: 1, operations: [{ op: 'update', ids: ['1', '3'], patch: { fill: '#ff0000' } }] };
    const first = validateCopilotPlan(raw, dummyObjects);
    expect(first.plan?.operations[0].ids).toEqual(['1', '3']);
    const relocked = dummyObjects.map(o => o.id === '3' ? { ...o, locked: true } : o);
    const second = validateCopilotPlan(first.plan!, relocked, null);
    expect(second.valid).toBe(true);
    expect(second.plan?.operations[0].ids).toEqual(['1']);
    expect(second.warnings.some(w => w.includes('locked'))).toBe(true);
  });

  it('re-validation excludes newly-locked objects from align, distribute, and ungroup', () => {
    const mkRect = (id: string, x: number): VectorObject => ({
      id, type: 'rect', name: `R${id}`, x, y: 0, width: 10, height: 10, rotation: 0,
      fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true, locked: false
    });
    const objects = [mkRect('a', 0), mkRect('b', 40), mkRect('c', 80), mkRect('d', 120)];
    const raw = {
      version: 1,
      operations: [
        { op: 'align', ids: ['a', 'b', 'c'], alignment: 'left' },
        { op: 'distribute', ids: ['a', 'b', 'c', 'd'], axis: 'x' },
        { op: 'ungroup', ids: ['a', 'b'] }
      ]
    };
    const first = validateCopilotPlan(raw, objects);
    expect(first.plan?.operations).toHaveLength(3);

    // Object 'b' gets locked while the proposal is under review.
    const relocked = objects.map(o => o.id === 'b' ? { ...o, locked: true } : o);
    const second = validateCopilotPlan(first.plan!, relocked, null);
    expect(second.valid).toBe(true);
    const ops = second.plan!.operations;
    expect(ops.find((o: any) => o.op === 'align')?.ids).toEqual(['a', 'c']);
    expect(ops.find((o: any) => o.op === 'distribute')?.ids).toEqual(['a', 'c', 'd']);
    expect(ops.find((o: any) => o.op === 'ungroup')?.ids).toEqual(['a']);
    expect(second.warnings.filter(w => w.includes('locked')).length).toBeGreaterThanOrEqual(3);
  });

  it('excludes rigid paths from align movement and duplicate', () => {
    const objects = [...dummyObjects, rigidPath];
    const raw = {
      version: 1,
      operations: [
        { op: 'align', ids: ['1', 'p1'], alignment: 'right' },
        { op: 'duplicate', ids: ['p1'] }
      ]
    };
    const { plan } = validateCopilotPlan(raw, objects);
    const result = executeCopilotPlan(objects, plan!);
    const rigid = result.objects.find(o => o.id === 'p1')!;
    expect(rigid.x).toBe(0);
    expect(rigid.y).toBe(50);
    expect(result.objects.length).toBe(objects.length); // rigid duplicate skipped
    const rect = result.objects.find(o => o.id === '1')!;
    expect(rect.x).toBe(10); // aligned to the rigid path's right edge (20) minus own width (10)
  });
});
