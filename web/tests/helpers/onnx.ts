/**
 * 測試用的小 ONNX 模型（自己寫 protobuf，不需要額外套件）：輸入輸出的名稱與形狀和 anime-segmentation 的 isnetis.onnx 相同
 * （img [1, 3, 1024, 1024] → mask [1, 1, 1024, 1024]），內容是一個 1×1 卷積加 sigmoid：
 *
 *   mask = sigmoid(bias + wr × R + wg × G + wb × B)（R、G、B 是 0～1）
 *
 * 預設 wr = wg = wb = −4、bias = 6：白（1, 1, 1）→ 0.0025（去掉），黑 → 0.9975（留下）。
 * 檔案只有幾百位元組，放在 tests/fixtures/bg-remover-fake-model.onnx（由 fakeSegModel() 產生，單元測試會比對）。
 */

/* ---------- protobuf（只用到 varint、長度前綴、float32） ---------- */

function varint(n: number | bigint): number[] {
  let v = BigInt.asUintN(64, BigInt(n));
  const out: number[] = [];
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return out;
}

const key = (field: number, wire: number) => varint((field << 3) | wire);
const int = (field: number, v: number) => [...key(field, 0), ...varint(v)];
const bytes = (field: number, data: number[] | Uint8Array) => [
  ...key(field, 2),
  ...varint(data.length),
  ...data,
];
const str = (field: number, s: string) => bytes(field, [...new TextEncoder().encode(s)]);
const floats = (field: number, values: readonly number[]) => {
  const b = new Uint8Array(new Float32Array(values).buffer);
  return bytes(field, [...b]);
};
const int64s = (field: number, values: readonly number[]) =>
  bytes(
    field,
    values.flatMap((v) => varint(v)),
  );

/* ---------- ONNX 訊息 ---------- */

const FLOAT = 1;

function tensorShape(dims: readonly number[]) {
  return dims.flatMap((d) => bytes(1, int(1, d)));
}

function valueInfo(name: string, dims: readonly number[]) {
  const tensorType = [...int(1, FLOAT), ...bytes(2, tensorShape(dims))];
  return [...str(1, name), ...bytes(2, bytes(1, tensorType))];
}

function initializer(name: string, dims: readonly number[], values: readonly number[]) {
  return [...int64s(1, dims), ...int(2, FLOAT), ...floats(4, values), ...str(8, name)];
}

function node(op: string, name: string, inputs: readonly string[], outputs: readonly string[]) {
  return [
    ...inputs.flatMap((i) => str(1, i)),
    ...outputs.flatMap((o) => str(2, o)),
    ...str(3, name),
    ...str(4, op),
  ];
}

export interface FakeSegOptions {
  /** R、G、B 的權重 */
  weights?: readonly [number, number, number];
  bias?: number;
  /** 推論尺寸（預設 1024，同真模型） */
  size?: number;
}

/** 產生假的去背模型（ONNX 位元組） */
export function fakeSegModel({
  weights = [-4, -4, -4],
  bias = 6,
  size = 1024,
}: FakeSegOptions = {}): Uint8Array {
  const graph = [
    ...bytes(1, node('Conv', 'conv', ['img', 'w', 'b'], ['logit'])),
    ...bytes(1, node('Sigmoid', 'sigmoid', ['logit'], ['mask'])),
    ...str(2, 'fake-anime-seg'),
    ...bytes(5, initializer('w', [1, 3, 1, 1], weights)),
    ...bytes(5, initializer('b', [1], [bias])),
    ...bytes(11, valueInfo('img', [1, 3, size, size])),
    ...bytes(12, valueInfo('mask', [1, 1, size, size])),
  ];
  const model = [
    ...int(1, 7),
    ...str(2, 'trpg-toolkit-tests'),
    ...str(3, '1'),
    ...bytes(7, graph),
    ...bytes(8, [...str(1, ''), ...int(2, 11)]),
  ];
  return new Uint8Array(model);
}

/** 假模型對一個像素（0～1 的 RGB）算出的值（float32，與推論結果最多差最後幾位） */
export function fakeSegValue(
  r: number,
  g: number,
  b: number,
  { weights = [-4, -4, -4], bias = 6 }: FakeSegOptions = {},
): number {
  const z = bias + weights[0] * r + weights[1] * g + weights[2] * b;
  return Math.fround(1 / (1 + Math.exp(-z)));
}
