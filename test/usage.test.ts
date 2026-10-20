import assert from "node:assert/strict";
import { test } from "node:test";
import { findNanoAiu, readNanoAiu, toCredits } from "../src/usage.ts";

const anthropicStream = [
	'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
	'event: message_delta\ndata: {"copilot_usage":{"token_details":[],"total_nano_aiu":12800000},"type":"message_delta"}\n\n',
	'event: message_stop\ndata: {"type":"message_stop"}\n\n',
].join("");

function streamOf(text: string, chunkSize: number) {
	const bytes = new TextEncoder().encode(text);
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (let i = 0; i < bytes.length; i += chunkSize)
				controller.enqueue(bytes.slice(i, i + chunkSize));
			controller.close();
		},
	});
}

test("finds total_nano_aiu in a JSON body", () => {
	assert.equal(findNanoAiu('{"copilot_usage":{"total_nano_aiu":0}}'), 0);
	assert.equal(
		findNanoAiu('{"copilot_usage": {"total_nano_aiu": 4244240000}}'),
		4244240000,
	);
});

test("returns undefined when the response has no usage", () => {
	assert.equal(findNanoAiu('{"choices":[]}'), undefined);
});

test("reads usage from a stream regardless of how it is chunked", async () => {
	for (const size of [1, 3, 7, 16, 64, 4096]) {
		assert.equal(
			await readNanoAiu(streamOf(anthropicStream, size)),
			12800000,
			`chunk size ${size}`,
		);
	}
});

test("converts nano AIU to credits", () => {
	assert.equal(toCredits(12800000), 0.0128);
	assert.equal(toCredits(4244240000), 4.24424);
});
