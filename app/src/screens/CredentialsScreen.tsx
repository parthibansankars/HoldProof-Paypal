import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Linking, Modal, ScrollView, Text, View } from 'react-native';
import { testAiKey } from '../ai/agents';
import { PAYPAL_ENVIRONMENT_LABEL, SETUP_NOTICE } from '../config';
import type { RootStackParamList } from '../navigation/types';
import { PayPalClient, describePayPalError } from '../paypal/client';
import { resetPayPalClient } from '../services/holdproof';
import { loadCredentials, saveCredentials } from '../storage/credentials';
import { Button, Card, ErrorBanner, Field, NoticeContent, SandboxBadge, Screen } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Credentials'>;

export default function CredentialsScreen({ navigation, route }: Props) {
  const editing = !!route.params?.editing;
  const [acknowledged, setAcknowledged] = useState(false);
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    loadCredentials()
      .then((c) => {
        if (c) {
          setClientId(c.paypalClientId);
          setSecret(c.paypalClientSecret);
          setAiKey(c.anthropicApiKey);
        }
      })
      .catch((e) => setError(`Could not read the keys from this device’s encrypted storage: ${(e as Error).message}`));
  }, [editing]);

  const canSave = clientId.trim().length > 10 && secret.trim().length > 10 && aiKey.trim().length > 10;

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      setStatus('Checking PayPal Sandbox credentials…');
      try {
        await new PayPalClient(clientId.trim(), secret.trim()).getAccessToken();
      } catch (e) {
        setError(`PayPal Sandbox: ${describePayPalError(e)}`);
        return;
      }
      setStatus('Checking the AI key…');
      const ai = await testAiKey(aiKey.trim());
      if (!ai.ok) {
        setError(`AI provider: ${ai.error}`);
        return;
      }
      setStatus('Saving to encrypted storage…');
      await saveCredentials({ paypalClientId: clientId, paypalClientSecret: secret, anthropicApiKey: aiKey });
      resetPayPalClient();
      if (editing) navigation.goBack();
      else navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      setError(`Could not store the keys in this device’s encrypted storage: ${(e as Error)?.message ?? 'unknown error'}`);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <Screen
      footer={<Button title={busy ? status ?? 'Saving…' : 'Verify and save securely'} onPress={onSave} disabled={!canSave || !acknowledged} loading={busy} />}
    >
      {/* Blocking notice: the back button cannot dismiss it; only the acknowledgement button closes it. */}
      <Modal visible={!acknowledged} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={{ flex: 1, backgroundColor: 'rgba(14,26,43,0.6)', justifyContent: 'center', padding: space.lg }}>
          <Card style={{ maxHeight: '90%' }}>
            <Text style={[type.title, { marginBottom: space.md }]} accessibilityRole="header">{SETUP_NOTICE.title}</Text>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator persistentScrollbar>
              <NoticeContent notice={SETUP_NOTICE} />
            </ScrollView>
            <Text style={[type.small, { textAlign: 'center', marginVertical: space.sm }]}>Scroll to read the full notice</Text>
            <Button title="I understand — use sandbox keys only" onPress={() => setAcknowledged(true)} />
          </Card>
        </View>
      </Modal>

      <SandboxBadge />
      <Text style={[type.display, { marginTop: space.md }]}>{editing ? 'Sandbox keys' : 'Welcome to HoldProof'}</Text>
      <Text style={[type.body, { marginTop: space.sm, marginBottom: space.md }]}>
        A PayPal hold your client approves before you start, released only when AI confirms the agreed work in your
        before-and-after photos. Enter your {PAYPAL_ENVIRONMENT_LABEL} app credentials and an AI key to begin.
      </Text>
      <Button title="Read the hackathon notice again" variant="ghost" onPress={() => setAcknowledged(false)} />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <Card>
        <Text style={[type.heading, { marginBottom: space.md }]}>PayPal Sandbox app</Text>
        <Field label="Client ID" value={clientId} onChangeText={setClientId} autoCapitalize="none" autoCorrect={false} placeholder="Sandbox client ID" />
        <Field label="Client secret" value={secret} onChangeText={setSecret} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Sandbox secret" />
        <Button title="Where do I find these?" variant="ghost" onPress={() => Linking.openURL('https://developer.paypal.com/dashboard/applications/sandbox')} />
      </Card>

      <Card>
        <Text style={[type.heading, { marginBottom: space.md }]}>AI provider</Text>
        <Field label="Anthropic API key" value={aiKey} onChangeText={setAiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="sk-ant-…" />
        <Button title="Get an API key" variant="ghost" onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')} />
      </Card>

      <Text style={[type.small, { color: colors.slate }]}>
        Keys are stored only in this device’s encrypted storage (Android Keystore). They are never included in the app
        package, source code, logs or exports. You can remove them in Settings or by uninstalling the app.
      </Text>
    </Screen>
  );
}
