/**
 * WebGL1 的網格繪製（規格 3.4）。
 *
 * 參考原作 Anime2.5DRig（MIT）的 renderer.js 改寫：先把眼白畫進畫面外的遮罩貼圖（左眼 → R、右眼 → G），
 * 瞳孔畫的時候取這張遮罩相乘——不論繪製順序、眼白的濃度或顯示與否，瞳孔都依眼白的形狀平滑裁切。
 * 顏色一律預乘透明度（貼圖上傳時預乘，混色 ONE／ONE_MINUS_SRC_ALPHA）。
 */

const VS =
  'attribute vec2 aPos;attribute vec2 aUV;uniform vec2 uRes;varying vec2 vUV;' +
  'void main(){vUV=aUV;vec2 c=aPos/uRes*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);}';

const FS =
  '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
  'varying vec2 vUV;uniform sampler2D uTex;uniform sampler2D uMask;uniform vec2 uRes;uniform float uAlpha;' +
  'uniform vec2 uMaskCh;uniform float uUseMask;uniform float uMaskOut;' +
  'void main(){vec4 c=texture2D(uTex,vUV);' +
  'if(uMaskOut>0.5){gl_FragColor=vec4(c.a);return;}' +
  'float m=1.0;if(uUseMask>0.5){m=dot(texture2D(uMask,gl_FragCoord.xy/uRes).rg,uMaskCh);}' +
  'gl_FragColor=c*(uAlpha*m);}';

export const GL_ERRORS = {
  mask: '無法配置瞳孔遮罩用的記憶體，請縮小 PSD。',
  memory: '無法配置繪圖記憶體，請縮小 PSD。',
} as const;

/** 上傳到顯示卡的一個部件 */
export interface GlMesh {
  vboPos: WebGLBuffer | null;
  vboUV: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  tex: WebGLTexture | null;
  nIdx: number;
}

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  image: ImageData | { width: number; height: number; data: Uint8ClampedArray };
}

export type MaskSide = 'L' | 'R';

export interface DrawFrame {
  width: number;
  height: number;
  /** 底色（預乘的 RGBA，0～1） */
  background: readonly [number, number, number, number];
  /** 眼白（左右各自的遮罩） */
  masks: { mesh: GlMesh; side: MaskSide }[];
  /** 依順序畫（clip：以哪一邊的眼白裁切） */
  items: { mesh: GlMesh; alpha: number; clip: MaskSide | null }[];
}

type Uniform = 'uRes' | 'uAlpha' | 'uTex' | 'uMask' | 'uMaskCh' | 'uUseMask' | 'uMaskOut';

export class MeshRenderer {
  private prog: WebGLProgram | null = null;
  private pos = -1;
  private uv = -1;
  private u = {} as Record<Uniform, WebGLUniformLocation | null>;
  private maskTex: WebGLTexture | null = null;
  private maskFbo: WebGLFramebuffer | null = null;
  private maskW = 0;
  private maskH = 0;

  constructor(private gl: WebGLRenderingContext) {
    this.init();
  }

  private shader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type) as WebGLShader;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(s) ?? 'shader';
      gl.deleteShader(s);
      throw new Error(msg);
    }
    return s;
  }

  /** 建立著色器與狀態（繪圖內容遺失後恢復時也呼叫） */
  init(): void {
    const gl = this.gl;
    const prog = gl.createProgram() as WebGLProgram;
    gl.attachShader(prog, this.shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, this.shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    for (const s of gl.getAttachedShaders(prog) ?? []) {
      gl.detachShader(prog, s);
      gl.deleteShader(s);
    }
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? 'program');
    this.prog = prog;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL 的 useProgram，不是 React 的 hook
    gl.useProgram(prog);
    this.pos = gl.getAttribLocation(prog, 'aPos');
    this.uv = gl.getAttribLocation(prog, 'aUV');
    for (const name of [
      'uRes',
      'uAlpha',
      'uTex',
      'uMask',
      'uMaskCh',
      'uUseMask',
      'uMaskOut',
    ] as const)
      this.u[name] = gl.getUniformLocation(prog, name);
    gl.enableVertexAttribArray(this.pos);
    gl.enableVertexAttribArray(this.uv);
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform1i(this.u.uMask, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.maskTex = null;
    this.maskFbo = null;
    this.maskW = 0;
    this.maskH = 0;
  }

  private texture(image: MeshData['image'] | null): WebGLTexture | null {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (image) {
      if (typeof ImageData !== 'undefined' && image instanceof ImageData)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      else
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          image.width,
          image.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.length),
        );
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private ensureMask(w: number, h: number) {
    const gl = this.gl;
    if (this.maskTex && this.maskW === w && this.maskH === h) return;
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    if (this.maskFbo) gl.deleteFramebuffer(this.maskFbo);
    this.maskTex = this.texture(null);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.maskFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.maskTex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error(GL_ERRORS.mask);
    this.maskW = w;
    this.maskH = h;
  }

  /** 上傳一個部件的網格與貼圖 */
  upload(mesh: MeshData): GlMesh {
    const gl = this.gl;
    const out: GlMesh = {
      vboPos: gl.createBuffer(),
      vboUV: gl.createBuffer(),
      ibo: gl.createBuffer(),
      tex: null,
      nIdx: mesh.indices.length,
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, out.vboPos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, out.vboUV);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, out.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    out.tex = this.texture(mesh.image);
    if (!out.vboPos || !out.vboUV || !out.ibo || !out.tex || gl.getError() !== gl.NO_ERROR) {
      this.dispose(out);
      throw new Error(GL_ERRORS.memory);
    }
    return out;
  }

  dispose(m: GlMesh): void {
    const gl = this.gl;
    if (m.tex) gl.deleteTexture(m.tex);
    if (m.vboPos) gl.deleteBuffer(m.vboPos);
    if (m.vboUV) gl.deleteBuffer(m.vboUV);
    if (m.ibo) gl.deleteBuffer(m.ibo);
    m.tex = m.vboPos = m.vboUV = m.ibo = null;
  }

  /** 更新頂點位置 */
  positions(m: GlMesh, data: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vboPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }

  private bind(m: GlMesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vboPos);
    gl.vertexAttribPointer(this.pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vboUV);
    gl.vertexAttribPointer(this.uv, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
  }

  /** 畫一格（遮罩建不起來時丟錯，呼叫端改成不裁切再畫） */
  draw(frame: DrawFrame): void {
    const gl = this.gl;
    const { width: W, height: H } = frame;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL 的 useProgram，不是 React 的 hook
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uRes, W, H);
    gl.uniform1f(this.u.uUseMask, 0);
    const hasMask = { L: false, R: false };
    if (frame.masks.length && frame.items.some((i) => i.clip)) {
      this.ensureMask(W, H);
      /* 先把遮罩從取樣單元拿掉，否則 WebGL 會報回饋迴圈 */
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFbo);
      gl.viewport(0, 0, W, H);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(this.u.uMaskOut, 1);
      gl.uniform1f(this.u.uAlpha, 1);
      for (const m of frame.masks) {
        gl.colorMask(m.side === 'L', m.side === 'R', false, false);
        hasMask[m.side] = true;
        this.bind(m.mesh);
        gl.drawElements(gl.TRIANGLES, m.mesh.nIdx, gl.UNSIGNED_SHORT, 0);
      }
      gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.uniform1f(this.u.uMaskOut, 0);
    gl.viewport(0, 0, W, H);
    const bg = frame.background;
    gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.activeTexture(gl.TEXTURE0);
    let masked = false;
    for (const it of frame.items) {
      this.bind(it.mesh);
      gl.uniform1f(this.u.uAlpha, it.alpha);
      const clip = it.clip && hasMask[it.clip];
      if (clip && it.clip) {
        gl.uniform1f(this.u.uUseMask, 1);
        gl.uniform2f(this.u.uMaskCh, it.clip === 'L' ? 1 : 0, it.clip === 'R' ? 1 : 0);
        masked = true;
      } else if (masked) {
        gl.uniform1f(this.u.uUseMask, 0);
        masked = false;
      }
      gl.drawElements(gl.TRIANGLES, it.mesh.nIdx, gl.UNSIGNED_SHORT, 0);
    }
    gl.uniform1f(this.u.uUseMask, 0);
  }
}
