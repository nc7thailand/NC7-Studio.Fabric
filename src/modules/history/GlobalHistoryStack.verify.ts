import assert from 'node:assert';
import { globalHistory, type HistoryAdapter, type SerializedFabricObject } from './GlobalHistoryStack';

console.log('--- Testing GlobalHistoryStack Batch Delete & Undo/Redo ---');

const restoredObjects: SerializedFabricObject[] = [];
const removedIds: string[] = [];
let selectedId: string | null = null;
let selectedIds: string[] = [];

const mockAdapter: HistoryAdapter = {
  restoreObjectState: () => {},
  removeObject: (id: string) => {
    removedIds.push(id);
  },
  restoreDeletedObject: async (entry) => {
    restoredObjects.push(entry);
  },
  restoreAddedObject: async () => {},
  selectObject: (id) => {
    selectedId = id;
  },
  selectObjects: (ids) => {
    selectedIds = ids;
  },
};

// 1. Reset history
globalHistory.reset();
assert.strictEqual(globalHistory.canUndo(), false);
assert.strictEqual(globalHistory.canRedo(), false);

// 2. Record batch delete of 3 objects
const fakeScenes = [
  { id: 'obj-1', name: 'circle.svg', fabricRef: { toObject: () => ({ type: 'circle' }) } as any },
  { id: 'obj-2', name: 'rect.svg', fabricRef: { toObject: () => ({ type: 'rect' }) } as any },
  { id: 'obj-3', name: 'star.svg', fabricRef: { toObject: () => ({ type: 'path' }) } as any },
];

globalHistory.recordBatchDelete(fakeScenes);
assert.strictEqual(globalHistory.canUndo(), true);
assert.strictEqual(globalHistory.getState().label, 'Undo: Restore Deleted Objects');

// 3. Test Undo
await globalHistory.undo(mockAdapter);
assert.strictEqual(restoredObjects.length, 3);
assert.deepStrictEqual(restoredObjects.map((o) => o.id), ['obj-1', 'obj-2', 'obj-3']);
assert.deepStrictEqual(selectedIds, ['obj-1', 'obj-2', 'obj-3']);
assert.strictEqual(globalHistory.canRedo(), true);
assert.strictEqual(globalHistory.getState().redoLabel, 'Redo: Delete Objects');
console.log('✓ Batch delete Undo passed (all 3 objects restored and selected)');

// 4. Test Redo
await globalHistory.redo(mockAdapter);
assert.strictEqual(removedIds.length, 3);
assert.deepStrictEqual(removedIds, ['obj-1', 'obj-2', 'obj-3']);
assert.strictEqual(globalHistory.canUndo(), true);
assert.strictEqual(globalHistory.canRedo(), false);
console.log('✓ Batch delete Redo passed (all 3 objects removed again)');

console.log('All GlobalHistoryStack batch delete tests passed successfully!');
