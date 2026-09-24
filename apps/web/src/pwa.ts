import { authenticatedFetch, resolveApiBaseUrl } from './net/api.js';

const SERVICE_WORKER_URL = '/sw.js';
const DEVICE_ID_KEY = 'bodegadk-push-device-id';

export type PushStatus = {
    supported: boolean;
    secureContext: boolean;
    configured: boolean;
    permission: NotificationPermission | 'unsupported';
    subscribed: boolean;
    standalone: boolean;
    coarsePointer: boolean;
    platformLabel: string;
    recipientUserId: string;
    reason: string | null;
};

type PushConfigResponse = {
    enabled: boolean;
    publicKey: string | null;
};

type PushSubscriptionPayload = {
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh?: string;
        auth?: string;
    };
};

export async function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
        return null;
    }

    try {
        return await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
    } catch (error) {
        console.warn('[pwa] service worker registration failed', error);
        return null;
    }
}

export async function readPushStatus(): Promise<PushStatus> {
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

export async function enablePushNotifications(input: { userId?: string | null; username?: string | null }): Promise<PushStatus> {
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

export async function syncPushSubscriptionIdentity(input: { userId?: string | null; username?: string | null }): Promise<void> {
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

export async function disablePushNotifications(): Promise<PushStatus> {
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

export async function sendTestPush(): Promise<void> {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        throw new Error('This device is not subscribed to notifications.');
    }

    const payload = subscription.toJSON() as PushSubscriptionPayload;
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

function createBaseStatus(): PushStatus {
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

async function fetchPushConfig(): Promise<PushConfigResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/push/config`);
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to load push configuration'));
    }
    return response.json() as Promise<PushConfigResponse>;
}

async function saveSubscription(subscription: PushSubscription, input: { userId?: string | null; username?: string | null }) {
    const payload = subscription.toJSON() as PushSubscriptionPayload;
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

export function resolvePushRecipientUserId(authUserId?: string | null): string {
    const normalized = authUserId?.trim();
    if (normalized) {
        return normalized;
    }
    return `guest:${getDeviceId()}`;
}

async function deleteSubscription(subscription: PushSubscription) {
    const payload = subscription.toJSON() as PushSubscriptionPayload;
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

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const body = await response.json() as { message?: string; error?: string };
        return body.message || body.error || `${fallback} (${response.status})`;
    } catch {
        return `${fallback} (${response.status})`;
    }
}

function urlBase64ToUint8Array(value: string): ArrayBuffer {
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

function subscriptionUsesApplicationServerKey(subscription: PushSubscription, applicationServerKey: ArrayBuffer): boolean {
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

function getDeviceId(): string {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
}

function isStandaloneDisplay(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
        || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function resolvePlatformLabel(): string {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const standalone = isStandaloneDisplay();
    if (coarse && standalone) return 'Installed phone/tablet';
    if (coarse) return 'Phone/tablet browser';
    if (standalone) return 'Installed desktop app';
    return 'Desktop browser';
}
