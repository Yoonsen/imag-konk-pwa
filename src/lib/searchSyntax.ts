export type SearchMatchMode = 'near' | 'sequence';

export interface ComparisonExpression {
  label: string;
  termGroups: string[][];
  matchMode: SearchMatchMode;
}

export function parseTermGroups(rawInput: string): string[][] | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('[[')) {
    const parsed = JSON.parse(trimmed);
    const isValid =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((group) =>
        Array.isArray(group) &&
        group.length > 0 &&
        group.every((term) => typeof term === 'string' && term.trim().length > 0)
      );

    if (!isValid) {
      throw new Error('termGroups must be JSON like [["a","b"],["c"]].');
    }

    return parsed.map((group: string[]) => group.map((term) => term.trim()));
  }

  const groups: string[][] = [];
  const bracketRegex = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = bracketRegex.exec(trimmed)) !== null) {
    const terms = match[1]
      .split(',')
      .map((term) => term.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    if (terms.length > 0) groups.push(terms);
  }

  const leftover = trimmed.replace(bracketRegex, ' ').trim();
  if (leftover) {
    leftover
      .split(/\s+/)
      .map((term) => term.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
      .forEach((term) => groups.push([term]));
  }

  if (groups.length === 0) {
    throw new Error('No valid term groups found.');
  }

  return groups;
}

export function toSingleTermGroups(rawQuery: string): string[][] {
  return rawQuery
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => [token]);
}

const splitComparisonBody = (body: string): string[] => {
  const expressions: string[] = [];
  let current = '';
  let squareDepth = 0;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    const previous = body[index - 1];
    if ((character === '"' || character === "'") && previous !== '\\') {
      quote = quote === character ? null : quote ? quote : character;
      current += character;
      continue;
    }
    if (!quote) {
      if (character === '[') squareDepth += 1;
      if (character === ']') squareDepth -= 1;
      if (squareDepth < 0) throw new Error('Ubalanserte hakeparenteser i sammenligningen.');
      if (character === ';' && squareDepth === 0) {
        if (current.trim()) expressions.push(current.trim());
        current = '';
        continue;
      }
    }
    current += character;
  }

  if (quote) throw new Error('Ubalanserte anførselstegn i sammenligningen.');
  if (squareDepth !== 0) throw new Error('Ubalanserte hakeparenteser i sammenligningen.');
  if (current.trim()) expressions.push(current.trim());
  return expressions;
};

export function parseComparisonExpressions(rawInput: string): ComparisonExpression[] | null {
  const trimmed = rawInput.trim();
  const startsComparison = trimmed.startsWith('{');
  const endsComparison = trimmed.endsWith('}');
  if (!startsComparison && !endsComparison) return null;
  if (!startsComparison || !endsComparison) {
    throw new Error('Sammenligninger må omsluttes av { og }.');
  }

  const expressions = splitComparisonBody(trimmed.slice(1, -1));
  if (expressions.length === 0) {
    throw new Error('Krøllparentesene må inneholde minst ett søk.');
  }

  return expressions.map((label) => {
    const quoted = /^"[^"]+"$/.test(label);
    const source = quoted ? label.slice(1, -1).trim() : label;
    const termGroups = source.includes('[')
      ? parseTermGroups(source)
      : toSingleTermGroups(source);
    if (!termGroups?.length) {
      throw new Error(`Ugyldig søk i sammenligningen: ${label}`);
    }
    return {
      label,
      termGroups,
      matchMode: quoted ? 'sequence' : 'near'
    };
  });
}
