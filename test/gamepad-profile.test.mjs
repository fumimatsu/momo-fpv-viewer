import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(rootDir, 'gamepad-profile.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const profiles = context.window.FpvGamepadProfiles;

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test('gamepad identity uses VID and PID across browser ID formats', () => {
  const chrome = profiles.parseGamepadIdentity(
    'Logitech G923 (Vendor: 046d Product: c266)',
  );
  const windows = profiles.parseGamepadIdentity(
    'HID\\VID_044F&PID_B66D',
  );
  const firefox = profiles.parseGamepadIdentity('045e-02ff-Xbox One Controller');

  assert.equal(chrome.key, 'vid:046d:pid:c266');
  assert.equal(windows.key, 'vid:044f:pid:b66d');
  assert.equal(firefox.key, 'vid:045e:pid:02ff');
});

test('gamepad profiles remain separate for products from the same vendor', () => {
  const storage = createStorage();
  let store = profiles.load(storage);
  store = profiles.saveProfile(storage, store, 'vid:046d:pid:c266', {
    steeringAxis: 0,
    steeringCenter: 0.1,
  });
  store = profiles.saveProfile(storage, store, 'vid:046d:pid:c267', {
    steeringAxis: 2,
    steeringCenter: -0.2,
  });

  const loaded = profiles.load(storage);
  assert.equal(loaded.activeProfileKey, 'vid:046d:pid:c267');
  assert.equal(loaded.profiles['vid:046d:pid:c266'].steeringAxis, 0);
  assert.equal(loaded.profiles['vid:046d:pid:c267'].steeringAxis, 2);
});

test('gamepad ID is used when the browser does not expose VID and PID', () => {
  const identity = profiles.parseGamepadIdentity('Custom Racing Wheel');
  assert.equal(identity.key, 'id:custom racing wheel');
  assert.equal(identity.vendorId, '');
  assert.equal(identity.productId, '');
});
