import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { POLL_INTERVAL_MS } from '../config';
import { shortDigest } from '../core/digest';
import { formatMoney } from '../core/money';
import { useJob } from '../hooks/useJob';
import type { RootStackParamList } from '../navigation/types';
import { PayPalError } from '../paypal/client';
import { cancelUnapproved, createHold, describePayPalError, syncHold } from '../services/holdproof';
import { appendLog } from '../storage/jobs';
import { photoUri } from '../storage/photos';
import { Button, Card, ErrorBanner, KeyValue, Screen, SectionTitle, StatusPill } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Hold'>;

/** Polling stops after this many consecutive failures; the worker can resume it with "Check again". */
const MAX_POLL_FAILURES = 5;

function pollErrorMessage(e: unknown): string {
  if (e instanceof PayPalError && e.status === 401) return 'PayPal rejected the sandbox keys. Update them in Settings.';
  return describePayPalError(e);
}

export default function HoldScreen({ navigation, route }: Props) {
  const { jobId } = route.params;
  const job = useJob(jobId);
  const [busy, setBusy] = useState<'create' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollStopped, setPollStopped] = useState(false);
  const inFlight = useRef(false);
  const failures = useRef(0);

  // Poll PayPal while waiting for the client's approval. One request at a time; stops after repeated failures.
  useEffect(() => {
    if (job?.status !== 'AWAITING_APPROVAL' || pollStopped) return;
    const timer = setInterval(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await syncHold(jobId);
        failures.current = 0;
        setPollError(null);
      } catch (e) {
        failures.current += 1;
        setPollError(pollErrorMessage(e));
        const unauthorized = e instanceof PayPalError && e.status === 401;
        if (unauthorized || failures.current >= MAX_POLL_FAILURES) setPollStopped(true);
      } finally {
        inFlight.current = false;
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [job?.status, jobId, pollStopped]);

  useEffect(() => {
    if (job?.status === 'HELD') navigation.replace('Job', { jobId });
  }, [job?.status, jobId, navigation]);

  if (job === undefined) return <ActivityIndicator style={{ flex: 1 }} />;
  if (job === null) return <Screen><Text style={type.body}>Job not found.</Text></Screen>;

  async function onCreate() {
    setBusy('create');
    setError(null);
    try {
      await createHold(jobId);
    } catch (e) {
      const msg = describePayPalError(e);
      setError(msg);
      await appendLog(jobId, 'error', `Order creation failed: ${msg}`).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function onCancel() {
    setBusy('cancel');
    setError(null);
    try {
      const result = await cancelUnapproved(jobId);
      if (result.status === 'CANCELLED') navigation.popToTop();
    } catch (e) {
      setError(describePayPalError(e));
    } finally {
      setBusy(null);
    }
  }

  function onCheckAgain() {
    failures.current = 0;
    setPollError(null);
    setPollStopped(false);
  }

  async function onShareRecord() {
    if (!job?.digest || !job.approveUrl) return;
    const text =
      `HoldProof job agreement (PayPal Sandbox demo)\n\n${job.title}\nAmount: ${formatMoney(job.amount)}\n\n` +
      `Criteria:\n${job.criteria.map((c) => `- ${c.text}`).join('\n')}\n\n` +
      `Evidence digest: ${job.digest}\nThe same digest is stored in the PayPal order (${job.orderId}).\n\nApprove the hold: ${job.approveUrl}`;
    await Share.share({ message: text });
  }

  const waiting = job.status === 'AWAITING_APPROVAL';
  const beforeHasLocation = !!job.before && job.before.lat !== null && job.before.lng !== null;

  return (
    <Screen
      footer={
        job.status === 'READY' ? (
          beforeHasLocation ? (
            <Button title={`Ask client to approve a ${formatMoney(job.amount)} hold`} onPress={onCreate} loading={busy === 'create'} />
          ) : (
            <Button title="Retake BEFORE photo" onPress={() => navigation.replace('Camera', { jobId, mode: 'before' })} />
          )
        ) : waiting ? (
          <>
            {pollStopped ? <Button title="Check again" onPress={onCheckAgain} /> : null}
            <Button title="Open approval on this phone" variant="secondary" onPress={() => job.approveUrl && WebBrowser.openBrowserAsync(job.approveUrl)} />
            <Button title="Cancel job" variant="danger" onPress={onCancel} loading={busy === 'cancel'} disabled={!!busy} />
          </>
        ) : job.status === 'CANCELLED' ? (
          <Button title="Back to Home" variant="secondary" onPress={() => navigation.popToTop()} />
        ) : null
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.title, { flex: 1 }]} numberOfLines={2}>{job.title}</Text>
        <StatusPill status={job.status} />
      </View>
      <Text style={[type.display, { marginVertical: space.md }]}>{formatMoney(job.amount)}</Text>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {waiting ? <ErrorBanner message={pollError} /> : null}
      {waiting && pollStopped ? (
        <Card tone="amber">
          <Text style={type.body}>Checking PayPal has stopped after repeated errors. Press Check again to resume.</Text>
        </Card>
      ) : null}

      {job.status === 'CANCELLED' ? (
        <Card tone="blue">
          <Text style={type.body}>This approval request is closed. No money was held.</Text>
        </Card>
      ) : null}

      {job.status === 'READY' && !beforeHasLocation ? (
        <Card tone="amber">
          <Text style={type.body}>
            The BEFORE photo has no location. Without it the payment can never be released, so retake it with location enabled before asking the client to approve.
          </Text>
        </Card>
      ) : null}

      {waiting && job.approveUrl ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[type.heading, { marginBottom: space.md }]}>Client: scan to approve the hold</Text>
          <View style={{ padding: space.md, backgroundColor: colors.white, borderRadius: radius.md }}>
            <QRCode value={job.approveUrl} size={220} color={colors.ink} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md, gap: space.sm }}>
            {pollStopped ? null : <ActivityIndicator color={colors.blue} />}
            <Text style={type.small}>Waiting for PayPal · order {job.paypalStatus.order ?? '…'}</Text>
          </View>
          <Text style={[type.small, { textAlign: 'center', marginTop: space.sm }]}>
            The client logs in with a PayPal Sandbox personal account. Money is held, not moved, until the job is verified.
          </Text>
          <Text style={[type.small, { textAlign: 'center', marginTop: space.sm }]}>
            After the client presses Continue on PayPal, the approval is complete. The client can close the PayPal page, even if it
            shows a link that cannot be opened. This phone confirms the hold within a few seconds.
          </Text>
          <Button title="Share agreement and link" variant="ghost" onPress={onShareRecord} />
        </Card>
      ) : null}

      <SectionTitle>Evidence anchor</SectionTitle>
      <Card tone="violet">
        <Text style={type.small}>Fingerprint written into the PayPal order before approval</Text>
        <Text style={[type.title, { fontFamily: 'monospace', marginTop: space.xs }]} accessibilityLabel={`Digest ${job.digest}`}>
          {job.digest ? shortDigest(job.digest) : '—'}
        </Text>
        <Text style={[type.mono, { marginTop: space.xs }]} selectable>{job.digest}</Text>
        <Text style={[type.small, { marginTop: space.sm }]}>
          It covers the criteria, the price, and the BEFORE photo’s hash, time and location. Changing any of them later is detectable.
        </Text>
      </Card>

      {job.before ? (
        <Card>
          <Image source={{ uri: photoUri(job.before.fileName) }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md }} accessibilityLabel="BEFORE photo" />
          <KeyValue k="Captured" v={new Date(job.before.capturedAt).toLocaleString()} />
          <KeyValue k="Location" v={job.before.lat !== null ? `${job.before.lat.toFixed(5)}, ${job.before.lng!.toFixed(5)}` : 'Not available'} />
        </Card>
      ) : null}

      <SectionTitle>Agreed criteria</SectionTitle>
      <Card>
        {job.criteria.map((c) => (
          <Text key={c.id} style={[type.body, { marginBottom: space.xs }]}>{c.id.toUpperCase()} · {c.text}</Text>
        ))}
      </Card>
    </Screen>
  );
}
