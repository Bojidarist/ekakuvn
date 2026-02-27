async function collectStream(stream) {
	const reader = stream.getReader()
	const chunks = []
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		chunks.push(value)
	}
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
	const result = new Uint8Array(totalLength)
	let offset = 0
	for (const chunk of chunks) {
		result.set(chunk, offset)
		offset += chunk.length
	}
	return result
}

export async function gzipCompress(text) {
	const input = new TextEncoder().encode(text)
	const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))
	return collectStream(stream)
}

export async function gzipDecompress(buffer) {
	const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
	const result = await collectStream(stream)
	return new TextDecoder().decode(result)
}

export function isGzipped(buffer) {
	const bytes = new Uint8Array(buffer, 0, 2)
	return bytes[0] === 0x1f && bytes[1] === 0x8b
}

export async function readAsJson(buffer) {
	if (isGzipped(buffer)) {
		return await gzipDecompress(buffer)
	}
	return new TextDecoder().decode(buffer)
}
