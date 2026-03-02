import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/plugins/github/issue-parser.ts
var KEYWORD_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+))?#(\d+)\b/gi;
var FULL_REF_PATTERN = /(?:^|[\s,(])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)\b/g;
var STANDALONE_PATTERN = /(?:^|[\s,(:])#(\d+)\b/g;
function parseIssueReferences(text) {
  if (!text || typeof text !== "string") return [];
  const refs = /* @__PURE__ */ new Map();
  let match;
  KEYWORD_PATTERN.lastIndex = 0;
  while ((match = KEYWORD_PATTERN.exec(text)) !== null) {
    const owner = match[1] || void 0;
    const repo = match[2] || void 0;
    const number = parseInt(match[3], 10);
    const keyword = match[0].split(/\s/)[0].toLowerCase();
    const key = makeKey(owner, repo, number);
    refs.set(key, { number, owner, repo, keyword });
  }
  FULL_REF_PATTERN.lastIndex = 0;
  while ((match = FULL_REF_PATTERN.exec(text)) !== null) {
    const owner = match[1];
    const repo = match[2];
    const number = parseInt(match[3], 10);
    const key = makeKey(owner, repo, number);
    if (!refs.has(key)) {
      refs.set(key, { number, owner, repo });
    }
  }
  STANDALONE_PATTERN.lastIndex = 0;
  while ((match = STANDALONE_PATTERN.exec(text)) !== null) {
    const number = parseInt(match[1], 10);
    const key = makeKey(void 0, void 0, number);
    if (!refs.has(key) && !hasRefWithNumber(refs, number)) {
      refs.set(key, { number });
    }
  }
  return Array.from(refs.values());
}
function makeKey(owner, repo, number) {
  if (owner && repo) {
    return `${owner}/${repo}#${number}`;
  }
  return `#${number}`;
}
function hasRefWithNumber(refs, number) {
  for (const ref of refs.values()) {
    if (ref.number === number) return true;
  }
  return false;
}
export {
  parseIssueReferences
};
