import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { blazrInfo, runBlazr, MIN_BLAZR } from './blazr.mjs';
import { ManifestError } from './manifest.mjs';

const skip = process.platform === 'win32';

function restoreEnv(saved) {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// Runs fn with a config naming `blazr` and, when `version` is given, a fake binary that prints it and exits with $FAKE_EXIT.
function withBlazr(blazr, version, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'blazr-'));
  const saved = { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, FAKE_EXIT: process.env.FAKE_EXIT, FAKE_ARGS: process.env.FAKE_ARGS };
  try {
    let value = blazr;
    if (version !== undefined) {
      value = join(dir, 'blazr');
      writeFileSync(value, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi\nif [ -n "$FAKE_ARGS" ]; then printf '%s\\n' "$@" > "$FAKE_ARGS"; fi\nexit "\${FAKE_EXIT:-0}"\n`);
      chmodSync(value, 0o755);
    }
    mkdirSync(join(dir, 'motion-video'));
    writeFileSync(join(dir, 'motion-video', 'config.json'), JSON.stringify({ blazr: value === undefined ? join(dir, 'missing') : value }));
    process.env.XDG_CONFIG_HOME = dir;
    return fn();
  } finally {
    restoreEnv(saved);
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a blazr at the minimum version with audio is usable', { skip }, () => {
  withBlazr(undefined, 'blazr 0.1.2 (audio)', () => {
    const info = blazrInfo();
    assert.equal(info.usable, true);
    assert.equal(info.version, '0.1.2');
    assert.deepEqual(info.features, ['audio']);
    assert.equal(info.why, '');
  });
});

test('an older blazr is not usable and the reason names both versions', { skip }, () => {
  withBlazr(undefined, 'blazr 0.1.0 (audio)', () => {
    const info = blazrInfo();
    assert.equal(info.usable, false);
    assert.match(info.why, /0\.1\.0/);
    assert.ok(info.why.includes(MIN_BLAZR), info.why);
  });
});

test('a blazr built without audio is not usable', { skip }, () => {
  withBlazr(undefined, 'blazr 0.2.0 (cuda)', () => {
    const info = blazrInfo();
    assert.equal(info.usable, false);
    assert.match(info.why, /--features audio/);
  });
});

test('"blazr": false turns blazr off', { skip }, () => {
  withBlazr(false, undefined, () => {
    const info = blazrInfo();
    assert.equal(info.usable, false);
    assert.match(info.why, /false/);
    assert.equal(runBlazr('speak', []), null);
  });
});

test('runBlazr returns the exit code of blazr', { skip }, () => {
  for (const code of [0, 1, 2]) {
    withBlazr(undefined, 'blazr 0.1.2 (audio)', () => {
      process.env.FAKE_EXIT = String(code);
      assert.equal(runBlazr('speak', []), code);
    });
  }
});

test('exit 3 hands the run to the skill', { skip }, () => {
  withBlazr(undefined, 'blazr 0.1.2 (audio)', () => {
    process.env.FAKE_EXIT = '3';
    assert.equal(runBlazr('transcribe', []), null);
  });
});

test('a configured path that does not exist is an error', { skip }, () => {
  withBlazr(undefined, undefined, () => {
    assert.throws(() => runBlazr('speak', []), ManifestError);
  });
});

test('a configured blazr that is too old is an error', { skip }, () => {
  withBlazr(undefined, 'blazr 0.1.0 (audio)', () => {
    assert.throws(() => runBlazr('speak', []), ManifestError);
  });
});

test('runBlazr passes the command and its arguments on unchanged', { skip }, () => {
  withBlazr(undefined, 'blazr 0.1.2 (audio)', () => {
    const file = join(process.env.XDG_CONFIG_HOME, 'args');
    process.env.FAKE_ARGS = file;
    assert.equal(runBlazr('speak', ['a b', '--engine', 'kokoro']), 0);
    assert.equal(readFileSync(file, 'utf8'), 'speak\na b\n--engine\nkokoro\n');
  });
});

test('no blazr on PATH falls back without an error', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'blazr-'));
  const saved = { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, PATH: process.env.PATH };
  try {
    process.env.XDG_CONFIG_HOME = dir;
    process.env.PATH = dir;
    const info = blazrInfo();
    assert.equal(info.usable, false);
    assert.match(info.why, /not found on PATH/);
    assert.equal(runBlazr('speak', []), null);
  } finally {
    restoreEnv(saved);
    rmSync(dir, { recursive: true, force: true });
  }
});
