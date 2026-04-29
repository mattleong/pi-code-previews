export function hashString(value: string): string {
	let first = 0xdeadbeef;
	let second = 0x41c6ce57;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		first = Math.imul(first ^ code, 2654435761);
		second = Math.imul(second ^ code, 1597334677);
	}
	first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
	second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
	return `${(second >>> 0).toString(36)}${(first >>> 0).toString(36)}`;
}
