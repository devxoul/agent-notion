#!/usr/bin/env bun

import { Command } from 'commander'
import pkg from '../package.json'

const program = new Command()

program.name('agent-notion').description('Notion API CLI for AI agents').version(pkg.version)

program.parse(process.argv)

export { program }
