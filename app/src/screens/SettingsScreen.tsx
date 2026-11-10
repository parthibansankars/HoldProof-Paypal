import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { AI_MODEL, HACKATHON_NOTICE, PAYPAL_BASE_URL } from '../config';
import type { RootStackParamList } from '../navigation/types';
import { clearCredentials, loadCredentials, mask } from '../storage/credentials';
import type { Credentials } from '../types';
import { Button, Card, KeyValue, SandboxBadge, Screen, SectionTitle } from '../ui/components';
import { space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const [creds, setCreds] = useState<Credentials | null>(null);

  useEffect(() => navigation.addListener('focus', () => { loadCredentials().then(setCreds); }), [navigation]);

  function onClear() {
    Alert.alert('Remove keys from this device?', 'The PayPal Sandbox credentials and AI key will be deleted from encrypted storage. Jobs stay on the device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearCredentials();
          navigation.reset({ index: 0, routes: [{ name: 'Credentials' }] });
        },
      },
    ]);
  }

  return (
    <Screen>
      <SandboxBadge />
      <Text style={[type.title, { marginTop: space.md, marginBottom: space.lg }]}>Settings</Text>
      <Card tone="violet">
        <Text style={type.heading}>Hackathon demonstration only</Text>
        <Text style={[type.body, { marginTop: space.xs }]}>{HACKATHON_NOTICE}</Text>
      </Card>
      <SectionTitle>Keys on this device</SectionTitle>
      <Card>
        <KeyValue k="PayPal client ID" v={creds ? mask(creds.paypalClientId) : '—'} mono />
        <KeyValue k="PayPal secret" v={creds ? '••••••••' : '—'} />
        <KeyValue k="AI key" v={creds ? mask(creds.anthropicApiKey) : '—'} mono />
      </Card>
      <Button title="Change keys" variant="secondary" onPress={() => navigation.navigate('Credentials', { editing: true })} />
      <SectionTitle>Environment</SectionTitle>
      <Card>
        <KeyValue k="PayPal host" v={PAYPAL_BASE_URL.replace('https://', '')} mono />
        <KeyValue k="AI model" v={AI_MODEL} mono />
        <KeyValue k="Version" v={Constants.expoConfig?.version ?? '—'} />
      </Card>
      <Button title="Remove keys from this device" variant="danger" onPress={onClear} />
    </Screen>
  );
}
