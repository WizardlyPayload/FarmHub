import { createHash } from 'node:crypto';

// Tina's substantive replies use RESULT/BLOCKED, direct PARTIAL/COMPLETE,
// and RF's direct PASS/FAIL outcomes. ACK and STATUS are receipt only.
// Parse RF returns for exact, explicitly armed release gates; an unrelated RF
// result must not spend a FarmHub model turn.
const RETURN = /^(RESULT|BLOCKED|PARTIAL|COMPLETE|PASS|FAIL)\s+(?:RESULT\s+)?(FARMHUB-ALLY-\d{8}-[A-Z0-9-]+|RF-\d{8}-TINA-[A-Z0-9-]+)(?=\s|[|:])/m;

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

export function shouldWakeFarmHub(event, rfGateId = '') {
  if (event.id.startsWith('FARMHUB-ALLY-')) return true;
  return /^RF-\d{8}-TINA-[A-Z0-9-]+$/.test(rfGateId) && event.id === rfGateId;
}

export function firstRfRequestAfterHandoff(text, heading) {
  const marker = `## ${heading}`;
  const start = text.lastIndexOf(marker);
  if (start < 0) return '';
  const match = text.slice(start + marker.length).match(/^##\s+(RF-\d{8}-TINA-[A-Z0-9-]+)(?=\s|$)/m);
  return match?.[1] ?? '';
}
