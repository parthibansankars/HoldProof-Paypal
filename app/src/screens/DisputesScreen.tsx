import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { formatMoney } from '../core/money';
import type { RootStackParamList } from '../navigation/types';
import type { PayPalDispute } from '../paypal/client';
import { checkDisputes, describePayPalError, draftDispute } from '../services/holdproof';
import { Button, Card, ErrorBanner, KeyValue, Screen, SectionTitle } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Disputes'>;

export default function DisputesScreen({ route }: Props) {
  const { jobId } = route.params;
  const [disputes, setDisputes] = useState<PayPalDispute[] | null>(null);
  const [busy, setBusy] = useState<string | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; text: string; removed: string[] } | null>(null);

  async function load() {
    setBusy('load');
    setError(null);
    try {
      setDisputes(await checkDisputes(jobId));
    } catch (e) {
      setError(describePayPalError(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    load();
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onDraft(d: PayPalDispute) {
    setBusy(d.dispute_id);
    setError(null);
    const result = await draftDispute(jobId, d);
    setBusy(null);
    if (!result.ok) setError(result.error);
    else setDraft({ id: d.dispute_id, ...result.value });
  }

  return (
    <Screen footer={<Button title="Check PayPal again" variant="secondary" onPress={load} loading={busy === 'load'} />}>
      <Text style={type.title}>PayPal disputes</Text>
      <Text style={[type.body, { marginTop: space.xs, marginBottom: space.lg }]}>
        HoldProof polls the PayPal Disputes API for this capture. If a dispute exists, the Proposer drafts a response from the evidence record and the Critic removes anything the record does not support. You decide whether to send it; PayPal decides the outcome.
      </Text>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {disputes === null && busy === 'load' ? <ActivityIndicator color={colors.ink} /> : null}
      {disputes && disputes.length === 0 ? (
        <Card tone="green"><Text style={type.body}>PayPal reports no disputes for this capture.</Text></Card>
      ) : null}
      {disputes?.map((d) => (
        <Card key={d.dispute_id}>
          <KeyValue k="Dispute" v={d.dispute_id} mono />
          <KeyValue k="Reason" v={d.reason ?? '—'} />
          <KeyValue k="Status" v={d.status} />
          <KeyValue k="Stage" v={d.dispute_life_cycle_stage ?? '—'} />
          {d.dispute_amount ? <KeyValue k="Amount" v={formatMoney(d.dispute_amount.value)} /> : null}
          <Button title={busy === d.dispute_id ? 'Drafting…' : 'Draft a response from the record'} onPress={() => onDraft(d)} loading={busy === d.dispute_id} />
        </Card>
      ))}
      {draft ? (
        <>
          <SectionTitle>Draft for {draft.id}</SectionTitle>
          <Card tone="violet">
            <Text style={type.body} selectable>{draft.text}</Text>
          </Card>
          {draft.removed.length ? (
            <Card tone="coral">
              <Text style={type.label}>Removed by the Critic (not supported by the record)</Text>
              {draft.removed.map((r, i) => <Text key={i} style={[type.small, { marginTop: space.xs }]}>• {r}</Text>)}
            </Card>
          ) : null}
          <Button title="Copy draft" variant="secondary" onPress={() => Clipboard.setStringAsync(draft.text)} />
        </>
      ) : null}
    </Screen>
  );
}
