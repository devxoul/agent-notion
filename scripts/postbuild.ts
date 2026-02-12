import { readFileSync, writeFileSync } from 'node:fs'

const cliFiles = ['dist/src/platforms/notionbot/cli.js', 'dist/src/platforms/notion/cli.js']

for (const file of cliFiles) {
  const content = readFileSync(file, 'utf8')
  const updated = content.replace('#!/usr/bin/env bun', '#!/usr/bin/env node')
  writeFileSync(file, updated)
}

console.log(`Updated shebang in ${cliFiles.length} CLI files`)
