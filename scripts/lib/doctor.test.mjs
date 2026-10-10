import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { findHubModel } from './doctor.mjs';

const put = (...p) => {
  mkdirSync(join(...p.slice(0, -1)), { recursive: true });
  writeFileSync(join(...p), 'x');
  return join(...p);
};

test('findHubModel reads the name, org/name and hub layouts and skips empty folders', () => {
  const a = mkdtempSync(join(tmpdir(), 'doctor-a-'));
  const b = mkdtempSync(join(tmpdir(), 'doctor-b-'));
  try {
    const plain = put(a, 'org', 'name', 'model.safetensors');
    const hub = put(b, 'models--org--other', 'snapshots', 'abc', 'model.safetensors');
    assert.equal(findHubModel('org/name', 'model.safetensors', [a, b]), plain);
    assert.equal(findHubModel('org/other', 'model.safetensors', [a, b]), hub);
    const bare = put(b, 'third', 'model.safetensors');
    assert.equal(findHubModel('org/third', 'model.safetensors', [a, b]), bare);
    assert.equal(findHubModel('org/missing', 'model.safetensors', [a, b]), null);
    assert.equal(findHubModel('org/name', 'audiovae.pth', [a, b]), null);
    assert.equal(findHubModel('org/name', 'model.safetensors', [join(a, 'none')]), null);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});
