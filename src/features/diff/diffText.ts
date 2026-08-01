import { diffArrays, diffWordsWithSpace, type Change } from 'diff';

export type DiffMode = 'words' | 'lines';

export interface TextDiffOptions {
  mode: DiffMode;
  ignoreCase: boolean;
}

export interface TextDiffResult {
  changes: Change[];
  timedOut: boolean;
  addedCharacters: number;
  removedCharacters: number;
}

export function compareText(
  before: string,
  after: string,
  options: TextDiffOptions,
): TextDiffResult {
  const changes =
    options.mode === 'lines'
      ? diffArrays(tokenizeLines(before), tokenizeLines(after), {
          comparator: options.ignoreCase
            ? (left, right) =>
                left.toLocaleLowerCase('ru-RU') === right.toLocaleLowerCase('ru-RU')
            : undefined,
          timeout: 500,
        })?.map((change): Change => ({
          ...change,
          value: change.value.join(''),
        }))
      : diffWordsWithSpace(before, after, {
          ignoreCase: options.ignoreCase,
          timeout: 500,
        });

  if (!changes) {
    return { changes: [], timedOut: true, addedCharacters: 0, removedCharacters: 0 };
  }

  return {
    changes,
    timedOut: false,
    addedCharacters: changes.reduce(
      (total, change) => total + (change.added ? change.value.length : 0),
      0,
    ),
    removedCharacters: changes.reduce(
      (total, change) => total + (change.removed ? change.value.length : 0),
      0,
    ),
  };
}

function tokenizeLines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}
