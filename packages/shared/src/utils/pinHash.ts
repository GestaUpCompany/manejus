/**
 * Hash de PIN com PBKDF2 + salt aleatório.
 *
 * Formato novo: "pbkdf2:100000:<salt_hex>:<hash_hex>"
 * Formato antigo (legacy): 64-char hex string (SHA-256 sem salt)
 *
 * verifyPin detecta o formato e usa o algoritmo apropriado.
 * hashPin sempre gera o formato novo.
 */

const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BYTES = 32

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export async function hashPin(pin: string, funcionarioId: string, fazendaId: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const saltHex = toHex(salt.buffer)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${fazendaId}:${funcionarioId}:${pin.trim()}`),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_BYTES * 8
  )

  const hashHex = toHex(derivedBits)
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`
}

export async function verifyPin(
  pin: string,
  pinHash: string | null | undefined,
  funcionarioId: string,
  fazendaId: string
): Promise<boolean> {
  if (!pinHash) return false

  // Formato novo: pbkdf2:iterations:salt:hash
  if (pinHash.startsWith('pbkdf2:')) {
    const parts = pinHash.split(':')
    if (parts.length !== 4) return false
    const iterations = parseInt(parts[1], 10)
    const salt = fromHex(parts[2])
    const expectedHash = parts[3]

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`${fazendaId}:${funcionarioId}:${pin.trim()}`),
      'PBKDF2',
      false,
      ['deriveBits']
    )

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      KEY_BYTES * 8
    )

    const computedHash = toHex(derivedBits)
    return computedHash === expectedHash
  }

  // Formato antigo (legacy): SHA-256 sem salt
  // Mantido para compatibilidade com PINs existentes.
  // Quando o admin redefinir o PIN, o novo hash usara PBKDF2.
  const raw = `${fazendaId}:${funcionarioId}:${pin.trim()}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return toHex(digest) === pinHash
}
