// Generates build/icon.ico (multi-size) and build/icon.png — zero dependencies.
// Design: rounded square with an indigo→violet gradient and a white "❯»" prompt mark.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })

// ---------- PNG encoding ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // rows prefixed with filter byte 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride) : null
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---------- drawing ----------

const MASTER = 2048

function segDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)))
  const dx = px - (ax + abx * t)
  const dy = py - (ay + aby * t)
  return Math.sqrt(dx * dx + dy * dy)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function renderMaster() {
  const N = MASTER
  const buf = Buffer.alloc(N * N * 4)
  const A = [0x6a, 0x5c, 0xff]
  const B = [0xa8, 0x4d, 0xff]
  const r = 0.2
  const stroke = [
    { pts: [[0.3, 0.32], [0.52, 0.5], [0.3, 0.68]], w: 0.085, alpha: 255 },
    { pts: [[0.47, 0.385], [0.615, 0.5], [0.47, 0.615]], w: 0.072, alpha: 140 }
  ]

  for (let y = 0; y < N; y++) {
    const fy = (y + 0.5) / N
    for (let x = 0; x < N; x++) {
      const fx = (x + 0.5) / N
      // rounded-rect SDF
      const dx = Math.max(Math.abs(fx - 0.5) - (0.5 - r), 0)
      const dy = Math.max(Math.abs(fy - 0.5) - (0.5 - r), 0)
      const sdf = Math.sqrt(dx * dx + dy * dy) - r
      if (sdf >= 0) continue // transparent

      // diagonal gradient
      const t = Math.min(1, Math.max(0, (fx + fy) / 1.6))
      let cr = lerp(A[0], B[0], t)
      let cg = lerp(A[1], B[1], t)
      let cb = lerp(A[2], B[2], t)
      let ca = 255

      // chevron strokes (white capsules)
      for (const s of stroke) {
        for (let i = 0; i < s.pts.length - 1; i++) {
          const d = segDist(fx, fy, s.pts[i][0], s.pts[i][1], s.pts[i + 1][0], s.pts[i + 1][1])
          if (d < s.w / 2) {
            const cover = Math.min(1, (s.w / 2 - d) * N) // soft edge at master res
            const a = (s.alpha / 255) * Math.max(cover, d < s.w / 2 - 1 ? 1 : 0)
            cr = lerp(cr, 255, a)
            cg = lerp(cg, 255, a)
            cb = lerp(cb, 255, a)
          }
        }
      }

      const i = (y * N + x) * 4
      buf[i] = cr
      buf[i + 1] = cg
      buf[i + 2] = cb
      buf[i + 3] = ca
    }
  }
  return buf
}

function downsample(master, target) {
  const step = MASTER / target
  const out = Buffer.alloc(target * target * 4)
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0
      const x0 = Math.floor(x * step)
      const y0 = Math.floor(y * step)
      const x1 = Math.floor((x + 1) * step)
      const y1 = Math.floor((y + 1) * step)
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * MASTER + sx) * 4
          const a = master[i + 3]
          rSum += master[i] * a
          gSum += master[i + 1] * a
          bSum += master[i + 2] * a
          aSum += a
        }
      }
      const o = (y * target + x) * 4
      if (aSum > 0) {
        out[o] = Math.round(rSum / aSum)
        out[o + 1] = Math.round(gSum / aSum)
        out[o + 2] = Math.round(bSum / aSum)
        out[o + 3] = Math.round(aSum / ((x1 - x0) * (y1 - y0)))
      }
    }
  }
  return out
}

// ---------- ICO assembly ----------

const SIZES = [16, 24, 32, 48, 64, 128, 256]

const master = renderMaster()
const pngs = SIZES.map((s) => {
  const png = encodePNG(s, s, downsample(master, s))
  return { size: s, png }
})

const entries = Buffer.alloc(6 + 16 * pngs.length)
entries[2] = 1 // type: icon
entries[4] = pngs.length
let offset = entries.length
pngs.forEach((p, i) => {
  const e = 6 + 16 * i
  entries[e] = p.size === 256 ? 0 : p.size
  entries[e + 1] = p.size === 256 ? 0 : p.size
  entries[e + 2] = 0 // palette
  entries[e + 3] = 0
  entries.writeUInt16LE(1, e + 4) // planes
  entries.writeUInt16LE(32, e + 6) // bpp
  entries.writeUInt32LE(p.png.length, e + 8)
  entries.writeUInt32LE(offset, e + 12)
  offset += p.png.length
})

const ico = Buffer.concat([entries, ...pngs.map((p) => p.png)])
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePNG(512, 512, downsample(master, 512)))
console.log(`build/icon.ico (${pngs.length} sizes, ${(ico.length / 1024).toFixed(0)} KB) + build/icon.png written`)
