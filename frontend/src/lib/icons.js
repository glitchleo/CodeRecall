/** Stable icon keys are stored on library nodes; URLs stay local to this app. */
const icon = (id, label, asset, keywords = [], associations = {}) => Object.freeze({
  id, label, src: `/icons/${asset}.svg`, keywords, ...associations,
});

// Add an SVG to public/icons and a catalog entry here to make it available to
// every file and folder. Never rename an existing id: saved items reference it.
export const ICON_CATALOG = Object.freeze([
  icon('file', 'File', 'default_file', ['document', 'plain', 'default']),
  icon('folder', 'Folder', 'default_folder', ['directory', 'default']),
  icon('source', 'Source folder', 'folder_type_src', ['code', 'src'], { folderNames: ['src', 'source', 'sources', 'code'] }),
  icon('components', 'Components', 'folder_type_component', ['ui', 'interface', 'widgets'], { folderNames: ['component', 'components', 'ui'] }),
  icon('configuration', 'Configuration', 'folder_type_config', ['settings', 'config'], { folderNames: ['config', 'configuration', 'configs', 'settings'] }),
  icon('database', 'Database', 'folder_type_db', ['data', 'storage', 'db'], { folderNames: ['db', 'database', 'databases', 'data', 'storage'] }),
  icon('documentation', 'Documentation', 'folder_type_docs', ['docs', 'notes', 'reference'], { folderNames: ['doc', 'docs', 'documentation', 'notes'] }),
  icon('images', 'Images', 'folder_type_images', ['pictures', 'assets', 'media'], { folderNames: ['image', 'images', 'assets', 'media', 'pictures'] }),
  icon('api', 'API', 'folder_type_api', ['request', 'endpoint', 'backend', 'network'], { folderNames: ['api', 'apis', 'endpoints'] }),
  icon('tests', 'Tests', 'folder_type_test', ['spec', 'testing', 'validation'], { folderNames: ['test', 'tests', 'spec', 'specs', '__tests__'] }),
  icon('tools', 'Tools', 'folder_type_tools', ['scripts', 'automation', 'utilities'], { folderNames: ['tool', 'tools', 'scripts'] }),
  icon('helpers', 'Helpers', 'folder_type_helper', ['utils', 'utilities', 'functions'], { folderNames: ['helper', 'helpers', 'util', 'utils', 'utilities', 'functions'] }),
  icon('services', 'Services', 'folder_type_services', ['application', 'business'], { folderNames: ['service', 'services'] }),
  icon('javascript', 'JavaScript', 'file_type_js_official', ['js', 'ecmascript', 'web'], { extensions: ['js', 'mjs', 'cjs'] }),
  icon('typescript', 'TypeScript', 'file_type_typescript_official', ['ts', 'types', 'web'], { extensions: ['ts', 'mts', 'cts'] }),
  icon('python', 'Python', 'file_type_python', ['py', 'scripting'], { extensions: ['py', 'pyw', 'pyi', 'ipynb'] }),
  icon('react', 'React', 'file_type_reactjs', ['jsx', 'tsx', 'frontend', 'components'], { extensions: ['jsx', 'tsx'] }),
  icon('node', 'Node.js', 'file_type_node', ['javascript', 'server', 'npm', 'package'], { filenames: ['package.json', 'package-lock.json'] }),
  icon('html', 'HTML', 'file_type_html', ['markup', 'web', 'page'], { extensions: ['html', 'htm'] }),
  icon('css', 'CSS', 'file_type_css', ['styles', 'stylesheet', 'design'], { extensions: ['css'] }),
  icon('sass', 'Sass / SCSS', 'file_type_sass', ['styles', 'stylesheet'], { extensions: ['sass', 'scss'] }),
  icon('json', 'JSON', 'file_type_json_official', ['object', 'configuration', 'data'], { extensions: ['json', 'jsonc', 'json5'] }),
  icon('markdown', 'Markdown', 'file_type_markdown', ['readme', 'documentation', 'notes'], { extensions: ['md', 'mdx', 'markdown'] }),
  icon('sql', 'SQL', 'file_type_sql', ['query', 'database', 'tables'], { extensions: ['sql'] }),
  icon('docker', 'Docker', 'file_type_docker', ['container', 'deployment'], { filenames: ['dockerfile', 'containerfile'], extensions: ['dockerfile'] }),
  icon('git', 'Git', 'file_type_git', ['version', 'history', 'repository'], { filenames: ['.gitignore', '.gitattributes', '.gitmodules'] }),
  icon('shell', 'Shell', 'file_type_shell', ['bash', 'terminal', 'command', 'script'], { extensions: ['sh', 'bash', 'zsh', 'fish'] }),
  icon('powershell', 'PowerShell', 'file_type_powershell', ['windows', 'terminal', 'command'], { extensions: ['ps1', 'psm1', 'psd1'] }),
  icon('c', 'C', 'file_type_c', ['systems', 'native'], { extensions: ['c', 'h'] }),
  icon('cpp', 'C++', 'file_type_cpp', ['cpp', 'systems', 'native'], { extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx'] }),
  icon('csharp', 'C#', 'file_type_csharp', ['csharp', 'dotnet', '.net'], { extensions: ['cs', 'csx'] }),
  icon('java', 'Java', 'file_type_java', ['jvm'], { extensions: ['java', 'jar'] }),
  icon('go', 'Go', 'file_type_go', ['golang', 'server'], { extensions: ['go'], filenames: ['go.mod', 'go.sum'] }),
  icon('rust', 'Rust', 'file_type_rust', ['cargo', 'systems'], { extensions: ['rs'], filenames: ['cargo.toml', 'cargo.lock'] }),
  icon('php', 'PHP', 'file_type_php', ['backend', 'server'], { extensions: ['php', 'phtml'] }),
  icon('ruby', 'Ruby', 'file_type_ruby', ['rails', 'rb'], { extensions: ['rb', 'rake'], filenames: ['gemfile', 'rakefile'] }),
  icon('swift', 'Swift', 'file_type_swift', ['apple', 'ios', 'macos'], { extensions: ['swift'] }),
  icon('kotlin', 'Kotlin', 'file_type_kotlin', ['android', 'jvm'], { extensions: ['kt', 'kts'] }),
  icon('vue', 'Vue', 'file_type_vue', ['frontend', 'component'], { extensions: ['vue'] }),
  icon('angular', 'Angular', 'file_type_angular', ['frontend', 'component', 'ng']),
  icon('math', 'Math', 'file_type_libreoffice_math', ['mathematics', 'numbers', 'addition', 'calculation', 'formula'], { folderNames: ['math', 'maths', 'mathematics', 'arithmetic'] }),
  icon('yaml', 'YAML', 'file_type_yaml_official', ['configuration', 'data'], { extensions: ['yaml', 'yml'] }),
  icon('image', 'Image file', 'file_type_image', ['picture', 'photo', 'png', 'jpg'], { extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico'] }),
  icon('svg', 'SVG', 'file_type_svg', ['vector', 'image', 'icon'], { extensions: ['svg'] }),
]);

const byId = new Map(ICON_CATALOG.map((entry) => [entry.id, entry]));
export const getIconById = (id) => byId.get(id) ?? null;
export const normalizeIconId = (value) => byId.has(value) ? value : null;

export function getIconForItem(item) {
  const custom = getIconById(item?.iconId);
  if (custom) return custom;
  const name = String(item?.name ?? '').toLocaleLowerCase('en-US');
  if (item?.type === 'folder') {
    const words = name.split(/[\s_-]+/u).filter(Boolean);
    return ICON_CATALOG.find((entry) => entry.folderNames?.includes(name))
      ?? words.map((word) => ICON_CATALOG.find((entry) => entry.folderNames?.includes(word))).find(Boolean)
      ?? byId.get('folder');
  }
  const extension = name.includes('.') ? name.split('.').at(-1) : '';
  return ICON_CATALOG.find((entry) => entry.filenames?.includes(name))
    ?? ICON_CATALOG.find((entry) => entry.extensions?.includes(extension))
    ?? byId.get('file');
}
