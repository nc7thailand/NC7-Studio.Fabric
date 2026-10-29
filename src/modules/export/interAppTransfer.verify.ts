import assert from 'node:assert';
import { APP_TARGET_URLS, sendToTargetApp, type InterAppTransferOptions } from './interAppTransfer';

console.log('--- Testing Inter-App Transfer Module ---');

// 1. Verify endpoints
assert.strictEqual(APP_TARGET_URLS.pathfinder, 'https://pathfinder.nc7foamart.com/');
assert.strictEqual(APP_TARGET_URLS['3dsym'], 'https://3dfreeform.nc7foamart.com/3dsym/');
console.log('✓ Target app endpoints verified');

// 2. Empty SVG safety check
const resEmpty = sendToTargetApp({
  target: 'pathfinder',
  svgContent: '',
});
assert.strictEqual(resEmpty, null);
console.log('✓ Empty SVG safety check passed (returns null without opening tab)');

console.log('All Inter-App Transfer tests passed successfully!');
