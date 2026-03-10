const ITERATIONS = 100_000
const KEY_LENGTH = 64
const HASH_ALGORITHM = 'SHA-256'

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<ArrayBuffer> {
  const encoded = new TextEncoder().encode(password.normalize('NFKC'))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoded.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH * 8,
  )
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!
  }
  return result === 0
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await deriveKey(password, salt)
  return `${toHex(salt.buffer as ArrayBuffer)}:${toHex(derived)}`
}

export async function verifyPassword(params: {
  hash: string
  password: string
}): Promise<boolean> {
  const [saltHex, keyHex] = params.hash.split(':')
  if (!saltHex || !keyHex) return false
  const salt = fromHex(saltHex)
  const derived = new Uint8Array(await deriveKey(params.password, salt))
  const expected = fromHex(keyHex)
  return constantTimeEqual(derived, expected)
}
