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
import { cancelUnapproved, createHold, describePayPalError, syncHold } from '../services/holdproof';
import { appendLog } from '../storage/jobs';
import { photoUri } from '../storage/photos';
import { Button, Card, ErrorBanner, KeyValue, Screen, SectionTitle, StatusPill } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Hold'>;

export default function HoldScreen({ navigation, route }: Props) {
  const { jobId } = route.params;
  const job = useJob(jobId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Poll PayPal while waiting for the client's approval. One request at a time.
  useEffect(() => {
    if (job?.status !== 'AWAITING_APPROVAL') return;
    const timer = setInterval(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await syncHold(jobId);
      } catch (e) {
        setError(describePayPalError(e));
      } finally {
        inFlight.current = false;
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [job?.status, jobId]);

  useEffect(() => {
    if (job?.status === 'HELD') navigation.replace('Job', { jobId });
  }, [job?.status, jobId, navigation]);

  if (job === undefined) return <ActivityIndicator style={{ flex: 1 }} />;
  if (job === null) return <Screen><Text style={type.body}>Job not found.</Text></Screen>;

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      await createHold(jobId);
    } catch (e) {
      const msg = describePayPalError(e);
      setError(msg);
      await appendLog(jobId, 'error', `Order creation failed: ${msg}`);
    } finally {
      setBusy(false);
    }
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

  return (
    <Screen
      footer={
        job.status === 'READY' ? (
          <Button title={`Ask client to approve a ${formatMoney(job.amount)} hold`} onPress={onCreate} loading={busy} />
        ) : waiting ? (
          <>
            <Button title="Open approval on this phone" variant="secondary" onPress={() => job.approveUrl && WebBrowser.openBrowserAsync(job.approveUrl)} />
            <Button title="Cancel job" variant="danger" onPress={async () => { await cancelUnapproved(jobId); navigation.popToTop(); }} />
          </>
        ) : null
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.title, { flex: 1 }]} numberOfLines={2}>{job.title}</Text>
        <StatusPill status={job.status} />
      </View>
      <Text style={[type.display, { marginVertical: space.md }]}>{formatMoney(job.amount)}</Text>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {waiting && job.approveUrl ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[type.heading, { marginBottom: space.md }]}>Client: scan to approve the hold</Text>
          <View style={{ padding: space.md, backgroundColor: colors.white, borderRadius: radius.md }}>
            <QRCode value={job.approveUrl} size={220} color={colors.ink} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md, gap: space.sm }}>
            <ActivityIndicator color={colors.blue} />
            <Text style={type.small}>Waiting for PayPal · order {job.paypalStatus.order ?? '…'}</Text>
          </View>
          <Text style={[type.small, { textAlign: 'center', marginTop: space.sm }]}>
            The client logs in with a PayPal Sandbox personal account. Money is held, not moved, until the job is verified.
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
