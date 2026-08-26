/**
 * H.264 配置包：Annex-B ↔ avcC，供 WebCodecs `VideoDecoder.configure`。
 */

function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

export function isAnnexB(data: Uint8Array): boolean {
  return (
    data.length >= 3 &&
    data[0] === 0 &&
    data[1] === 0 &&
    (data[2] === 1 || (data.length >= 4 && data[2] === 0 && data[3] === 1))
  );
}

/** 切 Annex-B NALU（不含起始码）。 */
export function splitAnnexB(data: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  let i = 0;
  while (i + 3 <= data.length) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      starts.push(i);
      i += 3;
      continue;
    }
    if (i + 4 <= data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      starts.push(i);
      i += 4;
      continue;
    }
    i += 1;
  }
  const nalus: Uint8Array[] = [];
  for (let s = 0; s < starts.length; s += 1) {
    const at = starts[s]!;
    const sc = data[at + 2] === 1 ? 3 : 4;
    const begin = at + sc;
    const end = s + 1 < starts.length ? starts[s + 1]! : data.length;
    if (end > begin) nalus.push(data.subarray(begin, end));
  }
  return nalus;
}

export function codecFromSps(sps: Uint8Array): string {
  if (sps.length < 4) return "avc1.42C01E";
  return `avc1.${hex2(sps[1]!)}${hex2(sps[2]!)}${hex2(sps[3]!)}`;
}

/** 配置包 → avcC description + codec 字符串。 */
export function prepareDescription(config: Uint8Array): { description: Uint8Array; codec: string } {
  if (config.length >= 4 && config[0] === 1) {
    return {
      description: config,
      codec: `avc1.${hex2(config[1]!)}${hex2(config[2]!)}${hex2(config[3]!)}`,
    };
  }
  const nalus = splitAnnexB(config);
  const spsList = nalus.filter((n) => n.length > 0 && (n[0]! & 0x1f) === 7);
  const ppsList = nalus.filter((n) => n.length > 0 && (n[0]! & 0x1f) === 8);
  const sps = spsList[0];
  const codec = sps ? codecFromSps(sps) : "avc1.42C01E";
  let size = 7;
  for (const n of spsList) size += 2 + n.length;
  size += 1;
  for (const n of ppsList) size += 2 + n.length;
  const avcC = new Uint8Array(size);
  let o = 0;
  avcC[o++] = 1;
  avcC[o++] = sps?.[1] ?? 0x42;
  avcC[o++] = sps?.[2] ?? 0xc0;
  avcC[o++] = sps?.[3] ?? 0x1e;
  avcC[o++] = 0xff;
  avcC[o++] = 0xe0 | (spsList.length & 0x1f);
  for (const n of spsList) {
    avcC[o++] = (n.length >> 8) & 0xff;
    avcC[o++] = n.length & 0xff;
    avcC.set(n, o);
    o += n.length;
  }
  avcC[o++] = ppsList.length & 0xff;
  for (const n of ppsList) {
    avcC[o++] = (n.length >> 8) & 0xff;
    avcC[o++] = n.length & 0xff;
    avcC.set(n, o);
    o += n.length;
  }
  return { description: avcC, codec };
}

/** Annex-B 帧转 4 字节长度前缀（AVC），供配了 avcC 的 WebCodecs。 */
export function toLengthPrefixed(data: Uint8Array): Uint8Array {
  if (!isAnnexB(data)) return data;
  const nalus = splitAnnexB(data);
  let total = 0;
  for (const n of nalus) total += 4 + n.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const n of nalus) {
    out[o++] = (n.length >>> 24) & 0xff;
    out[o++] = (n.length >>> 16) & 0xff;
    out[o++] = (n.length >>> 8) & 0xff;
    out[o++] = n.length & 0xff;
    out.set(n, o);
    o += n.length;
  }
  return out;
}
