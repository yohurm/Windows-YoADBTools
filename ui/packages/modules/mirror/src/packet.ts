/** 二进制投屏帧：32 字节小端头 + payload。 */

export const HEADER_SIZE = 32;
export const HEADER_VERSION = 1;
export const CODEC_H264 = 0;
export const FLAG_CONFIG = 0b0000_0001;
export const FLAG_KEYFRAME = 0b0000_0010;

export interface MirrorFrame {
  generation: number;
  width: number;
  height: number;
  config: boolean;
  keyframe: boolean;
  pts: number;
  codec: number;
  dropped: number;
  payload: Uint8Array;
}

export function parseMirrorFrame(bytes: Uint8Array): MirrorFrame | null {
  if (bytes.byteLength < HEADER_SIZE || bytes[0] !== HEADER_VERSION) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint8(1);
  return {
    codec: view.getUint8(2),
    width: view.getUint32(4, true),
    height: view.getUint32(8, true),
    dropped: view.getUint32(12, true),
    generation: Number(view.getBigUint64(16, true)),
    pts: Number(view.getBigUint64(24, true)),
    config: (flags & FLAG_CONFIG) !== 0,
    keyframe: (flags & FLAG_KEYFRAME) !== 0,
    payload: bytes.subarray(HEADER_SIZE),
  };
}

export function encodeMirrorFrame(frame: MirrorFrame): Uint8Array {
  let flags = 0;
  if (frame.config) flags |= FLAG_CONFIG;
  if (frame.keyframe) flags |= FLAG_KEYFRAME;
  const out = new Uint8Array(HEADER_SIZE + frame.payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, HEADER_VERSION);
  view.setUint8(1, flags);
  view.setUint8(2, frame.codec);
  view.setUint8(3, 0);
  view.setUint32(4, frame.width, true);
  view.setUint32(8, frame.height, true);
  view.setUint32(12, frame.dropped, true);
  view.setBigUint64(16, BigInt(frame.generation), true);
  view.setBigUint64(24, BigInt(frame.pts), true);
  out.set(frame.payload, HEADER_SIZE);
  return out;
}
