import { describe, expect, it } from 'vitest';

import { parseUnifiedDiffLines, splitUnifiedDiffByFile } from './unified-diff';

describe('unified-diff', () => {
  it('parses add/remove/context lines', () => {
    const lines = parseUnifiedDiffLines(`--- a/file.json
+++ b/file.json
@@ -1,2 +1,2 @@
-old
+new
 context`);
    expect(lines.map((line) => line.kind)).toEqual(['meta', 'meta', 'hunk', 'remove', 'add', 'context']);
  });

  it('splits multi-file diffs by path', () => {
    const files = splitUnifiedDiffByFile(`diff --git a/collections.json b/collections.json
index 111..222 100644
--- a/collections.json
+++ b/collections.json
@@ -1 +1 @@
-old
+new
diff --git a/environments.json b/environments.json
index 333..444 100644
--- a/environments.json
+++ b/environments.json
@@ -1 +1 @@
-a
+b`);
    expect(files.map((file) => file.path)).toEqual(['collections.json', 'environments.json']);
    expect(files[0]?.diff).toContain('collections.json');
  });
});
