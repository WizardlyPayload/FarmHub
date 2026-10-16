// Shared by the lightweight link prompt and the live source picker. A later
// manual picker choice invalidates an in-flight explicit-link transition.
let sourceSelectionIntent = 0;

export function captureSourceSelectionIntent(): number {
  return sourceSelectionIntent;
}

export function invalidateSourceSelectionIntent(): void {
  sourceSelectionIntent += 1;
}
