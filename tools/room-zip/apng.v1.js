/*! ココフォリア部屋ZIPメーカー — APNG演出画像 */
(function (root, factory) {
	var api = factory()
	if (typeof module === "object" && module.exports) module.exports = api
	root.CcfoliaApng = api
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
	"use strict"

	/* TRPG Toolkit 合輯：同上，Node 那邊沒有 i18n 引擎。 */
	function T(key) {
		var t = typeof globalThis !== "undefined" && globalThis.T
		return typeof t === "function" ? t.apply(null, arguments) : key
	}

	var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
	var DEFAULTS = { duration: 500, minDuration: 500, maxDuration: 4000, durationStep: 500, fps: 12, frameCount: 6, maxFrames: 15, maxEdge: 1024, colorSize: 128 }
	var ENDPOINTS = ["transparent", "image", "color"]

	function asBytes(value) {
		if (value instanceof Uint8Array) return value
		if (value instanceof ArrayBuffer) return new Uint8Array(value)
		if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
		throw new Error(T("base.001"))
	}
	function readUint(bytes, offset) {
		return ((bytes[offset] * 0x1000000) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])) >>> 0
	}
	function writeUint(bytes, offset, value) {
		value = Number(value) >>> 0
		bytes[offset] = value >>> 24
		bytes[offset + 1] = value >>> 16
		bytes[offset + 2] = value >>> 8
		bytes[offset + 3] = value
	}
	function chunkType(bytes, offset) {
		return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
	}

	var crcTable = null
	function crc32(bytes, offset, length) {
		bytes = asBytes(bytes)
		if (!crcTable) {
			crcTable = new Uint32Array(256)
			for (var n = 0; n < 256; n++) {
				var c = n
				for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
				crcTable[n] = c >>> 0
			}
		}
		var crc = 0xffffffff, end = offset + length
		for (var i = offset; i < end; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8)
		return (crc ^ 0xffffffff) >>> 0
	}

	function parsePng(value) {
		var bytes = asBytes(value)
		if (bytes.length < PNG_SIGNATURE.length) throw new Error(T("base.002"))
		for (var i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error(T("base.003"))
		var chunks = [], at = 8, seenEnd = false
		while (at < bytes.length) {
			if (at + 12 > bytes.length) throw new Error(T("base.004"))
			var length = readUint(bytes, at), typeOffset = at + 4, dataOffset = at + 8, crcOffset = dataOffset + length
			if (crcOffset + 4 > bytes.length) throw new Error(T("base.005"))
			var type = chunkType(bytes, typeOffset), storedCrc = readUint(bytes, crcOffset), calculatedCrc = crc32(bytes, typeOffset, length + 4)
			var chunk = { type: type, offset: at, length: length, typeOffset: typeOffset, dataOffset: dataOffset, crcOffset: crcOffset, crc: storedCrc, calculatedCrc: calculatedCrc, crcValid: storedCrc === calculatedCrc }
			if (type === "IHDR" && length === 13) { chunk.width = readUint(bytes, dataOffset); chunk.height = readUint(bytes, dataOffset + 4) }
			if (type === "acTL" && length === 8) { chunk.numFrames = readUint(bytes, dataOffset); chunk.numPlays = readUint(bytes, dataOffset + 4) }
			if (type === "fcTL" && length === 26) {
				chunk.sequence = readUint(bytes, dataOffset)
				chunk.width = readUint(bytes, dataOffset + 4); chunk.height = readUint(bytes, dataOffset + 8)
				chunk.x = readUint(bytes, dataOffset + 12); chunk.y = readUint(bytes, dataOffset + 16)
				chunk.delayNum = (bytes[dataOffset + 20] << 8) | bytes[dataOffset + 21]
				chunk.delayDen = (bytes[dataOffset + 22] << 8) | bytes[dataOffset + 23]
				chunk.dispose = bytes[dataOffset + 24]; chunk.blend = bytes[dataOffset + 25]
			}
			chunks.push(chunk)
			at = crcOffset + 4
			if (type === "IEND") { seenEnd = true; break }
		}
		if (!seenEnd || at !== bytes.length) throw new Error(T("base.006"))
		return { bytes: bytes, chunks: chunks }
	}

	function rewriteChunkCrc(bytes, chunk) {
		writeUint(bytes, chunk.crcOffset, crc32(bytes, chunk.typeOffset, chunk.length + 4))
	}
	function normalizeApng(value, options) {
		options = options || {}
		var original = asBytes(value), bytes = original.slice(), parsed = parsePng(bytes)
		var actls = parsed.chunks.filter(function (chunk) { return chunk.type === "acTL" }), actl = actls[0]
		var frames = parsed.chunks.filter(function (chunk) { return chunk.type === "fcTL" })
		if (parsed.chunks[0].type !== "IHDR" || actls.length !== 1 || !frames.length || !parsed.chunks.some(function (chunk) { return chunk.type === "IDAT" }) || frames.length > 1 && !parsed.chunks.some(function (chunk) { return chunk.type === "fdAT" })) throw new Error(T("base.007"))
		if (!parsed.chunks.every(function (chunk) { return chunk.crcValid })) throw new Error(T("base.008"))
		if (actl.numFrames !== frames.length) throw new Error(T("base.009"))
		var plays = options.numPlays == null ? 1 : Math.max(0, Number(options.numPlays) >>> 0)
		if (actl.numPlays !== plays) {
			writeUint(bytes, actl.dataOffset + 4, plays)
			rewriteChunkCrc(bytes, actl)
		}
		if (options.finalTransparent) {
			var last = frames[frames.length - 1]
			if (last.blend !== 0) {
				bytes[last.dataOffset + 25] = 0
				rewriteChunkCrc(bytes, last)
			}
		}
		var checked = parsePng(bytes), checkedActl = checked.chunks.filter(function (chunk) { return chunk.type === "acTL" })[0]
		var checkedFrames = checked.chunks.filter(function (chunk) { return chunk.type === "fcTL" })
		if (!checked.chunks.every(function (chunk) { return chunk.crcValid })) throw new Error(T("base.008"))
		if (checkedActl.numPlays !== plays) throw new Error(T("base.010"))
		if (options.finalTransparent && checkedFrames[checkedFrames.length - 1].blend !== 0) throw new Error(T("base.011"))
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
	}

	function hexRgb(value) {
		var match = /^#([0-9a-f]{6})$/i.exec(String(value || ""))
		if (!match) return [0, 0, 0]
		var n = parseInt(match[1], 16)
		return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255]
	}
	function validPair(start, end) {
		return ENDPOINTS.indexOf(start) >= 0 && ENDPOINTS.indexOf(end) >= 0 && start !== end
	}
	function needsImage(start, end) {
		return start === "image" || end === "image"
	}
	function endsTransparent(end) {
		return end === "transparent"
	}
	function normalizeDuration(value) {
		var n = Number(value)
		if (!isFinite(n)) n = DEFAULTS.duration
		n = Math.round(n / DEFAULTS.durationStep) * DEFAULTS.durationStep
		return Math.max(DEFAULTS.minDuration, Math.min(DEFAULTS.maxDuration, n))
	}
	function normalizeFps(value) {
		var n = Number(value)
		if (!isFinite(n) || n <= 0) n = DEFAULTS.fps
		return Math.max(1, Math.min(60, n))
	}
	function frameCountFor(options) {
		options = options || {}
		var duration = normalizeDuration(options.duration), fps = normalizeFps(options.fps)
		var requested = options.frameCount == null ? Math.round(duration / 1000 * fps) : Number(options.frameCount)
		if (!isFinite(requested)) requested = DEFAULTS.frameCount
		return Math.max(2, Math.min(DEFAULTS.maxFrames, Math.round(requested)))
	}
	function overlayColor(source, at, rgb, amount, out) {
		var sourceAlpha = source[at + 3] / 255
		var alpha = amount + sourceAlpha * (1 - amount)
		if (alpha <= 0) { out[at] = out[at + 1] = out[at + 2] = out[at + 3] = 0; return }
		out[at] = Math.round((rgb[0] * amount + source[at] * sourceAlpha * (1 - amount)) / alpha)
		out[at + 1] = Math.round((rgb[1] * amount + source[at + 1] * sourceAlpha * (1 - amount)) / alpha)
		out[at + 2] = Math.round((rgb[2] * amount + source[at + 2] * sourceAlpha * (1 - amount)) / alpha)
		out[at + 3] = Math.round(alpha * 255)
	}
	function makeFadeFrame(options, progress) {
		options = options || {}
		var start = options.start, end = options.end, width = Number(options.width) || 0, height = Number(options.height) || 0
		if (!validPair(start, end) || width < 1 || height < 1) throw new Error(T("base.012"))
		var source = options.source ? asBytes(options.source) : null
		if (needsImage(start, end) && (!source || source.length !== width * height * 4)) throw new Error(T("base.013"))
		var p = Math.max(0, Math.min(1, Number(progress) || 0)), rgb = hexRgb(options.color), out = new Uint8Array(width * height * 4)
		for (var at = 0; at < out.length; at += 4) {
			if (start === "transparent" && end === "image" || start === "image" && end === "transparent") {
				var imageAmount = end === "image" ? p : 1 - p
				out[at] = source[at]; out[at + 1] = source[at + 1]; out[at + 2] = source[at + 2]
				out[at + 3] = Math.round(source[at + 3] * imageAmount)
			} else if (start === "transparent" && end === "color" || start === "color" && end === "transparent") {
				var colorAmount = end === "color" ? p : 1 - p
				out[at] = rgb[0]; out[at + 1] = rgb[1]; out[at + 2] = rgb[2]; out[at + 3] = Math.round(255 * colorAmount)
			} else {
				var overlayAmount = end === "color" ? p : 1 - p
				overlayColor(source, at, rgb, overlayAmount, out)
			}
		}
		return out
	}
	function makeFadeFrames(options) {
		options = options || {}
		var duration = normalizeDuration(options.duration), count = frameCountFor(options), baseDelay = Math.floor(duration / count), remainder = duration - baseDelay * count
		var frames = [], delays = []
		for (var i = 0; i < count; i++) {
			frames.push(makeFadeFrame(options, i / (count - 1)))
			delays.push(baseDelay + (i < remainder ? 1 : 0))
		}
		return { frames: frames, delays: delays, frameCount: count, delay: duration / count, duration: delays.reduce(function (sum, delay) { return sum + delay }, 0) }
	}
	function encodeFade(options, encoder) {
		encoder = encoder || (typeof globalThis !== "undefined" ? globalThis.UPNG : null)
		if (!encoder || typeof encoder.encode !== "function") throw new Error(T("base.014"))
		var made = makeFadeFrames(options)
		var buffers = made.frames.map(function (frame) { return frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) })
		var numPlays = options.loop === true || options.loop === 0 || options.loop === "on" ? 0 : 1
		var raw = encoder.encode(buffers, options.width, options.height, 0, made.delays, { loop: numPlays })
		var buffer = normalizeApng(raw, { numPlays: numPlays, finalTransparent: endsTransparent(options.end) })
		var parsed = parsePng(buffer), actl = parsed.chunks.filter(function (chunk) { return chunk.type === "acTL" })[0]
		if (!actl || actl.numFrames !== made.frameCount) throw new Error(T("base.009"))
		if (actl.numPlays !== numPlays) throw new Error(T("base.015"))
		return { buffer: buffer, frames: made.frames, delays: made.delays, frameCount: made.frameCount, delay: made.delay, duration: made.duration, numPlays: numPlays, info: parsed }
	}

	return {
		DEFAULTS: DEFAULTS,
		ENDPOINTS: ENDPOINTS,
		normalizeDuration: normalizeDuration,
		normalizeFps: normalizeFps,
		frameCountFor: frameCountFor,
		validPair: validPair,
		needsImage: needsImage,
		endsTransparent: endsTransparent,
		hexRgb: hexRgb,
		crc32: crc32,
		parsePng: parsePng,
		normalizeApng: normalizeApng,
		makeFadeFrame: makeFadeFrame,
		makeFadeFrames: makeFadeFrames,
		encodeFade: encodeFade,
	}
})
