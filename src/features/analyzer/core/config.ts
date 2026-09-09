// Модель конфига: проверка, нормализация, значения по умолчанию.
import { REGEX_DEFAULTS, type InstructionType, type RegexParams } from './instructions';
import { PRESETS, presetByKey, type Preset } from './presets';

export const CONFIG_FORMAT = 'panalyzer-config';
export const CONFIG_VERSION = 1;
export const CHARS_ID = 'chars';

export interface Instruction {
  id: string;
  type: InstructionType;
  title: string;
  enabled: boolean;
  params: Partial<RegexParams>;
  barDivisor: number;
  derivedTitle: string;
  description: string;
}

export interface AnalyzerConfig {
  format: typeof CONFIG_FORMAT;
  version: typeof CONFIG_VERSION;
  name: string;
  instructions: Instruction[];
}

export interface ConfigCheck {
  config: AnalyzerConfig | null;
  errors: string[];
  warnings: string[];
}

export function uid(prefix = 'i'): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

export function newInstruction(
  type: InstructionType,
  overrides: Partial<Instruction> = {},
): Instruction {
  return {
    id: type === 'chars' ? CHARS_ID : uid(),
    type,
    title: type === 'chars' ? 'Символы' : 'Регулярка',
    enabled: true,
    params: type === 'regex' ? { ...REGEX_DEFAULTS } : {},
    barDivisor: type === 'chars' ? 1000 : 1,
    derivedTitle: type === 'chars' ? 'тыс. символов' : '',
    description: '',
    ...overrides,
  };
}

/** Инструкция из шаблона (обычная regex-инструкция). */
export function instructionFromPreset(
  preset: Preset,
  overrides: Partial<Instruction> = {},
): Instruction {
  return newInstruction('regex', {
    title: preset.title,
    description: preset.description,
    params: { ...REGEX_DEFAULTS, ...preset.params },
    ...overrides,
  });
}

export function regexParams(instruction: Instruction): RegexParams {
  return { ...REGEX_DEFAULTS, ...instruction.params };
}

export function defaultConfig(): AnalyzerConfig {
  const presets = ['dash', 'nea', 'etone']
    .map((key) => presetByKey(key))
    .filter((preset): preset is Preset => Boolean(preset))
    .map((preset) => instructionFromPreset(preset, { id: `p_${preset.key}` }));
  return {
    format: CONFIG_FORMAT,
    version: CONFIG_VERSION,
    name: 'Базовый',
    instructions: [newInstruction('chars'), ...presets],
  };
}

/** Ключ кэша результатов: меняется только от того, что влияет на вычисление. */
export function instructionKey(
  instruction: Pick<Instruction, 'type' | 'params'>,
): string {
  return JSON.stringify([instruction.type, instruction.params ?? {}]);
}

// прежние специальные типы aio_v2 превращаются в шаблоны-регулярки
const LEGACY_TYPES: Record<string, string> = {
  dash: 'dash',
  nea: 'nea',
  etone: 'etone',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRegexParams(
  raw: unknown,
  warn: (message: string) => void,
  where: string,
): RegexParams {
  const params: RegexParams = { ...REGEX_DEFAULTS };
  if (!isRecord(raw)) return params;
  for (const key of Object.keys(raw)) {
    if (!(key in REGEX_DEFAULTS))
      warn(`${where}: параметр «${key}» типу «regex» не нужен, отброшен`);
  }
  params.query = typeof raw.query === 'string' ? raw.query : String(raw.query ?? '');
  params.mode = raw.mode === 'regex' ? 'regex' : 'literal';
  params.unit = raw.unit === 'lines' ? 'lines' : 'matches';
  params.caseSensitive = Boolean(raw.caseSensitive);
  params.multiline = Boolean(raw.multiline);
  params.contextLines = Number.isInteger(raw.contextLines)
    ? Math.max(0, Math.min(5, raw.contextLines as number))
    : 1;
  return params;
}

/** Приводит произвольный объект к валидному конфигу. */
export function normalizeConfig(raw: unknown): ConfigCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(message);
  if (!isRecord(raw))
    return { config: null, errors: ['ожидался JSON-объект'], warnings };
  if (raw.format !== CONFIG_FORMAT)
    errors.push(`поле format должно быть «${CONFIG_FORMAT}»`);
  if (raw.version !== CONFIG_VERSION)
    errors.push(`поддерживается только version ${CONFIG_VERSION}`);
  if (!Array.isArray(raw.instructions))
    errors.push('поле instructions должно быть массивом');
  if (errors.length || !Array.isArray(raw.instructions))
    return { config: null, errors, warnings };

  const seen = new Set<string>();
  const instructions: Instruction[] = [];
  let chars: Instruction | null = null;
  raw.instructions.forEach((item: unknown, index: number) => {
    const where = `инструкция ${index + 1}`;
    if (!isRecord(item)) {
      errors.push(`${where}: не объект`);
      return;
    }
    let type = String(item.type ?? '');
    let params: Partial<RegexParams> = {};
    let presetForLegacy: Preset | undefined;
    if (LEGACY_TYPES[type]) {
      presetForLegacy = presetByKey(LEGACY_TYPES[type] ?? '');
      warn(
        `${where}: тип «${type}» устарел и заменён шаблоном-регуляркой «${presetForLegacy?.title ?? type}»`,
      );
      type = 'regex';
    }
    if (type !== 'chars' && type !== 'regex') {
      errors.push(`${where}: неизвестный тип «${type}»`);
      return;
    }
    if (type === 'chars' && chars) {
      warn(`${where}: повторная инструкция «Символы» отброшена`);
      return;
    }
    let id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : uid();
    if (type === 'chars') id = CHARS_ID;
    if (seen.has(id)) {
      const fresh = uid();
      warn(`${where}: id «${id}» уже занят, заменён на «${fresh}»`);
      id = fresh;
    }
    seen.add(id);
    if (type === 'regex')
      params = presetForLegacy
        ? { ...presetForLegacy.params }
        : normalizeRegexParams(item.params, warn, where);
    let barDivisor = Number(item.barDivisor);
    if (!Number.isFinite(barDivisor) || barDivisor <= 0) {
      if (item.barDivisor !== undefined)
        warn(`${where}: barDivisor должен быть положительным числом, взят 1`);
      barDivisor = type === 'chars' ? 1000 : 1;
    }
    const fallbackTitle = presetForLegacy
      ? presetForLegacy.title
      : type === 'chars'
        ? 'Символы'
        : 'Регулярка';
    const instruction: Instruction = {
      id,
      type,
      title:
        typeof item.title === 'string' && item.title.trim()
          ? item.title.trim()
          : fallbackTitle,
      enabled: item.enabled !== false,
      params,
      barDivisor,
      derivedTitle:
        typeof item.derivedTitle === 'string'
          ? item.derivedTitle
          : type === 'chars' && barDivisor === 1000
            ? 'тыс. символов'
            : '',
      description:
        typeof item.description === 'string'
          ? item.description
          : (presetForLegacy?.description ?? ''),
    };
    if (type === 'chars') chars = instruction;
    else instructions.push(instruction);
  });
  if (errors.length) return { config: null, errors, warnings };
  if (!chars) {
    chars = newInstruction('chars');
    warn('инструкция «Символы» отсутствовала и добавлена');
  }
  (chars as Instruction).enabled = true;
  return {
    config: {
      format: CONFIG_FORMAT,
      version: CONFIG_VERSION,
      name: typeof raw.name === 'string' ? raw.name : '',
      instructions: [chars as Instruction, ...instructions],
    },
    errors,
    warnings,
  };
}

export function parseConfigText(text: string): ConfigCheck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      config: null,
      errors: [`не JSON: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
    };
  }
  return normalizeConfig(raw);
}

export function serializeConfig(config: AnalyzerConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export { PRESETS };
