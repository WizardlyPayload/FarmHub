import { createHash } from 'node:crypto';

// Tina's substantive replies use both RESULT/BLOCKED and direct PARTIAL/COMPLETE.
// Match any RF session so a newer owner cannot silently outgrow a hard-coded ID.
const RETURN = /^(RESULT|BLOCKED|PARTIAL|COMPLETE)\s+(FARMHUB-ALLY-\d{8}-[A-Z0-9-]+|RF-\d{8}-TINA-[A-Z0-9-]+)(?=\s|[|:])/m;

export function parseSubstantiveReturns(text) {
  const out = [];
  for (const block of text.replace(/^\uFEFF/, '').split(/(?=^## )/m)) {
    const match = block.match(RETURN);
    if (!match) continue;
    out.push({
      id: match[2],
      kind: match[1],
      hash: createHash('sha256').update(block.replace(/\r\n/g, '\n').trim()).digest('hex'),
    });
  }
  return out;
}
