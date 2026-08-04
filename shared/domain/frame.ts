/**
 * Frame member spacing.
 *
 * A face frame is two outer members, some interior members, and the openings
 * between them. Spacing the member *centres* evenly across the inner span is
 * the obvious thing to do and it is wrong: every interior member eats half its
 * width from each neighbouring opening, while the outer members only eat half
 * from one side, so the two end openings come out half a member bigger than the
 * ones in the middle. On a 50 mm member that is a 25 mm difference — plainly
 * visible in both the 3D and the flat view.
 *
 * These helpers space the *openings* evenly instead, which is how a frame is
 * actually laid out at the bench.
 */

/**
 * Centre offsets for every member across `span`, outer members included,
 * measured from the start of the span. The openings between consecutive
 * members all come out the same size.
 *
 * When the members cannot fit in the span at all, the centres are spread
 * evenly so the frame still draws something sane rather than inverting.
 */
export function frameMemberOffsets(span: number, memberSize: number, interiorCount: number): number[] {
  const count = Math.max(0, Math.floor(interiorCount))
  const total = count + 2
  if (!(span > 0) || !(memberSize > 0)) return []

  const opening = (span - total * memberSize) / (count + 1)
  if (!(opening > 0)) {
    // Members are wider than the span can hold; fall back to even centres.
    return Array.from({ length: total }, (_, i) => (span * (i + 0.5)) / total)
  }

  const offsets = [memberSize / 2]
  for (let i = 1; i <= count; i++) {
    offsets.push(memberSize + i * opening + (i - 0.5) * memberSize)
  }
  offsets.push(span - memberSize / 2)
  return offsets
}

/** The clear opening between two neighbouring members, for reporting. */
export function frameOpeningSize(span: number, memberSize: number, interiorCount: number): number {
  const count = Math.max(0, Math.floor(interiorCount))
  return Math.max(0, (span - (count + 2) * memberSize) / (count + 1))
}
