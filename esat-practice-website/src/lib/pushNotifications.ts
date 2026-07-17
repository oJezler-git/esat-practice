// Client side of the daily practice reminder feature. Manages the browser push
// subscription and syncs it (with the user's chosen local time) to the
// Cloudflare Worker, which does the actual scheduled sending.
import { getApiUrl } from "./cloudSync";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPermissionState(): PushPermission {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}

function getVapidPublicKey(): string {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!key) {
    throw new Error(
      "VITE_VAPID_PUBLIC_KEY is not set. Generate a VAPID key pair and add the public key to your .env.local.",
    );
  }
  return key;
}

// applicationServerKey must be a BufferSource of the raw VAPID public key.
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return buffer;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.ready;
  if (!registration.pushManager) {
    throw new Error("Push is not available on this service worker registration.");
  }
  return registration;
}

async function getOrCreateSubscription(): Promise<PushSubscription> {
  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBuffer(getVapidPublicKey()),
  });
}

// Requests notification permission if not already decided. Returns the outcome.
export async function requestPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission !== "default") {
    return Notification.permission as PushPermission;
  }
  const result = await Notification.requestPermission();
  return result as PushPermission;
}

// Subscribes this device (if needed) and registers/updates the reminder time on
// the server. Throws if permission is not granted or push is unsupported.
export async function enableReminders(time: string): Promise<void> {
  if (!isPushSupported()) throw new Error("Push notifications are not supported here.");
  if (Notification.permission !== "granted") {
    throw new Error("Notification permission has not been granted.");
  }

  const subscription = await getOrCreateSubscription();
  const response = await fetch(`${getApiUrl()}/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      time,
      // IANA zone is authoritative (survives DST); offset is a fallback.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      tzOffsetMinutes: new Date().getTimezoneOffset(),
    }),
  });
  if (!response.ok) throw new Error(await response.text());
}

// Unregisters the reminder on the server and drops the local subscription.
export async function disableReminders(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  try {
    await fetch(`${getApiUrl()}/push/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    // Always drop the browser subscription even if the server call fails; the
    // server prunes stale subscriptions on send.
    await subscription.unsubscribe();
  }
}
