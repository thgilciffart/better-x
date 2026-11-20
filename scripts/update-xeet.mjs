import { createHash } from 'node:crypto'
import { cp, mkdir, writeFile } from 'node:fs/promises'

const packageRoot = new URL('../node_modules/@xeet/core/', import.meta.url)
const destination = new URL('../extension/vendor/xeet/', import.meta.url)
const browserBuild = new URL('https://xeet-rs.vercel.app/wasm/d8cf89a6dde754d6/')
const browserFiles = {
  'xeet_wasm.js': 'd29637061d7f3beff2e2853fc565d08b3e7e752d013720c5c68712e9bc0b97f8',
  'xeet_wasm_bg.wasm': '858334fc1dea95fc76498b6a9a688aafc854ede3f194600db2a53da15f4f6e0d',
}

const bundle = await Promise.all(Object.entries(browserFiles).map(async ([name, expected]) => {
  const response = await fetch(new URL(name, browserBuild), { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Cannot download ${name} (HTTP ${response.status})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== expected) {
    throw new Error(`Xeet checksum mismatch for ${name}`)
  }
  return [name, bytes]
}))

await mkdir(destination, { recursive: true })
await Promise.all([
  ...bundle.map(([name, bytes]) => writeFile(new URL(name, destination), bytes)),
  ...['abi.js', 'fonts.js', 'resolve.js'].map(name => cp(new URL('src/' + name, packageRoot), new URL(name, destination))),
  mkdir(new URL('fonts/', destination), { recursive: true }).then(() => cp(new URL('wasm/fonts/packs.json', packageRoot), new URL('fonts/packs.json', destination))),
  cp(new URL('LICENSE', packageRoot), new URL('LICENSE', destination)),
])
console.log('Updated the pinned Xeet build in extension/vendor/xeet.')
