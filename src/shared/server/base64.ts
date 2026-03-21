export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }

  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export const parseDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const [, mimeType, base64] = match;
  return { mimeType, base64 };
};
