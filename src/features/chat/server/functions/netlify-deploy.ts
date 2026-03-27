import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSession } from '@/features/auth/server/session';
import { getServerEnv } from '@/shared/server/env';

const crc32Table = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc32Table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(content: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode('index.html');
  const crc = crc32(content);
  const size = content.length;

  const local = new Uint8Array(30 + name.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, size, true);
  lv.setUint32(22, size, true);
  lv.setUint16(26, name.length, true);
  local.set(name, 30);

  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, size, true);
  cv.setUint32(24, size, true);
  cv.setUint16(28, name.length, true);
  central.set(name, 46);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length + size, true);

  const zip = new Uint8Array(local.length + size + central.length + eocd.length);
  let off = 0;
  zip.set(local, off);
  off += local.length;
  zip.set(content, off);
  off += size;
  zip.set(central, off);
  off += central.length;
  zip.set(eocd, off);
  return zip;
}

const inputSchema = z.object({ html: z.string().min(1) });

export const deployToNetlifyFn = createServerFn({ method: 'POST' })
  .inputValidator(inputSchema)
  .handler(async ({ data }) => {
    await requireSession();

    const { NETIFY_TOKEN } = getServerEnv();
    if (!NETIFY_TOKEN) {
      throw new Error('Netlify 未配置');
    }

    const zipBytes = buildZip(new TextEncoder().encode(data.html));
    const zipCopy = new Uint8Array(zipBytes.length);
    zipCopy.set(zipBytes);
    const resp = await fetch('https://api.netlify.com/api/v1/sites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        Authorization: `Bearer ${NETIFY_TOKEN}`,
      },
      body: new Blob([zipCopy]),
    });

    if (!resp.ok) {
      throw new Error(`Netlify deploy failed: ${resp.status}`);
    }

    const { ssl_url } = z.object({ ssl_url: z.string() }).parse(await resp.json());
    return { url: ssl_url };
  });
