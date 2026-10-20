/** GitHub bills credits as AI units (AIU); responses report the cost in billionths. */
export const NANO_AIU_PER_CREDIT = 1_000_000_000;

const TOTAL_PATTERN = /"total_nano_aiu"\s*:\s*(\d+(?:\.\d+)?)/g;

/** Longest tail kept between chunks so a match split across chunk boundaries is still found. */
const CARRY = 64;

/** Returns the last total_nano_aiu in a text, or undefined when there is none. */
export function findNanoAiu(text: string): number | undefined {
	let last: number | undefined;
	for (const match of text.matchAll(TOTAL_PATTERN)) last = Number(match[1]);
	return last;
}

/**
 * Reads a Copilot response body (JSON or a server-sent event stream, any
 * endpoint) and returns the response's total_nano_aiu. GitHub sends it once,
 * in the final event, so the last value wins.
 */
export async function readNanoAiu(
	body: ReadableStream<Uint8Array>,
): Promise<number | undefined> {
	const decoder = new TextDecoder();
	let carry = "";
	let last: number | undefined;
	for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
		// Seeing a match twice via the carried tail is harmless: the last value wins, nothing is summed.
		const text = carry + decoder.decode(chunk, { stream: true });
		last = findNanoAiu(text) ?? last;
		carry = text.slice(-CARRY);
	}
	return findNanoAiu(carry + decoder.decode()) ?? last;
}

export const toCredits = (nanoAiu: number) => nanoAiu / NANO_AIU_PER_CREDIT;
