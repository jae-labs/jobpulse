// PostgreSQL table discovery order varies between rebuilt and existing databases.
export function normalizePythonModels(source) {
  const declarations = [...source.matchAll(/^class (\w+)\((BaseModel|TypedDict)\):/gm)];
  const allClasses = [...source.matchAll(/^class /gm)];
  if (!declarations.length || declarations.length !== allClasses.length) {
    throw new Error('Unexpected generated Python class declaration');
  }
  const prefix = source.slice(0, declarations[0].index).trimEnd();
  const blocks = declarations.map((declaration, index) => ({
    name: declaration[1],
    body: source.slice(declaration.index, declarations[index + 1]?.index ?? source.length).trimEnd(),
  }));
  if (new Set(blocks.map(({ name }) => name)).size !== blocks.length) {
    throw new Error('Duplicate generated Python model');
  }
  blocks.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  return `${prefix}\n\n\n${blocks.map(({ body }) => body).join('\n\n\n')}\n`;
}
