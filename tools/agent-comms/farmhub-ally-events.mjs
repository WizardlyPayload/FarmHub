import { createHash } from 'node:crypto';

// Tina's substantive replies use RESULT/BLOCKED, direct PARTIAL/COMPLETE,
// and RF's direct PASS/FAIL/STALL outcomes. ACK and STATUS are receipt only.
// Parse RF returns for exact, explicitly armed release gates; an unrelated RF
// result must not spend a FarmHub model turn.
const RETURN = /^(?:PICKUP\s*\+\s*)?(RESULT|BLOCKED|PARTIAL|COMPLETE|PASS|FAIL|STALL)(?:(?:\s*\+\s*(?:INCIDENT|ALLY RELEASED|RESTORED))|(?:\s*\([^\r\n)]{1,80}\)))*(?:\s+|-(?=FARMHUB-ALLY-))(?:RESULT\s+)?(FARMHUB-ALLY-\d{8}-[A-Z0-9-]+|RF-[A-Z0-9-]*TINA(?:-[A-Z0-9-]+)?)(?=\s|[|:])/m;

export function parseSubstantiveReturns(text) {
  const out = [];
  for (const block of text.replace(/^\uFEFF/, '').split(/(?=^## )/m)) {
    // Tina now also puts the result on the Markdown heading itself.
    const searchable = block.replace(/^## (?=(?:PICKUP\s*\+\s*)?(?:RESULT|BLOCKED|PARTIAL|COMPLETE|PASS|FAIL|STALL)\b)/, '');
    const match = searchable.match(RETURN);
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
  const armed = Array.isArray(rfGateId) ? rfGateId : [rfGateId];
  return armed.some(id => {
    if (!/^RF-[A-Z0-9-]*TINA(?:-[A-Z0-9-]+)?$/.test(id)) return false;
    if (event.id === id) return true;
    // Some RF results omit the timestamp suffix from their request ID.
    // This only wakes a review; ownership and restoration are rechecked there.
    return event.id.endsWith('-TINA') && /^RF-[A-Z0-9-]*TINA-[0-9]{4}$/.test(id)
      && id === `${event.id}-${id.slice(-4)}`;
  });
}

export function firstRfRequestAfterHandoff(text, heading) {
  const marker = `## ${heading}`;
  const start = text.lastIndexOf(marker);
  if (start < 0) return '';
  const match = text.slice(start + marker.length).match(/^##[^\r\n]*?\b(RF-[A-Z0-9-]*TINA-[A-Z0-9-]+)(?=\s|$)/m);
  return match?.[1] ?? '';
}
