/**
 * Credentials are entered by the user at runtime and stored ONLY in Android encrypted storage
 * (expo-secure-store, backed by the Android Keystore). They never appear in source, config or the APK.
 */
import * as SecureStore from 'expo-secure-store';
import type { Credentials } from '../types';

const KEYS = {
  paypalClientId: 'hp.paypal.clientId',
  paypalClientSecret: 'hp.paypal.clientSecret',
  anthropicApiKey: 'hp.ai.apiKey',
} as const;

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadCredentials(): Promise<Credentials | null> {
  const [paypalClientId, paypalClientSecret, anthropicApiKey] = await Promise.all([
    SecureStore.getItemAsync(KEYS.paypalClientId, OPTIONS),
    SecureStore.getItemAsync(KEYS.paypalClientSecret, OPTIONS),
    SecureStore.getItemAsync(KEYS.anthropicApiKey, OPTIONS),
  ]);
  if (!paypalClientId || !paypalClientSecret || !anthropicApiKey) return null;
  return { paypalClientId, paypalClientSecret, anthropicApiKey };
}

export async function saveCredentials(c: Credentials): Promise<void> {
  await SecureStore.setItemAsync(KEYS.paypalClientId, c.paypalClientId.trim(), OPTIONS);
  await SecureStore.setItemAsync(KEYS.paypalClientSecret, c.paypalClientSecret.trim(), OPTIONS);
  await SecureStore.setItemAsync(KEYS.anthropicApiKey, c.anthropicApiKey.trim(), OPTIONS);
}

export async function clearCredentials(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k, OPTIONS)));
}

export function mask(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
