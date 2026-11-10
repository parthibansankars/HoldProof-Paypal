import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import { refundCapCents } from '../core/judge';
import { formatMoney, fromCents } from '../core/money';
import { useJob } from '../hooks/useJob';
import type { RootStackParamList } from '../navigation/types';
import { describePayPalError, executeRefund, executeVoid, refreshFromPayPal, refundDecision } from '../services/holdproof';
import { exportJson, exportPdf } from '../services/exportRecord';
import { appendLog } from '../storage/jobs';
import { photoUri } from '../storage/photos';
import { Button, Card, CheckRow, ErrorBanner, Field, KeyValue, Screen, SectionTitle, StatusPill, Timeline } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Job'>;

export default function JobScreen({ navigation, route }: Props) {
  const { jobId } = route.params;
  const job = useJob(jobId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundCriterion, setRefundCriterion] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState('');

  if (job === undefined) return <ActivityIndicator style={{ flex: 1 }} />;
  if (job === null) return <Screen><Text style={type.body}>Job not found.</Text></Screen>;

  const cap = fromCents(refundCapCents(job.amount, job.criteria.length));
  const refundCheck = refundCriterion && refundAmount ? refundDecision(job, refundCriterion, refundAmount) : null;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = describePayPalError(e);
      setError(msg);
      await appendLog(jobId, 'error', `${label} failed: ${msg}`).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  function confirmVoid() {
    Alert.alert('Void the hold?', `This releases the ${formatMoney(job!.amount)} hold back to the client through PayPal. It cannot be undone.`, [
      { text: 'Keep the hold', style: 'cancel' },
      { text: 'Void hold', style: 'destructive', onPress: () => run('Void', () => executeVoid(jobId)) },
    ]);
  }

  function confirmRefund() {
    if (!refundCriterion || !refundCheck?.allowed) return;
    Alert.alert('Issue partial refund?', `Refund ${formatMoney(refundAmount)} to the client through PayPal for criterion ${refundCriterion.toUpperCase()}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Refund',
        onPress: () => run('Refund', async () => {
          await executeRefund(jobId, refundCriterion, refundAmount);
          setRefundOpen(false);
          setRefundCriterion(null);
          setRefundAmount('');
        }),
      },
    ]);
  }

  const lastAttempt = job.attempts[job.attempts.length - 1];

  return (
    <Screen
      footer={
        job.status === 'HELD' ? (
          <>
            <Button title="Job done · take the AFTER photo" onPress={() => navigation.navigate('Camera', { jobId, mode: 'after' })} disabled={!!busy} />
            <Button title="Abandon job · void the hold" variant="danger" onPress={confirmVoid} loading={busy === 'Void'} disabled={!!busy} />
          </>
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.title, { flex: 1 }]} numberOfLines={2}>{job.title}</Text>
        <StatusPill status={job.status} />
      </View>
      <Text style={[type.display, { marginTop: space.md }]}>{formatMoney(job.amount)}</Text>
      <Text style={[type.small, { marginBottom: space.lg }]}>
        {job.status === 'HELD' ? 'Held in the client’s PayPal account. Released only when the Judge permits it.'
          : job.status === 'CAPTURED' ? 'Released to you after a passing verdict.'
          : job.status === 'VOIDED' ? 'The hold was voided and released to the client.' : ''}
      </Text>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <SectionTitle right={<Button title={busy === 'Refresh' ? '…' : 'Refresh'} variant="ghost" onPress={() => run('Refresh', () => refreshFromPayPal(jobId))} />}>
        PayPal Sandbox (read back)
      </SectionTitle>
      <Card>
        <KeyValue k="Order" v={`${job.orderId ?? '—'} · ${job.paypalStatus.order ?? '—'}`} mono />
        <KeyValue k="Authorization" v={`${job.authorizationId ?? '—'} · ${job.paypalStatus.authorization ?? '—'}`} mono />
        {job.authorizationExpiresAt ? <KeyValue k="Hold expires" v={new Date(job.authorizationExpiresAt).toLocaleString()} /> : null}
        <KeyValue k="Capture" v={`${job.captureId ?? '—'} · ${job.paypalStatus.capture ?? '—'}`} mono />
        {job.refunds.map((r) => (
          <KeyValue key={r.id} k={`Refund ${r.criterionId.toUpperCase()}`} v={`${formatMoney(r.amount)} · ${r.status}`} />
        ))}
      </Card>

      {job.attempts.length ? (
        <>
          <SectionTitle>Verdicts</SectionTitle>
          {[...job.attempts].reverse().map((a) => (
            <Pressable key={a.id} onPress={() => navigation.navigate('Verdict', { jobId, attemptId: a.id })} accessibilityRole="button">
              <Card tone={a.decision.allowed ? 'green' : 'coral'}>
                <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                  <Image source={{ uri: photoUri(a.after.fileName) }} style={{ width: 56, height: 56, borderRadius: radius.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.heading}>{a.decision.allowed ? (a.executed ? 'Passed · money released' : 'Passed · awaiting your release') : 'Refused · no PayPal call'}</Text>
                    <Text style={type.small}>{new Date(a.at).toLocaleString()} · {a.decision.checks.filter((c) => c.ok).length}/{a.decision.checks.length} checks</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      {job.status === 'CAPTURED' ? (
        <>
          <SectionTitle>On-site remedy</SectionTitle>
          {!refundOpen ? (
            <Button title="Client contests a criterion · partial refund" variant="secondary" onPress={() => setRefundOpen(true)} />
          ) : (
            <Card>
              <Text style={[type.body, { marginBottom: space.md }]}>Pick the contested criterion. The cap is an equal share of the job: {formatMoney(cap)}.</Text>
              {job.criteria.map((c) => (
                <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ selected: refundCriterion === c.id }}
                  onPress={() => { setRefundCriterion(c.id); if (!refundAmount) setRefundAmount(cap); }}
                  style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, marginBottom: space.sm,
                    borderColor: refundCriterion === c.id ? colors.ink : colors.line }}>
                  <Text style={type.body}>{c.id.toUpperCase()} · {c.text}</Text>
                </Pressable>
              ))}
              <Field label="Refund amount (USD)" value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" />
              {refundCheck ? refundCheck.checks.map((c) => <CheckRow key={c.id} check={c} />) : null}
              <View style={{ gap: space.sm, marginTop: space.md }}>
                <Button title="Refund through PayPal" onPress={confirmRefund} disabled={!refundCheck?.allowed || !!busy} loading={busy === 'Refund'} />
                <Button title="Cancel" variant="ghost" onPress={() => setRefundOpen(false)} />
              </View>
            </Card>
          )}
        </>
      ) : null}

      {job.orderId ? (
        <>
          <SectionTitle>Evidence record</SectionTitle>
          <View style={{ gap: space.sm, marginBottom: space.lg }}>
            <Button title="Verify record against PayPal" variant="secondary" onPress={() => navigation.navigate('Verify', { jobId })} />
            <Button title={busy === 'PDF' ? 'Preparing PDF…' : 'Export record (PDF)'} variant="secondary" onPress={() => run('PDF', () => exportPdf(job))} disabled={!!busy} />
            <Button title="Export record (JSON)" variant="secondary" onPress={() => run('JSON', () => exportJson(job))} disabled={!!busy} />
            {job.captureId ? <Button title="Check PayPal disputes" variant="secondary" onPress={() => navigation.navigate('Disputes', { jobId })} /> : null}
          </View>
        </>
      ) : null}

      {lastAttempt && !lastAttempt.decision.allowed && job.status === 'HELD' ? (
        <Card tone="amber">
          <Text style={type.body}>The last check was refused, so no money moved. Retake the AFTER photo from the same spot, or void the hold.</Text>
        </Card>
      ) : null}

      <SectionTitle>Activity</SectionTitle>
      <Card>
        <Timeline entries={job.log} />
      </Card>
    </Screen>
  );
}
