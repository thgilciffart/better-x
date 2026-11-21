import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const only = process.argv.slice(2)
const files = (await readdir(here)).filter(name => name.endsWith('.cjs')).sort()
  .filter(name => !only.length || only.some(match => name.includes(match)))
const extension = process.env.BETTER_X_EXTENSION || join(here, '..', 'extension')
const results = []

for (const file of files) {
  const started = Date.now()
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, [join(here, file)], {
      env: { ...process.env, BETTER_X_EXTENSION: extension },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('close', code => resolve({ code, output }))
  })
  const pass = result.code === 0
  const summary = result.output.split('\n').filter(line => line.includes('PASS:')).at(-1)?.replace('PASS: ', '')
  const failure = result.output.split('\n').filter(line => /AssertionError|Error:|Timeout/.test(line))[0]
  results.push({ file, pass, ms: Date.now() - started, summary, failure })
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${file.padEnd(36)} ${((Date.now() - started) / 1000).toFixed(1)}s ${pass ? summary ?? '' : failure ?? ''}`)
}

const failed = results.filter(result => !result.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  for (const file of failed) console.log(`  failed: ${file.file}`)
  process.exitCode = 1
}
