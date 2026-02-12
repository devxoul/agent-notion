#!/usr/bin/env bun

import { Command } from 'commander'
import pkg from '../../../package.json'
import { authCommand } from './commands/index'

const program = new Command()

program
  .name('agent-notion')
  .description('Notion unofficial API CLI for AI agents')
  .version(pkg.version)

program.addCommand(authCommand)

program.parse(process.argv)

export { program }
