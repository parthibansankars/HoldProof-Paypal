import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { scopeJob } from '../ai/agents';
import type { ScopeResult } from '../ai/schemas';
import { formatMoney, isValidAmount } from '../core/money';
import type { RootStackParamList } from '../navigation/types';
import { createJob } from '../services/holdproof';
import { loadCredentials } from '../storage/credentials';
import { Button, Card, ErrorBanner, Field, Screen, SectionTitle } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NewJob'>;

const EXAMPLE = 'Clear all boxes and bags out of the left corner of the garage and sweep that floor area.';

export default function NewJobScreen({ navigation }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('60.00');
  const [scope, setScope] = useState<ScopeResult | null>(null);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountOk = isValidAmount(amount);
  const kept = scope ? scope.criteria.filter((_, i) => !removed.has(i)) : [];

  async function onScope() {
    setBusy(true);
    setError(null);
    setScope(null);
    setRemoved(new Set());
    try {
      const creds = await loadCredentials();
      if (!creds) {
        setError('Add your sandbox keys in Settings first.');
        return;
      }
      const result = await scopeJob(creds.aiApiKey, description.trim(), amount);
      if (!result.ok) setError(result.error);
      else if (result.value.criteria.length === 0) setError('No photo-checkable criteria could be found. Describe a visible end result.');
      else setScope(result.value);
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not scope the job.');
    } finally {
      setBusy(false);
    }
  }

  async function onContinue() {
    if (!scope) return;
    setBusy(true);
    try {
      const job = await createJob({
        title: scope.title.slice(0, 60),
        description: description.trim(),
        amount,
        criteria: kept.map((c, i) => ({ id: `c${i + 1}`, text: c.text, visibleEvidence: c.visible_evidence })),
        refused: scope.refused,
      });
      navigation.replace('Camera', { jobId: job.id, mode: 'before' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        scope ? (
          <Button title={`Agree ${kept.length} criteria and take the BEFORE photo`} onPress={onContinue} disabled={kept.length === 0} loading={busy} />
        ) : (
          <Button title={busy ? 'Proposer is scoping the job…' : 'Generate photo-checkable criteria'} onPress={onScope}
            disabled={description.trim().length < 15 || !amountOk} loading={busy} />
        )
      }
    >
      <Text style={type.title}>Describe the job</Text>
      <Text style={[type.body, { marginTop: space.xs, marginBottom: space.lg }]}>
        Say what will be visibly different when you are done. The AI turns it into criteria a photo can prove.
      </Text>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <Field label="Job" value={description} onChangeText={(t) => { setDescription(t); setScope(null); }} multiline placeholder={EXAMPLE} maxLength={600} />
      {!description ? <Button title="Use the demo job" variant="ghost" onPress={() => setDescription(EXAMPLE)} /> : null}
      <Field label="Agreed price (USD)" value={amount} onChangeText={(t) => { setAmount(t); setScope(null); }} keyboardType="decimal-pad"
        hint={amountOk ? `The client will approve a hold of ${formatMoney(amount)}.` : 'Enter an amount between 1.00 and 10,000.00.'} />

      {scope ? (
        <>
          <SectionTitle>Proposed criteria · tap to remove</SectionTitle>
          {scope.criteria.map((c, i) => {
            const off = removed.has(i);
            return (
              <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: !off }}
                onPress={() => setRemoved((s) => { const n = new Set(s); off ? n.delete(i) : n.add(i); return n; })}>
                <Card style={{ opacity: off ? 0.45 : 1 }}>
                  <Text style={[type.heading, off && { textDecorationLine: 'line-through' }]}>{c.text}</Text>
                  <Text style={[type.small, { marginTop: space.xs }]}>Visible proof: {c.visible_evidence}</Text>
                </Card>
              </Pressable>
            );
          })}
          {scope.refused.length ? (
            <>
              <SectionTitle>Refused · a photo cannot prove these</SectionTitle>
              <Card tone="coral">
                {scope.refused.map((r, i) => (
                  <View key={i} style={{ marginBottom: i < scope.refused.length - 1 ? space.md : 0 }}>
                    <Text style={[type.body, { color: colors.ink, fontWeight: '600' }]}>“{r.text}”</Text>
                    <Text style={type.small}>{r.reason}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
