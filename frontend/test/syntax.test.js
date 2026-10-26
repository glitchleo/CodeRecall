import test from 'node:test';
import assert from 'node:assert/strict';
import { getSyntaxLanguage, tokenizeCode } from '../src/lib/syntax.js';

test('filename associations select the right grammar and unknown formats stay plain', () => {
  assert.equal(getSyntaxLanguage('Hello.JAVA'), 'java');
  assert.equal(getSyntaxLanguage('src/App.tsx'), 'typescript');
  assert.equal(getSyntaxLanguage('Dockerfile'), 'docker');
  assert.deepEqual(tokenizeCode('<unsafe>&content', 'custom.unknown'), [{ type: 'plain', value: '<unsafe>&content' }]);
});

test('strings hide comment markers and comments hide keywords and quotes', () => {
  const tokens = tokenizeCode('const url = "https://example.com"; // return "value"\nrun(42)', 'app.js');
  assert.ok(tokens.some(token => token.type === 'string' && token.value === '"https://example.com"'));
  assert.ok(tokens.some(token => token.type === 'comment' && token.value === '// return "value"'));
  assert.ok(tokens.some(token => token.type === 'function' && token.value === 'run'));
  assert.ok(tokens.some(token => token.type === 'number' && token.value === '42'));
});

test('multiline and incomplete code preserves source exactly across supported languages', () => {
  const fixtures = [
    ['a.py', 'def greet(name):\r\n    """A # multiline\nstring"""\n    return f"Hi {name}" # 😀'],
    ['a.java', 'public class Hello { /* return\n * "comment" */ String value = "unfinished'],
    ['a.jsx', 'export default () => <div title="Hello & <world>">{text}</div>;\n'],
    ['a.html', '<!-- comment\n--><div class="test">héllo</div>\n'],
    ['a.css', '.card { color: #ff00ff; width: 12px; }'],
    ['a.json', '{"name": "value", "enabled": true, "count": 12}'],
    ['a.sql', "SELECT name FROM users WHERE id = 2; -- comment\n"],
    ['a.sh', '#!/bin/bash\necho "$HOME"\n'],
    ['a.md', '# Title\n```js\nconst x = 1;\n```\n**bold**'],
    ['a.yaml', 'name: "app"\nenabled: true\n# note'],
    ['a.rs', 'fn main() { println!("Hello"); }'],
  ];
  for (const [filename, code] of fixtures) {
    assert.equal(tokenizeCode(code, filename).map(token => token.value).join(''), code, filename);
  }
});

test('JSON keys, markup attributes and Python declarations receive distinct tokens', () => {
  assert.ok(tokenizeCode('{"name": "value"}', 'data.json').some(token => token.type === 'attribute' && token.value === '"name"'));
  assert.ok(tokenizeCode('<div class="value">', 'index.html').some(token => token.type === 'attribute' && token.value === 'class'));
  assert.ok(tokenizeCode('def greet(name):\n return True', 'app.py').some(token => token.type === 'keyword' && token.value === 'def'));
});

test('multiline comments and strings keep their complete lexical context', () => {
  const comment = '/* first\nreturn "not code";\nlast */';
  assert.ok(tokenizeCode(`${comment}\nconst value = 1`, 'a.js').some(token => token.type === 'comment' && token.value === comment));
  const docstring = '"""First\n# not a comment\nlast"""';
  assert.ok(tokenizeCode(docstring, 'a.py').some(token => token.type === 'string' && token.value === docstring));
  assert.deepEqual(tokenizeCode('/* unfinished\nreturn 2', 'a.js'), [{ type: 'comment', value: '/* unfinished\nreturn 2' }]);
});

test('large file decoration is bounded while preserving the entire content', () => {
  const code = 'const x = 1;\n'.repeat(25000);
  const tokens = tokenizeCode(code, 'large.js');
  assert.equal(tokens.map(token => token.value).join(''), code);
  assert.equal(tokens.at(-1).type, 'plain');
});
