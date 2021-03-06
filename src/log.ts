import chalk from 'chalk'
import { last } from './extensions'
import { Evaluation, Instruction } from './interpreter'
import { Id, Name } from './model'

const { columns = 80 } = process.stdout
const { clear, log: writeLine } = console
const { assign, keys } = Object
const { yellow, redBright, blueBright, cyan, greenBright, magenta, underline, italic, bold } = chalk

export enum LogLevel {
  ERROR,
  WARN,
  SUCCESS,
  INFO,
  DEBUG,
}

type Log = (...args: any[]) => void
type Logger = {
  info: Log,
  warn: Log,
  error: Log,
  debug: Log,
  success: Log,
  start: (title: string) => void,
  done: (title: string) => void,
  separator: (title?: string) => void,
  evaluation: (evaluation: Evaluation) => void,
  step: (evaluation: Evaluation) => void,
  resetStep: () => void,
  clear: () => void,
}

const timers: { [title: string]: [number, number] } = {}
let stepCount = 0

const logger: Logger = {
  info: () => { },
  warn: () => { },
  error: () => { },
  debug: () => { },
  success: () => { },
  start: () => { },
  done: () => { },
  separator: () => { },
  evaluation: () => { },
  step: () => { },
  resetStep: () => { },
  clear: () => { },
}

const hr = (size: number = columns) => '─'.repeat(size)

const stringifyId = (evaluation: Evaluation) => (id: Id): string => {
  const instance = evaluation.instances[id]
  const module = instance ? stringifyModule(evaluation)(instance.module) : ''
  const valueDescription = () => {
    const val = instance && instance.innerValue
    if (val === undefined) return ''
    if (['string', 'boolean', 'number', 'null'].includes(typeof val)) return `(${val})`
    if (val instanceof Array) return `(${val.map(e => typeof e === 'string' ? stringifyId(evaluation)(e) : '?').join(', ')})`
    if (val instanceof Date) return `(${val.getDate()}/${val.getMonth() + 1}/${val.getFullYear()})`
    return ''
  }
  return magenta(id.includes('-') ? `${module}#${id.slice(24)}${valueDescription()}` : id)
}

const stringifyModule = (evaluation: Evaluation) => (name: Name): string => {
  const shortName = last(name.split('.'))!
  return shortName.includes('#')
    ? shortName.split('#')[0] + stringifyId(evaluation)(shortName.split('#')[1])
    : shortName
}

const stringifyInstruction = (evaluation: Evaluation) => (instruction: Instruction): string => {
  const args = keys(instruction)
    .filter(key => key !== 'kind')
    .map(key => {
      const value = (instruction as any)[key]
      if (key === 'id') return stringifyId(evaluation)(value)
      if (key === 'module' || key === 'lookupStart') return value ? stringifyModule(evaluation)(value) : '-'
      if (key === 'body' || key.endsWith('Handler')) return '...'
      return `${value}`
    })
    .map(value => italic(value))
  return `${instruction.kind}(${args.join(', ')})`
}

const stringifyEvaluation = (evaluation: Evaluation) => {
  return [
    hr(),
    [...evaluation.frameStack].reverse().map((frame) =>
      [
        bold('Instructions:'),
        frame.instructions.map((instruction, i) =>
          i === frame.nextInstruction - 1
            ? underline(stringifyInstruction(evaluation)(instruction))
            : stringifyInstruction(evaluation)(instruction)
        ).join(', '),

        bold('\nOperand Stack:'),
        frame.operandStack.map(stringifyId(evaluation)).join(', '),

        bold('\nLocals:'),
        keys(frame.locals).map(key => `${stringifyModule(evaluation)(key)}: ${stringifyId(evaluation)(frame.locals[key])}`).join(', '),

        bold('\nResume:'),
        frame.resume,
      ].join('\n')
    ).join(`\n${hr()}\n`),
    hr(),
  ].join('\n')

  // `┌${hr(frameWidth)}┐`,
  // `├${hr(frameWidth)}┤`,
  // '└' + '┘'
}

const consoleLogger: Logger = {
  info: (...args) => writeLine(blueBright.bold('[INFO]: '), ...args),

  warn: (...args) => writeLine(yellow.bold('[WARN]: '), ...args),

  error: (...args) => writeLine(redBright.bold('[ERROR]:'), ...args),

  debug: (...args) => writeLine(cyan.bold('[DEBUG]:'), ...args),

  success: (...args) => writeLine(greenBright.bold('[GOOD]: '), ...args),

  separator: title => writeLine(greenBright(title
    ? bold(`${hr()}\n ${title}\n${hr()}`)
    : `${hr()}`
  )),

  evaluation: evaluation => writeLine(stringifyEvaluation(evaluation)),

  step: evaluation => {
    const { instructions, nextInstruction, operandStack } = last(evaluation.frameStack)!
    const instruction = instructions[nextInstruction]

    const stepTabulation = evaluation.frameStack.length - 1

    let tabulationReturn = 0
    if (instruction.kind === 'INTERRUPT') {
      const returns = [...evaluation.frameStack].reverse().findIndex(({ resume }) => resume.includes(instruction.interruption))
      tabulationReturn = returns === -1 ? stepTabulation : returns
    }

    const tabulation = instruction.kind === 'INTERRUPT'
      ? '│'.repeat(stepTabulation - tabulationReturn) + '└' + '─'.repeat(tabulationReturn - 1)
      : '│'.repeat(stepTabulation)

    consoleLogger.debug(
      `Step ${('0000' + stepCount++).slice(-4)}: ${tabulation}${stringifyInstruction(evaluation)(instruction)}`,
      `[${operandStack.map(stringifyId(evaluation)).join(', ')}]`
    )

  },

  resetStep: () => {
    stepCount = 0
  },

  start: title => {
    consoleLogger.info(`${title}...`)
    timers[title] = process.hrtime()
  },

  done: title => {
    const delta = process.hrtime(timers[title])
    delete timers[title]
    consoleLogger.info(`Done ${title}. (${(delta[0] * 1e3 + delta[1] / 1e6).toFixed(4)}ms)`)
  },

  clear,
}

export const enableLogs = (level: LogLevel = LogLevel.DEBUG) => {
  assign(logger, consoleLogger)

  if (level < LogLevel.DEBUG) assign(logger, { debug: () => { }, step: () => { } })
  if (level < LogLevel.INFO) assign(logger, { info: () => { } })
  if (level < LogLevel.SUCCESS) assign(logger, { success: () => { } })
  if (level < LogLevel.WARN) assign(logger, { warn: () => { } })
  if (level < LogLevel.ERROR) assign(logger, { error: () => { } })
}

export default logger