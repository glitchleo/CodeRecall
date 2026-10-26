/** One filename catalog for creation, type labels, and editor language names. */
const template = (id, language, extension, aliases = []) => Object.freeze({
  id, language, label: language === 'Plain text' ? 'Text document' : `${language} file`,
  extension, extensions: [extension.slice(1), ...aliases],
  defaultName: `Untitled${extension}`,
});

export const FILE_TEMPLATES = Object.freeze([
  template('python', 'Python', '.py', ['pyw', 'pyi']),
  template('javascript', 'JavaScript', '.js', ['mjs', 'cjs']),
  template('typescript', 'TypeScript', '.ts', ['mts', 'cts']),
  template('jsx', 'JavaScript React', '.jsx'),
  template('tsx', 'TypeScript React', '.tsx'),
  template('java', 'Java', '.java'),
  template('html', 'HTML', '.html', ['htm']),
  template('css', 'CSS', '.css'),
  template('c', 'C', '.c', ['h']),
  template('cpp', 'C++', '.cpp', ['cc', 'cxx', 'hpp', 'hxx']),
  template('csharp', 'C#', '.cs', ['csx']),
  template('go', 'Go', '.go'),
  template('rust', 'Rust', '.rs'),
  template('php', 'PHP', '.php', ['phtml']),
  template('sql', 'SQL', '.sql'),
  template('json', 'JSON', '.json', ['jsonc', 'json5']),
  template('markdown', 'Markdown', '.md', ['mdx', 'markdown']),
  template('text', 'Plain text', '.txt', ['text']),
]);

export const OTHER_FILE_TEMPLATE = Object.freeze({
  id: 'other', label: 'Other…', language: 'Plain text', extension: '', defaultName: '',
});

const extraTypes = [
  template('ruby', 'Ruby', '.rb', ['rake']),
  template('swift', 'Swift', '.swift'),
  template('kotlin', 'Kotlin', '.kt', ['kts']),
  template('yaml', 'YAML', '.yaml', ['yml']),
  template('shell', 'Shell', '.sh', ['bash', 'zsh', 'fish']),
  template('powershell', 'PowerShell', '.ps1', ['psm1', 'psd1']),
  template('scss', 'SCSS', '.scss', ['sass']),
  template('vue', 'Vue', '.vue'),
  template('xml', 'XML', '.xml', ['svg']),
  template('docker', 'Docker', '.dockerfile'),
];
const byExtension = new Map([...FILE_TEMPLATES, ...extraTypes].flatMap((kind) => kind.extensions.map((extension) => [extension, kind])));

export function getFileType(name) {
  const normalized = String(name ?? '').toLocaleLowerCase('en-US');
  if (normalized === 'dockerfile' || normalized === 'containerfile') return extraTypes.find((kind) => kind.id === 'docker');
  const extension = normalized.includes('.') ? normalized.split('.').at(-1) : '';
  return byExtension.get(extension) ?? null;
}

export function getFileLanguage(name) {
  return getFileType(name)?.language ?? 'Plain text';
}
