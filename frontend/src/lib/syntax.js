// This tokenizer decorates source text only. Every character remains unchanged,
// including incomplete strings/comments while a file is being edited.
const extensions = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  py: 'python', pyw: 'python', pyi: 'python',
  java: 'java', kt: 'kotlin', kts: 'kotlin', cs: 'csharp', csx: 'csharp',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  go: 'go', rs: 'rust', php: 'php', phtml: 'php', rb: 'ruby', swift: 'swift',
  html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', vue: 'markup',
  css: 'css', scss: 'css', sass: 'css', json: 'json', jsonc: 'json', json5: 'json',
  sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  yaml: 'yaml', yml: 'yaml', md: 'markdown', markdown: 'markdown', mdx: 'markdown',
};

export function getSyntaxLanguage(filename = '') {
  const name = String(filename).toLowerCase().split(/[\\/]/).at(-1);
  if (name === 'dockerfile' || name === 'containerfile') return 'docker';
  if (name === 'gemfile' || name === 'rakefile') return 'ruby';
  return extensions[name.split('.').at(-1)] || 'text';
}

const wordSet = (words) => new Set(words.split(/\s+/));
const commonKeywords = 'if else for while do switch case break continue return throw try catch finally new class extends public private protected static final const let var function async await import export default from as in of instanceof typeof void delete this super interface implements enum package namespace using include define typedef struct union template virtual override abstract readonly yield get set true false null undefined';
const keywords = {
  javascript: wordSet(commonKeywords), typescript: wordSet(`${commonKeywords} type keyof infer declare module unknown never is satisfies`),
  python: wordSet('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None match case'),
  java: wordSet(`${commonKeywords} boolean byte char double float int long short synchronized throws transient volatile native strictfp record sealed permits`),
  kotlin: wordSet(`${commonKeywords} fun val when object companion data suspend inline reified internal open lateinit by null`),
  csharp: wordSet(`${commonKeywords} bool byte char decimal double dynamic float int long object out ref string uint ulong ushort checked unchecked lock operator params event delegate partial where`),
  c: wordSet(`${commonKeywords} auto char double float int long short signed unsigned volatile extern register sizeof _Bool`),
  cpp: wordSet(`${commonKeywords} auto char double float int long short signed unsigned volatile extern register sizeof bool nullptr constexpr noexcept friend operator explicit typename`),
  go: wordSet('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false'),
  rust: wordSet('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'),
  php: wordSet(`${commonKeywords} echo print require require_once include_once foreach fn endfor endif endwhile trait use global isset empty array`),
  ruby: wordSet('alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield'),
  swift: wordSet(`${commonKeywords} associatedtype deinit extension fileprivate func guard init inout internal open operator protocol rethrows some subscript typealias weak unowned nil`),
  shell: wordSet('if then else elif fi for while do done in case esac function select until return export local readonly declare source shift exit'),
  powershell: wordSet('begin break catch class continue data do dynamicparam else elseif end enum exit filter finally for foreach from function if in param process return switch throw trap try until using var while workflow'),
  sql: wordSet('select from where insert into update delete values set create alter drop table database index view join inner outer left right full on as and or not null true false distinct group by order having limit offset union all case when then else end exists in is like between primary foreign key references default constraint desc asc count sum avg min max with recursive returning begin commit rollback'),
  docker: wordSet('from run cmd label maintainer expose env add copy entrypoint volume user workdir arg onbuild stopsignal healthcheck shell'),
  json: wordSet('true false null'), yaml: wordSet('true false null yes no on off'),
};
const builtins = wordSet('Array Boolean Date Error Function JSON Map Math Number Object Promise RegExp Set String Symbol WeakMap WeakSet console document window process require module exports print len range list dict set tuple str int float bool open enumerate zip sum sorted isinstance self cls None True False System String Integer Double List Map Set Optional Collections Object printf scanf malloc free std cout cin vector string usize i32 i64 f32 f64 Result Option Some Ok Err println fmt make append cap panic recover');

const doubleString = '"(?:\\\\[\\s\\S]|[^"\\\\\\r\\n])*"?';
const singleString = "'(?:\\\\[\\s\\S]|[^'\\\\\\r\\n])*'?";
const eof = '(?![\\s\\S])';
const blockComment = `/\\*[\\s\\S]*?(?:\\*/|${eof})`;
const word = '[\\p{L}_$][\\p{L}\\p{N}_$]*';
const number = '(?:\\b0[xX][\\da-fA-F_]+|\\b0[bB][01_]+|\\b\\d[\\d_]*(?:\\.[\\d_]+)?(?:[eE][+-]?\\d+)?[nLfFuU]?)';

function rulesFor(language) {
  const rules = [];
  const add = (type, pattern) => rules.push({ type, pattern });
  if (language === 'markdown') {
    add('comment', `^\x60\x60\x60[^\\n]*\\n[\\s\\S]*?(?:^\x60\x60\x60[^\\n]*|${eof})`);
    add('keyword', '^ {0,3}#{1,6}[^\\n]*');
    add('string', '`[^`\\n]+`|!?\\[[^\\]\\n]*\\]\\([^\\n)]*\\)');
    add('type', '\\*\\*[^\\n]*?\\*\\*|__[^\\n]*?__');
    return rules;
  }
  if (language === 'markup') {
    add('comment', `<!--[\\s\\S]*?(?:-->|${eof})`);
    add('keyword', '<!DOCTYPE[^>]*>');
    add('tag', '<\\/?[\\w:.-]+|\\/?>');
    add('string', `${doubleString}|${singleString}`);
    add('attribute', '[\\w:@.-]+(?=\\s*=)');
    add('operator', '=');
    return rules;
  }
  if (language === 'python') {
    add('comment', '#[^\\n]*');
    add('string', `(?:[rbuRfBU]{0,2})(?:"""[\\s\\S]*?(?:"""|${eof})|'''[\\s\\S]*?(?:'''|${eof})|${doubleString}|${singleString})`);
    add('attribute', '@[\\w.]+');
  } else {
    if (['shell', 'powershell', 'yaml', 'docker', 'ruby'].includes(language)) add('comment', '#[^\\n]*');
    if (language === 'sql') add('comment', '--[^\\n]*');
    if (language === 'powershell') add('comment', `<#[\\s\\S]*?(?:#>|${eof})`);
    if (!['yaml', 'shell', 'docker', 'ruby'].includes(language)) add('comment', `${blockComment}|//[^\\n]*`);
    add('string', `${doubleString}|${singleString}|\x60(?:\\\\[\\s\\S]|[^\x60\\\\])*\x60?`);
  }
  if (language === 'css') {
    add('attribute', '--[\\w-]+|[\\w-]+(?=\\s*:)');
    add('type', '[.#][\\w-]+|@[\\w-]+');
    add('number', '#[\\da-fA-F]{3,8}\\b');
  }
  if (language === 'yaml') add('attribute', '[\\w.-]+(?=\\s*:)');
  add('number', number);
  add('word', word);
  add('operator', '[+*/%=!<>|&^~?:-]+');
  add('punctuation', '[{}\\[\\]();,.]');
  return rules;
}

const grammars = new Map();
function grammarFor(language) {
  if (!grammars.has(language)) {
    const rules = rulesFor(language);
    grammars.set(language, { rules, matcher: new RegExp(rules.map(({ pattern }, index) => `(?<t${index}>${pattern})`).join('|'), 'gmu') });
  }
  return grammars.get(language);
}

export function tokenizeCode(code = '', filename = '') {
  const source = String(code);
  const language = getSyntaxLanguage(filename);
  if (!source || language === 'text') return [{ type: 'plain', value: source }];
  const { rules, matcher } = grammarFor(language);
  // Bound the decoration work for unusually large files. The complete source is
  // still displayed and editable; the remaining tail uses the base text color.
  const visible = source.slice(0, 250000);
  const tokens = [];
  let end = 0;
  matcher.lastIndex = 0;
  for (const match of visible.matchAll(matcher)) {
    if (match.index > end) tokens.push({ type: 'plain', value: source.slice(end, match.index) });
    const index = rules.findIndex((_, index) => match.groups[`t${index}`] !== undefined);
    let type = rules[index].type;
    const value = match[0];
    const tail = visible.slice(match.index + value.length);
    if (type === 'word') {
      const lookup = ['sql', 'docker', 'powershell', 'yaml'].includes(language) ? value.toLowerCase() : value;
      type = keywords[language]?.has(lookup) ? 'keyword'
        : builtins.has(value) ? 'type'
          : /^\s*\(/u.test(tail) ? 'function'
            : /^[A-Z][\p{L}\p{N}_$]*$/u.test(value) ? 'type' : 'plain';
    } else if (type === 'string' && language === 'json' && /^\s*:/u.test(tail)) type = 'attribute';
    tokens.push({ type, value });
    end = match.index + value.length;
  }
  if (end < source.length) tokens.push({ type: 'plain', value: source.slice(end) });
  return tokens;
}
