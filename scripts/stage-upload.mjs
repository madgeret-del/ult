// Stages a clean copy of the project for a GitHub web upload (no build junk).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DST = path.join(path.dirname(SRC), 'ult-github-upload')
const SKIP_DIRS = new Set(['node_modules', 'out', 'release', 'dist', '.zcode'])

fs.rmSync(DST, { recursive: true, force: true })
fs.mkdirSync(DST, { recursive: true })

// LICENSE (package.json declares MIT)
const LICENSE = `MIT License

Copyright (c) 2026 ult contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`
fs.writeFileSync(path.join(SRC, 'LICENSE'), LICENSE)
fs.writeFileSync(path.join(DST, 'LICENSE'), LICENSE)

let count = 1
function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue
    if (e.name === 'LICENSE') continue // already staged
    const s = path.join(dir, e.name)
    const r = rel ? rel + '/' + e.name : e.name
    if (e.isDirectory()) walk(s, r)
    else {
      fs.mkdirSync(path.dirname(path.join(DST, r)), { recursive: true })
      fs.copyFileSync(s, path.join(DST, r))
      count++
    }
  }
}
walk(SRC, '')
console.log(`staged ${count} files -> ${DST}`)
