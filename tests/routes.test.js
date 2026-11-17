import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import axios from 'axios';


let eeveeAttempts = 0;
axios.defaults.adapter = async (config) => {
  const url = config.url;
  let name = url.split('/').pop();
  const fail = (status, code) => {
    throw Object.assign(new Error('PRIVATE UPSTREAM DETAILS'), { response: { status }, code });
  };
  if (name === 'outage') fail(429);
  if (name === 'slow') fail(null, 'ECONNABORTED');
  if (name === 'missing') fail(404);
  let data;
  if (url.includes('?')) {
    data = { count: 2, results: url.includes('offset=0') ? [{ name: 'pikachu' }, { name: 'eevee' }] : [] };
  } else if (name === 'broken') {
    data = {};
  } else {
    if (name === '25') name = 'pikachu';
    if (name === 'eevee' && url.startsWith('/pokemon/') && eeveeAttempts++ === 0) fail(503);
    const id = name === 'pikachu' ? 25 : 133;
    data = url.startsWith('/pokemon-species/')
      ? { name, pokedex_numbers: [{ pokedex: { name: 'national' }, entry_number: id }],
          varieties: [{ is_default: true, pokemon: { name } }] }
      : { id, name, species: { name }, height: 4, weight: 60, types: [], stats: [],
          sprites: { front_default: 'https://example.com/sprite.png',
            other: { 'official-artwork': { front_default: 'https://example.com/artwork.png' } } } };
  }
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};
const { default: app } = await import('../app.js');
let server;
let base;
before(async () => {
  server = app.listen(0, 'localhost');
  await once(server, 'listening');
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('partial catalog remains usable and retry recovers the missing card', async () => {
  let response = await fetch(base + '/?page=1&sort=name');
  let html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Some Pokémon could not load \(1\)/);
  assert.equal((html.match(/class="card"/g) || []).length, 1);
  assert.match(html, /Retry this page/);
  response = await fetch(base + '/?page=1&sort=name');
  html = await response.text();
  assert.equal((html.match(/class="card"/g) || []).length, 2);
  assert.ok(!html.includes('Some Pokémon could not load'));
  assert.match(html, /data-fallback="https:\/\/example.com\/sprite.png"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /src="\/images.js"/);
});
test('search redirects with context and comparison rejects numeric aliases of the same Pokémon', async () => {
  const response = await fetch(base + '/search', {
    method: 'POST', body: new URLSearchParams({ name: '25', page: '2', sort: 'name' }), redirect: 'manual'
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/pokemon/pikachu?page=2&sort=name');
  const duplicate = await fetch(base + '/compare?first=pikachu&second=25');
  assert.equal(duplicate.status, 400);
  assert.match(await duplicate.text(), /Choose two different Pokémon/);
});
test('API failures preserve input and navigation without exposing internal details', async () => {
  for (const [name, status] of [['outage', 503], ['slow', 504], ['missing', 404], ['broken', 502]]) {
    let response = await fetch(base + '/search', {
      method: 'POST', body: new URLSearchParams({ name, page: '2', sort: 'name' })
    });
    let html = await response.text();
    assert.equal(response.status, status);
    assert.ok(html.includes(`value="${name}"`));
    assert.match(html, /name="page" value="2"/);
    assert.ok(!html.includes('PRIVATE'));
    response = await fetch(base + `/compare?first=pikachu&second=${name}&page=2&sort=name`);
    html = await response.text();
    assert.equal(response.status, status);
    assert.match(html, /value="pikachu"/);
    assert.ok(html.includes(`value="${name}"`));
    assert.ok(!html.includes('PRIVATE'));
  }
});
test('invalid page, sort, URI and missing route render safe error pages', async () => {
  for (const [url, status] of [['/?page=0', 400], ['/?page=1&page=2', 400], ['/?sort=bad', 400],
    ['/?page=2', 404], ['/pokemon/%E0%A4%A', 400], ['/no-such-page', 404]]) {
    const response = await fetch(base + url);
    const html = await response.text();
    assert.equal(response.status, status);
    assert.match(html, /site-header/);
    assert.ok(!html.includes('node_modules'));
  }
});
test('oversized forms and unsupported encoding use the error template', async () => {
  let response = await fetch(base + '/search', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=' + 'a'.repeat(3000)
  });
  assert.equal(response.status, 413);
  assert.match(await response.text(), /submitted form is too large/);
  response = await fetch(base + '/search', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=invalid' }, body: 'name=pikachu'
  });
  assert.equal(response.status, 415);
  assert.match(await response.text(), /encoding is not supported/);
});
test('user-supplied markup is escaped in forms', async () => {
  const response = await fetch(base + '/compare?' + new URLSearchParams({ first: '<script>alert(1)</script>', second: 'eevee' }));
  const html = await response.text();
  assert.equal(response.status, 400);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});
