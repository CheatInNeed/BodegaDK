import { authenticatedFetch, resolveApiBaseUrl } from './net/api.js';
const SERVICE_WORKER_URL = '/sw.js';
const DEVICE_ID_KEY = 'bodegadk-push-device-id';
export async function registerPwaServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
        return null;
    }
    try {
        return await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
    }
    catch (error) {
        console.warn('[pwa] service worker registration failed', error);
        return null;
    }
}
export async function readPushStatus() {
    const baseStatus = createBaseStatus();
    if (!baseStatus.supported) {
        return baseStatus;
    }
    const [config, registration] = await Promise.all([
        fetchPushConfig().catch(() => ({ enabled: false, publicKey: null })),
        navigator.serviceWorker.ready.catch(() => null),
    ]);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    return {
        ...baseStatus,
        configured: config.enabled && Boolean(config.publicKey),
        subscribed: Boolean(subscription),
        reason: config.enabled && config.publicKey ? null : 'missing-server-config',
    };
}
export async function enablePushNotifications(input) {
    const registration = await registerPwaServiceWorker();
    if (!registration || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Push notifications are not supported by this browser.');
    }
    const config = await fetchPushConfig();
    if (!config.enabled || !config.publicKey) {
        throw new Error('Push notifications are not configured on the server.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Notification permission was not granted.');
    }
    const applicationServerKey = urlBase64ToUint8Array(config.publicKey);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionUsesApplicationServerKey(subscription, applicationServerKey)) {
        await subscription.unsubscribe();
        subscription = null;
    }
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
        });
    }
    await saveSubscription(subscription, input);
    return readPushStatus();
}
export async function syncPushSubscriptionIdentity(input) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        return;
    }
    await saveSubscription(subscription, input);
}
export async function disablePushNotifications() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
        await deleteSubscription(subscription).catch((error) => {
            console.warn('[pwa] server push unsubscribe failed; clearing local subscription anyway', error);
        });
        const unsubscribed = await subscription.unsubscribe();
        if (!unsubscribed) {
            console.warn('[pwa] browser push unsubscribe returned false; resetting service worker registration');
            await registration.unregister();
            await registerPwaServiceWorker();
        }
    }
    return readPushStatus();
}
export async function sendTestPush() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        throw new Error('This device is not subscribed to notifications.');
    }
    const payload = subscription.toJSON();
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/push/test`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            endpoint: payload.endpoint,
        }),
    });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to send test notification'));
    }
}
function createBaseStatus() {
    const secureContext = window.isSecureContext;
    const hasServiceWorker = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    const hasNotification = 'Notification' in window;
    const supported = secureContext && hasServiceWorker && hasPush && hasNotification;
    return {
        supported,
        secureContext,
        configured: false,
        permission: hasNotification ? Notification.permission : 'unsupported',
        subscribed: false,
        standalone: isStandaloneDisplay(),
        coarsePointer: window.matchMedia('(pointer: coarse)').matches,
        platformLabel: resolvePlatformLabel(),
        recipientUserId: resolvePushRecipientUserId(null),
        reason: supported ? null : 'unsupported-browser',
    };
}
async function fetchPushConfig() {
    const response = await fetch(`${resolveApiBaseUrl()}/push/config`);
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to load push configuration'));
    }
    return response.json();
}
async function saveSubscription(subscription, input) {
    const payload = subscription.toJSON();
    const deviceId = getDeviceId();
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/push/subscriptions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            subscription: payload,
            deviceId,
            deviceLabel: resolvePlatformLabel(),
            userId: resolvePushRecipientUserId(input.userId ?? null),
            username: input.username ?? null,
            userAgent: navigator.userAgent,
        }),
    });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to save push subscription'));
    }
}
export function resolvePushRecipientUserId(authUserId) {
    const normalized = authUserId?.trim();
    if (normalized) {
        return normalized;
    }
    return `guest:${getDeviceId()}`;
}
async function deleteSubscription(subscription) {
    const payload = subscription.toJSON();
    const response = await authenticatedFetch(`${resolveApiBaseUrl()}/push/subscriptions/unsubscribe`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            endpoint: payload.endpoint,
            deviceId: getDeviceId(),
        }),
    });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to disable push subscription'));
    }
}
async function readErrorMessage(response, fallback) {
    try {
        const body = await response.json();
        return body.message || body.error || `${fallback} (${response.status})`;
    }
    catch {
        return `${fallback} (${response.status})`;
    }
}
function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const buffer = new ArrayBuffer(raw.length);
    const output = new Uint8Array(buffer);
    for (let index = 0; index < raw.length; index += 1) {
        output[index] = raw.charCodeAt(index);
    }
    return buffer;
}
function subscriptionUsesApplicationServerKey(subscription, applicationServerKey) {
    const existingKey = subscription.options.applicationServerKey;
    if (!existingKey) {
        return true;
    }
    const existing = new Uint8Array(existingKey);
    const expected = new Uint8Array(applicationServerKey);
    if (existing.byteLength !== expected.byteLength) {
        return false;
    }
    return existing.every((value, index) => value === expected[index]);
}
function getDeviceId() {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing)
        return existing;
    const generated = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
}
function isStandaloneDisplay() {
    return window.matchMedia('(display-mode: standalone)').matches
        || ('standalone' in navigator && Boolean(navigator.standalone));
}
function resolvePlatformLabel() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const standalone = isStandaloneDisplay();
    if (coarse && standalone)
        return 'Installed phone/tablet';
    if (coarse)
        return 'Phone/tablet browser';
    if (standalone)
        return 'Installed desktop app';
    return 'Desktop browser';
}
