// --- 애니메이션 WebP 먹서 ---
// 브라우저(canvas.toBlob)가 만들어 준 정지 WebP 프레임들을 파싱해
// VP8X / ANIM / ANMF 컨테이너로 다시 묶어 애니메이션 WebP를 만든다.
(function (global) {
    'use strict';

    function fourcc(s) { return [s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]; }
    function u16le(n) { n = n >>> 0; return [n & 0xff, (n >>> 8) & 0xff]; }
    function u24le(n) { n = n >>> 0; return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff]; }
    function u32le(n) { n = n >>> 0; return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

    function readTag(u8, off) {
        return String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
    }

    function concat(parts) {
        let total = 0;
        for (const p of parts) total += p.length;
        const out = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { out.set(p, off); off += p.length; }
        return out;
    }

    // RIFF 청크 하나를 만든다. 크기가 홀수면 패딩 1바이트가 붙는다(크기 필드에는 미포함).
    function makeChunk(tag, payload) {
        const size = payload.length;
        const out = new Uint8Array(8 + size + (size & 1));
        out.set(fourcc(tag), 0);
        out.set(u32le(size), 4);
        out.set(payload, 8);
        return out;
    }

    // 정지 WebP 파일에서 실제 이미지 데이터 청크(ALPH / VP8 / VP8L)만 뽑아낸다.
    function parseStillWebP(buffer) {
        const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        if (u8.length < 16 || readTag(u8, 0) !== 'RIFF' || readTag(u8, 8) !== 'WEBP') {
            throw new Error('WebP 프레임 데이터를 해석할 수 없습니다.');
        }
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const end = Math.min(u8.length, 8 + view.getUint32(4, true));

        let off = 12;
        const parts = [];
        let hasAlpha = false;

        while (off + 8 <= end) {
            const tag = readTag(u8, off);
            const size = view.getUint32(off + 4, true);
            const data = u8.subarray(off + 8, Math.min(end, off + 8 + size));

            if (tag === 'VP8X') {
                if (data.length > 0 && (data[0] & 0x10)) hasAlpha = true;
            } else if (tag === 'ALPH') {
                hasAlpha = true;
                parts.push({ tag: tag, data: data });
            } else if (tag === 'VP8 ') {
                parts.push({ tag: tag, data: data });
            } else if (tag === 'VP8L') {
                // VP8L 헤더: 서명 1바이트 + [폭-1:14bit][높이-1:14bit][알파 사용:1bit][버전:3bit]
                if (data.length >= 5) {
                    const bits = (data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24)) >>> 0;
                    if ((bits >>> 28) & 1) hasAlpha = true;
                }
                parts.push({ tag: tag, data: data });
            }
            off += 8 + size + (size & 1);
        }

        if (!parts.length) throw new Error('WebP 프레임에서 이미지 데이터를 찾지 못했습니다.');
        return { parts: parts, hasAlpha: hasAlpha };
    }

    /**
     * 정지 WebP 프레임들을 애니메이션 WebP 바이트 배열로 묶는다.
     * 각 프레임은 캔버스 전체가 아니라 바뀐 영역(x, y, width, height)만 담을 수 있다.
     * @param {Array<{buffer: ArrayBuffer|Uint8Array, delay: number, x?:number, y?:number, width?:number, height?:number}>} frames
     * @param {{width:number, height:number, loop?:number, alpha?:boolean}} options
     * @returns {Uint8Array}
     */
    function encodeAnimation(frames, options) {
        if (!frames || !frames.length) throw new Error('프레임이 없습니다.');
        const width = options.width, height = options.height;
        if (!(width > 0 && height > 0)) throw new Error('캔버스 크기가 올바르지 않습니다.');
        if (width > 0x1000000 || height > 0x1000000) throw new Error('WebP가 지원하는 최대 크기를 넘었습니다.');

        const loop = options.loop == null ? 0 : options.loop;
        let anyAlpha = !!options.alpha;
        const anmfChunks = [];

        for (const frame of frames) {
            const parsed = parseStillWebP(frame.buffer);
            if (parsed.hasAlpha) anyAlpha = true;

            // 오프셋은 2의 배수로만 저장할 수 있다.
            const fx = Math.max(0, (frame.x || 0)) & ~1;
            const fy = Math.max(0, (frame.y || 0)) & ~1;
            const fw = frame.width || width;
            const fh = frame.height || height;
            if (fx + fw > width || fy + fh > height) throw new Error('프레임 영역이 캔버스를 벗어났습니다.');

            const body = concat(parsed.parts.map(p => makeChunk(p.tag, p.data)));
            const header = new Uint8Array(16);
            header.set(u24le(fx / 2), 0);            // 프레임 X 오프셋 / 2
            header.set(u24le(fy / 2), 3);            // 프레임 Y 오프셋 / 2
            header.set(u24le(fw - 1), 6);
            header.set(u24le(fh - 1), 9);
            header.set(u24le(Math.max(0, Math.min(0xffffff, Math.round(frame.delay)))), 12);
            header[15] = 0x02;                       // 블렌딩 안 함(영역 통째로 교체) + 폐기 안 함

            anmfChunks.push(makeChunk('ANMF', concat([header, body])));
        }

        const vp8x = new Uint8Array(10);
        vp8x[0] = (anyAlpha ? 0x10 : 0x00) | 0x02;   // 알파 플래그 + 애니메이션 플래그
        vp8x.set(u24le(width - 1), 4);
        vp8x.set(u24le(height - 1), 7);

        const anim = new Uint8Array(6);
        anim.set([0, 0, 0, 0], 0);                   // 배경색 (BGRA, 투명)
        anim.set(u16le(loop), 4);                    // 반복 횟수 (0 = 무한)

        const body = concat([makeChunk('VP8X', vp8x), makeChunk('ANIM', anim)].concat(anmfChunks));
        const out = new Uint8Array(12 + body.length);
        out.set(fourcc('RIFF'), 0);
        out.set(u32le(4 + body.length), 4);
        out.set(fourcc('WEBP'), 8);
        out.set(body, 12);
        return out;
    }

    // 캔버스를 정지 WebP 바이트로 인코딩한다. (quality 1.0 이면 브라우저가 무손실로 인코딩)
    function canvasToWebP(canvas, quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error('WebP 인코딩에 실패했습니다.'));
                if (blob.type !== 'image/webp') return reject(new Error('이 브라우저는 WebP 인코딩을 지원하지 않습니다.'));
                blob.arrayBuffer().then(resolve, reject);
            }, 'image/webp', quality);
        });
    }

    // 이전 프레임과 달라진 픽셀의 최소 사각형. 완전히 같으면 null.
    // 오프셋은 짝수여야 하므로 좌상단을 짝수로 내림한다.
    function diffRect(prevData, curData, width, height) {
        const a = new Uint32Array(prevData.buffer, prevData.byteOffset, width * height);
        const b = new Uint32Array(curData.buffer, curData.byteOffset, width * height);
        let minX = width, minY = height, maxX = -1, maxY = -1;

        for (let y = 0; y < height; y++) {
            const row = y * width;
            let rowMin = -1, rowMax = -1;
            for (let x = 0; x < width; x++) {
                if (a[row + x] !== b[row + x]) { if (rowMin < 0) rowMin = x; rowMax = x; }
            }
            if (rowMin >= 0) {
                if (rowMin < minX) minX = rowMin;
                if (rowMax > maxX) maxX = rowMax;
                if (y < minY) minY = y;
                maxY = y;
            }
        }
        if (maxX < 0) return null;

        minX &= ~1; minY &= ~1;
        return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }

    let supportCache = null;
    function isSupported() {
        if (supportCache === null) {
            try {
                const c = document.createElement('canvas');
                c.width = c.height = 1;
                supportCache = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
            } catch (e) { supportCache = false; }
        }
        return supportCache;
    }

    global.WebPAnim = { encodeAnimation, canvasToWebP, isSupported, diffRect };
})(window);
