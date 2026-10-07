import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditTenantSource } from './check-tenant-boundaries.mjs';

const imports = "import { useQuery as query } from '@tanstack/react-query'; import { queryKeys as keys } from '../lib/queryKeys';";
test('accepts a session-scoped factory',() => {
  assert.deepEqual(auditTenantSource(`${imports} query({queryKey:keys.profile(userId)});`,'src/hooks/example.ts'),[]);
});
test('rejects raw and missing-identity query keys, including import aliases',() => {
  for (const expression of ["['profile']",'keys.profile()','keys.profile(undefined)','keys.jobById(jobId)']) {
    assert.ok(auditTenantSource(`${imports} query({queryKey:${expression}});`,'src/hooks/example.ts').length);
  }
});
test('checks namespace imports and query option factories',() => {
  assert.ok(auditTenantSource("import * as rq from '@tanstack/react-query'; rq.useInfiniteQuery({queryKey:['jobs']});",'src/hooks/example.ts').length);
  assert.ok(auditTenantSource("import {queryOptions} from '@tanstack/react-query'; queryOptions({queryKey:['profile']});",'src/hooks/example.ts').length);
});
test('rejects new Supabase clients, privileged keys and Auth admin APIs in browser code',() => {
  for (const source of ["import {createClient as make} from '@supabase/supabase-js';", "import * as db from '@supabase/supabase-js';",'supabase.auth.admin.deleteUser(uid);','const key=import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;']) {
    assert.ok(auditTenantSource(source,'src/lib/example.ts').length);
  }
  assert.deepEqual(auditTenantSource("import type {Session} from '@supabase/supabase-js';",'src/lib/example.ts'),[]);
  assert.deepEqual(auditTenantSource("import {createClient} from '@supabase/supabase-js';",'src/lib/supabase.ts'),[]);
});

test('rejects tenant placeholder retention', () => {
  assert.ok(auditTenantSource(`${imports} query({queryKey:keys.profile(userId),placeholderData:previous=>previous});`,'src/hooks/example.ts').length);
});

test('rejects telemetry SDK imports outside the privacy boundary', () => {
  for (const source of [
    "import * as telemetry from '@sentry/react';",
    "import {captureException as capture} from '@sentry/react';",
    "import telemetry from '@sentry/browser';",
    "import '@sentry/react';",
    "const telemetry = await import('@sentry/react');",
  ]) {
    assert.ok(auditTenantSource(source, 'src/hooks/example.ts').length);
  }
  assert.deepEqual(auditTenantSource("import * as telemetry from '@sentry/react';", 'src/lib/sentry.ts'), []);
  assert.deepEqual(auditTenantSource("import type {ErrorEvent} from '@sentry/react';", 'src/lib/example.ts'), []);
});

test('rejects direct console diagnostics that bypass production sanitization', () => {
  for (const source of ['console.warn(error.message);', "console['error'](profile);", 'console.table(rows);']) {
    assert.ok(auditTenantSource(source, 'src/lib/example.ts').length);
  }
  assert.deepEqual(auditTenantSource('console.error(error);', 'src/lib/logger.ts'), []);
  assert.deepEqual(auditTenantSource("import {reportError, warn} from './logger'; reportError(error); warn('development only');", 'src/lib/example.ts'), []);
});
