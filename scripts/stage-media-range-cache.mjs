import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

export function stageMediaRangeCache(output) {
  const source = readFileSync(new URL('../src/shared/mediaRangeCache.ts', import.meta.url), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  });
  writeFileSync(output, result.outputText);
}
