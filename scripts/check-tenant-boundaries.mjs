// Fast structural tripwires. Database role tests remain the security authority.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const identityArgument = { jobById: 1, jobDetail: 1, avatarUrl: 0 };
export function auditTenantSource(source, filename) {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const issues = [];
  const queryHooks = new Set();
  const queryNamespaces = new Set();
  const factories = new Set();
  for (const node of tree.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const module = node.moduleSpecifier.text;
    const clause = node.importClause;
    if (!clause && module.startsWith('@sentry/') && filename !== 'src/lib/sentry.ts') {
      issues.push('Import telemetry SDKs only in src/lib/sentry.ts; use the sanitized logger elsewhere.');
    }
    if (!clause || clause.isTypeOnly) continue;
    const bindings = clause.namedBindings;
    if (module.startsWith('@sentry/') && filename !== 'src/lib/sentry.ts') {
      const runtimeImport = !bindings || ts.isNamespaceImport(bindings) ||
        (ts.isNamedImports(bindings) && bindings.elements.some(item => !item.isTypeOnly));
      if (clause.name || runtimeImport) {
        issues.push('Import telemetry SDKs only in src/lib/sentry.ts; use the sanitized logger elsewhere.');
      }
    }
    if (module === '@supabase/supabase-js' && filename !== 'src/lib/supabase.ts') {
      if (bindings && (ts.isNamespaceImport(bindings) || (ts.isNamedImports(bindings) &&
        bindings.elements.some((item) => !item.isTypeOnly && (item.propertyName ?? item.name).text === 'createClient')))) {
        issues.push('Create Supabase clients only in src/lib/supabase.ts; browser code must use the session client.');
      }
    }
    if (bindings && ts.isNamespaceImport(bindings) && module === '@tanstack/react-query') queryNamespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const item of bindings.elements) {
        if (item.isTypeOnly) continue;
        const exported = (item.propertyName ?? item.name).text;
        if (module === '@tanstack/react-query' && ['useQuery','useInfiniteQuery','queryOptions','infiniteQueryOptions'].includes(exported)) queryHooks.add(item.name.text);
        if (module.endsWith('/queryKeys') && exported === 'queryKeys') factories.add(item.name.text);
      }
    }
  }
  function visit(node) {
    if ((ts.isIdentifier(node) || ts.isStringLiteral(node)) && /(?:SERVICE_ROLE|SECRET_KEY|sb_secret_)/i.test(node.text)) {
      issues.push('Privileged credentials are forbidden in browser source.');
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'admin' &&
      ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'auth') {
      issues.push('Supabase Auth admin APIs are forbidden in browser source.');
    }
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (expr.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith('@sentry/') && filename !== 'src/lib/sentry.ts') {
        issues.push('Import telemetry SDKs only in src/lib/sentry.ts; use the sanitized logger elsewhere.');
      }
      const consoleMethod = ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'console'
        ? expr.name.text
        : ts.isElementAccessExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'console' &&
          expr.argumentExpression && ts.isStringLiteral(expr.argumentExpression) ? expr.argumentExpression.text : undefined;
      if (consoleMethod && ['log', 'info', 'debug', 'warn', 'error', 'table', 'dir', 'trace'].includes(consoleMethod) && filename !== 'src/lib/logger.ts') {
        issues.push('Direct browser console output can expose private data; use reportError or development-only warn from src/lib/logger.ts.');
      }
      const hook = (ts.isIdentifier(expr) && queryHooks.has(expr.text)) ||
        (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && queryNamespaces.has(expr.expression.text) &&
         ['useQuery','useInfiniteQuery','queryOptions','infiniteQueryOptions'].includes(expr.name.text));
      if (hook) {
        const options = node.arguments[0];
        const key = options && ts.isObjectLiteralExpression(options) ? options.properties.find((prop) =>
          ts.isPropertyAssignment(prop) && prop.name.getText(tree).replace(/['"]/g,'') === 'queryKey') : undefined;
        const value = key && ts.isPropertyAssignment(key) ? key.initializer : undefined;
        if (!value || !ts.isCallExpression(value) || !ts.isPropertyAccessExpression(value.expression) ||
          !ts.isIdentifier(value.expression.expression) || !factories.has(value.expression.expression.text)) {
          issues.push('Query definitions must call the imported queryKeys factory directly.');
        } else {
          const method = value.expression.name.text;
          const index = Object.hasOwn(identityArgument,method) ? identityArgument[method] : 0;
          if (index !== null && options.properties.some(prop => ts.isPropertyAssignment(prop) && prop.name.getText(tree).replace(/['"]/g,'') === 'placeholderData')) {
            issues.push('Tenant queries must not retain placeholder data across account changes.');
          }
          const identity = index === null ? true : value.arguments[index];
          if (!identity || (identity !== true && [ts.SyntaxKind.NullKeyword,ts.SyntaxKind.UndefinedKeyword].includes(identity.kind)) ||
             (identity !== true && ts.isIdentifier(identity) && identity.text === 'undefined')) {
            issues.push(`${method}: pass the authenticated UID (or owner-prefixed avatar path) to the query key.`);
          }
        }
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  return [...new Set(issues)];
}
function files(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? files(path) : /\.[jt]sx?$/.test(entry.name) && !/\.(?:test|stories)\./.test(entry.name) ? [path] : [];
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../',import.meta.url));
  let failed = false;
  for (const file of [...files(`${root}src`),...files(`${root}packages/ui/src`)]) {
    const relative = file.slice(root.length);
    for (const issue of auditTenantSource(readFileSync(file,'utf8'),relative)) {
      failed = true;
      console.error(`${relative}: ${issue}`);
    }
  }
  if (failed) process.exitCode=1;
}
