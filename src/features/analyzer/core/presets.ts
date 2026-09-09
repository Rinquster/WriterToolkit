// Шаблоны инструкций-регулярок: обычные regex-инструкции, которые можно править как любые другие.
import { WB_AFTER, WB_BEFORE } from './text';
import type { RegexParams } from './instructions';

// граница предложения, как в split_sentences aio_v2: знак конца + кавычки + пробел + заглавная/кавычка/тире
const SENTENCE_END = '[.!?…]+[»”"\']*\\s+(?=[А-ЯЁA-Z«"„“\\-—•])';
// «ещё не конец предложения и не пустая строка»
const INSIDE_SENTENCE = `(?:(?!${SENTENCE_END})(?!\\n\\s*\\n)[\\s\\S])`;
// приближение профилей фраз из aio_v2: предлог и финитный глагол после «не» отбрасываются
const PREPOSITION = '(?:без|в|для|за|из|к|на|над|о|об|обо|от|перед|по|под|при|про|с|у)';
const NOT_PREPOSITION = `(?!${PREPOSITION}${WB_AFTER})`;
const VERB_ENDINGS =
  '(?:ает|яет|ует|ет|ит|ешь|ишь|ете|ите|аю|яю|ую|ают|яют|уют|лся|лась|лось|лись|ется|ится|ал|ала|ало|али|ил|ила|ило|или|ыл|ыла|ыло|ыли|ел|ела|ело|ели|ул|ула|уло|ули|шли)';
const NOT_VERB = `(?!\\p{L}{2,}${VERB_ENDINGS}${WB_AFTER})`;
const SKIP_LEFT = '(?:(?:просто|только|лишь|ещё|еще|и|же)\\s+)*';
const SKIP_RIGHT =
  '(?:(?:был|была|было|были|будет|есть|просто|только|лишь|ещё|еще|и|же|тоже)\\s+)*';

export interface Preset {
  key: string;
  title: string;
  description: string;
  params: RegexParams;
}

const base: RegexParams = {
  query: '',
  mode: 'regex',
  caseSensitive: false,
  multiline: false,
  unit: 'matches',
  contextLines: 1,
};

export const PRESETS: readonly Preset[] = [
  {
    key: 'dash',
    title: 'Тире',
    description:
      'Строки с длинным тире внутри; реплики (строка начинается с —) и цитаты (с «) не считаются.',
    params: {
      ...base,
      query: '^(?![^\\S\\n]*[—«])[^\\r\\n]*—[^\\r\\n]*',
      caseSensitive: true,
      multiline: true,
      unit: 'lines',
    },
  },
  {
    key: 'nea',
    title: 'не…, а…',
    description:
      'Конструкции «не X, а Y» внутри предложения, а также предложение с «не», за которым идёт предложение с «А».',
    params: {
      ...base,
      query: `${WB_BEFORE}не${WB_AFTER}(?:${INSIDE_SENTENCE}*?,\\s+а${WB_AFTER}|${INSIDE_SENTENCE}*?[.!?…]+[»”"']*\\s+А${WB_AFTER})`,
    },
  },
  {
    key: 'etone',
    title: 'это не…, это…',
    description:
      'Повторы «это (был) не X, это Y» в одном или двух соседних предложениях; после «не» и после второго «это» не предлог и не глагол.',
    params: {
      ...base,
      query:
        `${WB_BEFORE}это${WB_AFTER}(?:\\s+(?:был|была|было|были|будет|есть|же|ведь|уже|ещё|еще)){0,3}\\s+не\\s+${SKIP_LEFT}${NOT_PREPOSITION}${NOT_VERB}` +
        `${INSIDE_SENTENCE}*?(?:${SENTENCE_END}${INSIDE_SENTENCE}*?)?${WB_BEFORE}это${WB_AFTER}\\s+${SKIP_RIGHT}${NOT_PREPOSITION}\\p{L}`,
    },
  },
  {
    key: 'nea_strict',
    title: 'не…, а… (в предложении)',
    description: 'Только «не X, а Y» внутри одного предложения.',
    params: {
      ...base,
      query: `${WB_BEFORE}не${WB_AFTER}${INSIDE_SENTENCE}*?,\\s+а${WB_AFTER}`,
    },
  },
];

export function presetByKey(key: string): Preset | undefined {
  return PRESETS.find((preset) => preset.key === key);
}
