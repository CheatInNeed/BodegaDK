import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { createRenderer, createSSRApp } from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import da from '../../apps/web/src/locales/da.json' with { type: 'json' };

// Exercise the real stores and HTTP adapter, replacing only authentication and
// browser navigation. No Supabase account or durable database writes are needed.
const cacheDir = await mkdtemp(path.join(tmpdir(), 'bodegadk-challenge-tests-'));
const panelSource = await readFile(new URL('../../apps/web/src/components/NotificationPanel.vue', import.meta.url), 'utf8');
const panelScript = compileScript(parse(panelSource).descriptor, { id: 'notification-test', inlineTemplate: true });
const panelClient = ts.transpileModule(panelScript.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const server = await createServer({
  root: fileURLToPath(new URL('../../apps/web', import.meta.url)),
  server: { middlewareMode: true },
  cacheDir,
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{
    name: 'challenge-test-browser-boundaries',
    enforce: 'pre',
    resolveId(id) {
      if (id === '@/stores/auth' || id.endsWith('/src/stores/auth')) return '\0test-auth';
      if (id === '@/router' || id.endsWith('/src/router')) return '\0test-router';
    },
    load(id) {
      if (id === '\0test-notification-client') return panelClient;
      if (id === '\0test-auth') return `export const useAuthStore = () => ({
        user: { id: 'alice' }, isAuthenticated: true,
        getAccessToken: async () => 'test-token'
      });`;
      if (id === '\0test-router') return 'export default { push() {} };';
    },
  }],
});
const { useFriendsStore } = await server.ssrLoadModule('/src/stores/friends.ts');
const { useNotificationsStore } = await server.ssrLoadModule('/src/stores/notifications.ts');
const originalFetch = globalThis.fetch;
let calls;
let reply;
let pinia;
const notification = () => ({
  id: 'notice-1', type: 'challenge.received', actor: { userId: 'bob', username: 'Bob' },
  payload: { challengeId: 'challenge-1', gameType: 'snyd' }, readAt: null,
});
const room = { roomCode: 'ABC123', selectedGame: 'snyd', isPrivate: true, status: 'LOBBY' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  calls = [];
  reply = async (url) => url.endsWith('/accept') ? json({ room }) : json({});
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.headers.get('Authorization'), 'Bearer test-token');
    return reply(url, init);
  };
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
});

function notices() {
  const store = useNotificationsStore();
  store.items = [notification()];
  store.unreadCount = 1;
  return store;
}

async function render(componentPath) {
  const { default: component } = await server.ssrLoadModule(componentPath);
  const app = createSSRApp(component);
  app.use(pinia);
  app.use(createRouter({ history: createMemoryHistory(), routes: [] }));
  app.use(createI18n({ legacy: false, locale: 'da', messages: { da } }));
  return renderToString(app);
}

test('Udfordr is rendered for a friend and sends a Snyd challenge', async () => {
  const store = useFriendsStore();
  store.friends = [{ id: 'friend-1', requester: { userId: 'alice', username: 'Alice' }, addressee: { userId: 'bob', username: 'Bob' } }];
  assert.match(await render('/src/components/profile/FriendsPanel.vue'), />Udfordr<\/button>/);
  await store.challenge('Bob', 'snyd');
  assert.equal(calls[0].url, '/api/challenges');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { username: 'Bob', gameType: 'snyd' });
  assert.equal(store.busyChallengeUserId, null);
});

test('accept calls the challenge endpoint before reading and returns the private lobby', async () => {
  const store = notices();
  assert.deepEqual(await store.respondToChallenge(store.items[0], true), room);
  assert.deepEqual(calls.map(c => c.url), ['/api/challenges/challenge-1/accept', '/api/notifications/notice-1/read']);
  assert.ok(calls.every(c => c.init.method === 'POST'));
  assert.equal(store.unreadCount, 0);
  assert.ok(store.items[0].readAt);
  await store.respondToChallenge(store.items[0], true);
  assert.equal(calls.length, 2, 'a handled notification cannot submit twice');
});

test('decline calls its endpoint before reading and does not return a lobby', async () => {
  const store = notices();
  assert.equal(await store.respondToChallenge(store.items[0], false), undefined);
  assert.deepEqual(calls.map(c => c.url), ['/api/challenges/challenge-1/decline', '/api/notifications/notice-1/read']);
  assert.equal(store.unreadCount, 0);
});

test('a rejected or expired challenge stays unread and can be retried', async () => {
  const store = notices();
  reply = async () => json({ detail: 'Challenge is not pending' }, 409);
  await store.respondToChallenge(store.items[0], true);
  assert.equal(calls.length, 1);
  assert.match(store.errorMessage, /409.*Challenge is not pending/);
  assert.equal(store.items[0].readAt, null);
  assert.equal(store.handledChallengeIds.size, 0);
  assert.equal(store.busyId, null);
  reply = async (url) => url.endsWith('/accept') ? json({ room }) : json({});
  assert.deepEqual(await store.respondToChallenge(store.items[0], true), room);
  assert.equal(store.errorMessage, null);
});

test('a failed read update does not discard a successfully accepted lobby', async () => {
  const store = notices();
  reply = async (url) => url.endsWith('/accept') ? json({ room }) : json({}, 500);
  assert.deepEqual(await store.respondToChallenge(store.items[0], true), room);
  assert.ok(store.handledChallengeIds.has('notice-1'));
  assert.equal(store.busyId, null);
});

test('concurrent responses and malformed challenge IDs cannot submit', async () => {
  const store = notices();
  await store.respondToChallenge({ ...notification(), payload: {} }, true);
  assert.equal(calls.length, 0);
  let finish;
  reply = () => new Promise(resolve => { finish = resolve; });
  const pending = store.respondToChallenge(store.items[0], true);
  await new Promise(resolve => setImmediate(resolve));
  await store.respondToChallenge(store.items[0], false);
  assert.equal(calls.length, 1);
  reply = async () => json({});
  finish(json({ room }));
  await pending;
});

test('marking a challenge read does not resolve it or decrement other unread counts', async () => {
  const store = notices();
  await store.markRead('notice-1');
  store.unreadCount = 3;
  await store.respondToChallenge(store.items[0], false);
  assert.equal(store.unreadCount, 3);
  assert.equal(calls[1].url, '/api/challenges/challenge-1/decline');
});

test('dotted challenge notifications render translated messages and both actions', async () => {
  const store = notices();
  const html = await render('/src/components/NotificationPanel.vue');
  assert.match(html, /Bob udfordrede dig til Snyd/);
  assert.match(html, /Accepter/);
  assert.match(html, /Afvis/);
  await store.respondToChallenge(store.items[0], false);
  const handled = await render('/src/components/NotificationPanel.vue');
  assert.doesNotMatch(handled, /Accepter|Afvis/);
});

test('clicking Accept enters the returned lobby; clicking Decline stays on the current route', async () => {
  // Mount the real client template with Vue's in-memory renderer so this also
  // checks event bindings and router navigation, without a browser dependency.
  const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null });
  const renderer = createRenderer({
    createElement: node, createText: text => node('#text', text), createComment: text => node('#comment', text),
    setText: (el, text) => { el.text = text; }, setElementText: (el, text) => { el.text = text; },
    patchProp: (el, key, _old, value) => { el.props[key] = value; },
    insert(el, parent, anchor) {
      el.parent = parent;
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      if (index < 0) parent.children.push(el); else parent.children.splice(index, 0, el);
    },
    remove(el) { el.parent.children.splice(el.parent.children.indexOf(el), 1); },
    parentNode: el => el.parent,
    nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
  });
  const { default: component } = await server.ssrLoadModule('\0test-notification-client');
  for (const accept of [true, false]) {
    pinia = createPinia();
    setActivePinia(pinia);
    const store = notices();
    store.open = true;
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: {} }, { path: '/lobby/:roomCode', component: {} },
    ] });
    await router.push('/');
    const app = renderer.createApp(component);
    app.use(pinia);
    app.use(router);
    app.use(createI18n({ legacy: false, locale: 'da', messages: { da } }));
    const root = node('root');
    app.mount(root);
    const flatten = el => [el, ...el.children.flatMap(flatten)];
    const button = flatten(root).find(el => el.type === 'button' && el.text === (accept ? 'Accepter' : 'Afvis'));
    assert.ok(button);
    await button.props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(router.currentRoute.value.path, accept ? '/lobby/ABC123' : '/');
    assert.equal(store.open, !accept);
    app.unmount();
  }
});
