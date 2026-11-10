import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { AI_HOST, AI_MODEL, PAYPAL_HOST, SETUP_NOTICE } from '../config';
import type { RootStackParamList } from '../navigation/types';
import { resetPayPalClient } from '../services/holdproof';
import { clearCredentials, loadCredentials, mask } from '../storage/credentials';
import type { Credentials } from '../types';
import { Button, Card, ErrorBanner, KeyValue, NoticeContent, SandboxBadge, Screen, SectionTitle } from '../ui/components';
import { space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => navigation.addListener('focus', () => { loadCredentials().then(setCreds).catch((e) => setError((e as Error).message)); }),
    [navigation],
  );

  function onClear() {
    Alert.alert('Remove keys from this device?', 'The PayPal Sandbox credentials and AI key will be deleted from encrypted storage. Jobs stay on the device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearCredentials();
            resetPayPalClient();
            navigation.reset({ index: 0, routes: [{ name: 'Credentials' }] });
          } catch (e) {
            setError(`Could not remove the keys: ${(e as Error)?.message ?? 'unknown error'}`);
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <SandboxBadge />
      <Text style={[type.title, { marginTop: space.md, marginBottom: space.lg }]}>Settings</Text>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <Card tone="violet">
        <Text style={[type.title, { marginBottom: space.md }]} accessibilityRole="header">{SETUP_NOTICE.title}</Text>
        <NoticeContent notice={SETUP_NOTICE} />
      </Card>
      <SectionTitle>Keys on this device</SectionTitle>
      <Card>
        <KeyValue k="PayPal client ID" v={creds ? mask(creds.paypalClientId) : '—'} mono />
        <KeyValue k="PayPal secret" v={creds ? '••••••••' : '—'} />
        <KeyValue k="AI key" v={creds ? mask(creds.aiApiKey) : '—'} mono />
      </Card>
      <Button title="Change keys" variant="secondary" onPress={() => navigation.navigate('Credentials', { editing: true })} />
      <SectionTitle>Environment</SectionTitle>
      <Card>
        <KeyValue k="PayPal host" v={PAYPAL_HOST} mono />
        <KeyValue k="AI host" v={AI_HOST} mono />
        <KeyValue k="AI model" v={AI_MODEL} mono />
        <KeyValue k="Version" v={Constants.expoConfig?.version ?? '—'} />
      </Card>
      <Button title="Remove keys from this device" variant="danger" onPress={onClear} />
    </Screen>
  );
}
