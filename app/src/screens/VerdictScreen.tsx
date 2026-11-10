import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, View } from 'react-native';
import { formatMoney } from '../core/money';
import { useJob } from '../hooks/useJob';
import type { RootStackParamList } from '../navigation/types';
import { describePayPalError, executeCapture } from '../services/holdproof';
import { appendLog } from '../storage/jobs';
import { photoUri } from '../storage/photos';
import { Button, Card, CheckRow, ErrorBanner, Screen, SectionTitle } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Verdict'>;

function AgentHeader({ name, role, color }: { name: string; role: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.white, fontWeight: '800' }}>{name[0]}</Text>
      </View>
      <View>
        <Text style={type.heading}>{name}</Text>
        <Text style={type.small}>{role}</Text>
      </View>
    </View>
  );
}

export default function VerdictScreen({ navigation, route }: Props) {
  const { jobId, attemptId } = route.params;
  const job = useJob(jobId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (job === undefined) return <ActivityIndicator style={{ flex: 1 }} />;
  const attempt = job?.attempts.find((a) => a.id === attemptId);
  if (!job || !attempt) return <Screen><Text style={type.body}>Verdict not found.</Text></Screen>;

  const { proposal, critique, decision } = attempt;
  const canRelease = decision.allowed && !attempt.executed && job.status === 'HELD';

  function confirmRelease() {
    Alert.alert('Release the payment?', `The Judge permits capturing ${formatMoney(job!.amount)} from the PayPal hold. PayPal will confirm the result.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Release',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await executeCapture(jobId, attemptId);
            navigation.replace('Job', { jobId });
          } catch (e) {
            const msg = describePayPalError(e);
            setError(msg);
            await appendLog(jobId, 'error', `Capture failed: ${msg}`);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <Screen
      footer={
        canRelease ? (
          <Button title={`Release ${formatMoney(job.amount)} via PayPal`} onPress={confirmRelease} loading={busy} />
        ) : job.status === 'HELD' && !decision.allowed ? (
          <>
            <Button title="Retake the AFTER photo" onPress={() => navigation.replace('Camera', { jobId, mode: 'after' })} />
            <Button title="Back to job" variant="secondary" onPress={() => navigation.replace('Job', { jobId })} />
          </>
        ) : (
          <Button title="Back to job" variant="secondary" onPress={() => navigation.replace('Job', { jobId })} />
        )
      }
    >
      <Card tone={decision.allowed ? 'green' : 'coral'}>
        <Text style={type.label}>Judge decision</Text>
        <Text style={[type.title, { marginTop: space.xs, color: decision.allowed ? colors.green : colors.coral }]}>
          {decision.allowed ? (attempt.executed ? 'Released' : 'Capture permitted') : 'Capture refused'}
        </Text>
        <Text style={[type.body, { marginTop: space.xs }]}>
          {decision.allowed
            ? attempt.executed ? 'PayPal confirmed the capture.' : 'Every check passed. You confirm the release; PayPal confirms the result.'
            : 'At least one check failed, so no PayPal call was made. The money stays held.'}
        </Text>
      </Card>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.lg }}>
        {job.before ? (
          <View style={{ flex: 1 }}>
            <Text style={type.label}>Before</Text>
            <Image source={{ uri: photoUri(job.before.fileName) }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, marginTop: space.xs }} accessibilityLabel="BEFORE photo" />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={type.label}>After</Text>
          <Image source={{ uri: photoUri(attempt.after.fileName) }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, marginTop: space.xs }} accessibilityLabel="AFTER photo" />
        </View>
      </View>

      <SectionTitle>Agent 1</SectionTitle>
      <Card>
        <AgentHeader name="Proposer" role="AI · proposes a verdict" color={colors.violet} />
        {proposal ? (
          <>
            <Text style={[type.body, { marginBottom: space.sm }]}>
              Same scene: <Text style={{ fontWeight: '700', color: proposal.same_scene ? colors.green : colors.coral }}>{proposal.same_scene ? 'yes' : 'no'}</Text> — {proposal.same_scene_reason}
            </Text>
            {job.criteria.map((c) => {
              const v = proposal.criteria.find((x) => x.id === c.id);
              return (
                <CheckRow key={c.id} check={{ id: c.id, label: `${c.id.toUpperCase()} · ${c.text}`, ok: !!v?.pass, detail: v?.reason ?? 'Not assessed' }} />
              );
            })}
            <Text style={[type.small, { marginTop: space.sm }]}>Overall: {proposal.overall}. {proposal.summary}</Text>
          </>
        ) : (
          <Text style={[type.body, { color: colors.coral }]}>{attempt.proposalError}</Text>
        )}
      </Card>

      <SectionTitle>Agent 2</SectionTitle>
      <Card>
        <AgentHeader name="Critic" role="AI · looks for reasons the verdict is wrong" color={colors.coral} />
        {critique ? (
          <>
            <Text style={[type.body, { fontWeight: '700', color: critique.objections.length ? colors.coral : colors.green }]}>
              {critique.objections.length ? `${critique.objections.length} objection(s)` : 'No objection'}
            </Text>
            {critique.objections.map((o, i) => (
              <Text key={i} style={[type.body, { marginTop: space.xs }]}>• {o.criterion_id.toUpperCase()} · {o.kind.replace(/_/g, ' ')}: {o.detail}</Text>
            ))}
            <Text style={[type.small, { marginTop: space.sm }]}>{critique.summary}</Text>
          </>
        ) : (
          <Text style={[type.body, { color: colors.coral }]}>{attempt.critiqueError}</Text>
        )}
      </Card>

      <SectionTitle>Agent 3</SectionTitle>
      <Card>
        <AgentHeader name="Judge" role="Deterministic code · the only part allowed to call PayPal" color={colors.amber} />
        {decision.checks.map((c) => <CheckRow key={c.id} check={c} />)}
      </Card>
    </Screen>
  );
}
