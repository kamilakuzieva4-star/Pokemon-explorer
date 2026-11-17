import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/images.js', import.meta.url), 'utf8');
function picture({ complete = false, width = 0, fallback = '/sprite.png' } = {}) {
  const placeholder = { hidden: true };
  const image = {
    src: '/artwork.png', hidden: false, complete, naturalWidth: width,
    dataset: { fallback },
    getAttribute() { return this.src; },
    addEventListener(type, listener) { if (type === 'error') this.fail = listener; },
    parentElement: { querySelector() { return placeholder; } }
  };
  runInNewContext(script, { document: { querySelectorAll() { return [image]; } } });
  return { image, placeholder };
}

test('a loaded image remains visible', () => {
  const { image, placeholder } = picture({ complete: true, width: 144 });
  assert.equal(image.src, '/artwork.png');
  assert.equal(image.hidden, false);
  assert.equal(placeholder.hidden, true);
});
test('a failed artwork switches to the backup once', () => {
  const { image, placeholder } = picture();
  image.fail();
  assert.equal(image.src, '/sprite.png');
  assert.equal(image.dataset.fallback, '');
  assert.equal(placeholder.hidden, true);
  image.fail();
  assert.equal(image.hidden, true);
  assert.equal(placeholder.hidden, false);
  image.fail();
  assert.equal(image.src, '/sprite.png');
});
test('an error before the script starts also uses the backup', () => {
  const { image } = picture({ complete: true });
  assert.equal(image.src, '/sprite.png');
});
test('missing or identical backup shows the placeholder without another request', () => {
  for (const fallback of ['', '/artwork.png']) {
    const { image, placeholder } = picture({ fallback });
    image.fail();
    assert.equal(image.src, '/artwork.png');
    assert.equal(image.hidden, true);
    assert.equal(placeholder.hidden, false);
  }
});
test('an image still loading is not replaced early', () => {
  const { image } = picture();
  assert.equal(image.src, '/artwork.png');
  assert.equal(image.hidden, false);
});
