const MARK_TEXT_PATTERN = /\p{Mark}/u;
const MARK_CODE_POINT_PATTERN = /^\p{Mark}$/u;
const SURROGATE_CODE_UNIT_PATTERN = /[\uD800-\uDFFF]/;

type TextBoundarySegment = { value: string; start: number; end: number };

export function commonPrefixLength(before: string, after: string): number {
  if (!needsBoundarySafeOffsets(before) && !needsBoundarySafeOffsets(after))
    return commonPrefixCodeUnitLength(before, after);

  const beforeSegments = textBoundarySegments(before);
  const afterSegments = textBoundarySegments(after);
  let index = 0;
  let prefix = 0;
  while (
    index < beforeSegments.length &&
    index < afterSegments.length &&
    beforeSegments[index]!.value === afterSegments[index]!.value
  ) {
    prefix = beforeSegments[index]!.end;
    index++;
  }
  return prefix;
}

export function commonSuffixLength(before: string, after: string, prefixLength: number): number {
  if (!needsBoundarySafeOffsets(before) && !needsBoundarySafeOffsets(after))
    return commonSuffixCodeUnitLength(before, after, prefixLength);

  const beforeSegments = textBoundarySegments(before);
  const afterSegments = textBoundarySegments(after);
  let beforeIndex = beforeSegments.length - 1;
  let afterIndex = afterSegments.length - 1;
  let suffix = 0;
  while (beforeIndex >= 0 && afterIndex >= 0) {
    const beforeSegment = beforeSegments[beforeIndex]!;
    const afterSegment = afterSegments[afterIndex]!;
    if (beforeSegment.start < prefixLength || afterSegment.start < prefixLength) break;
    if (beforeSegment.value !== afterSegment.value) break;
    suffix += beforeSegment.value.length;
    beforeIndex--;
    afterIndex--;
  }
  return suffix;
}

export function needsBoundarySafeOffsets(text: string): boolean {
  return MARK_TEXT_PATTERN.test(text) || SURROGATE_CODE_UNIT_PATTERN.test(text);
}

function commonPrefixCodeUnitLength(before: string, after: string): number {
  const end = Math.min(before.length, after.length);
  let index = 0;
  while (index < end && before[index] === after[index]) index++;
  return index;
}

function commonSuffixCodeUnitLength(before: string, after: string, prefixLength: number): number {
  const maxLength = Math.min(before.length, after.length) - prefixLength;
  let length = 0;
  while (
    length < maxLength &&
    before[before.length - 1 - length] === after[after.length - 1 - length]
  )
    length++;
  return length;
}

function textBoundarySegments(text: string): TextBoundarySegment[] {
  const segments: TextBoundarySegment[] = [];
  for (let index = 0; index < text.length; ) {
    const start = index;
    const codePoint = text.codePointAt(index)!;
    const value = String.fromCodePoint(codePoint);
    index += value.length;

    if (MARK_CODE_POINT_PATTERN.test(value) && segments.length > 0) {
      const previous = segments.at(-1)!;
      previous.value += value;
      previous.end = index;
    } else {
      segments.push({ value, start, end: index });
    }
  }
  return segments;
}
