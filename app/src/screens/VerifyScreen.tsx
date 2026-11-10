import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { shortDigest } from '../core/digest';
import type { RootStackParamList } from '../navigation/types';
import { describePayPalError, verifyRecord, type VerifyResult } from '../services/holdproof';
import { Button, Card, CheckRow, ErrorBanner, KeyValue, Screen, SectionTitle } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Verify'>;

export default function VerifyScreen({ route }: Props) {
  const { jobId } = route.params;
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await verifyRecord(jobId));
    } catch (e) {
      setError(describePayPalError(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    run();
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = !!result && result.digestMatchesPayPal && result.beforePhotoHashMatches && result.digestMatchesRecord;

  return (
    <Screen footer={<Button title="Verify again" variant="secondary" onPress={run} loading={busy} />}>
      <Text style={type.title}>Verify record</Text>
      <Text style={[type.body, { marginTop: space.xs, marginBottom: space.lg }]}>
        HoldProof recomputes the fingerprint from the stored criteria and BEFORE photo, then reads the custom_id back from the PayPal order the client approved.
      </Text>
      <ErrorBanner message={error} />
      {busy && !result ? <ActivityIndicator color={colors.ink} /> : null}
      {result ? (
        <>
          <Card tone={ok ? 'green' : 'coral'}>
            <Text style={[type.title, { color: ok ? colors.green : colors.coral }]}>{ok ? 'Record intact' : 'Record does not match'}</Text>
            <Text style={type.body}>
              {ok ? 'The agreement and BEFORE photo are unchanged since the client approved the PayPal order.'
                : 'Something changed after approval, or the PayPal order does not carry this record.'}
            </Text>
          </Card>
          <Card>
            <CheckRow check={{ id: 'photo', label: 'BEFORE photo hash matches', ok: result.beforePhotoHashMatches, detail: 'SHA-256 of the base64 text of the stored JPEG' }} />
            <CheckRow check={{ id: 'local', label: 'Recomputed digest matches the saved digest', ok: result.digestMatchesRecord, detail: shortDigest(result.digestRecomputed) }} />
            <CheckRow check={{ id: 'paypal', label: 'Digest matches custom_id in PayPal', ok: result.digestMatchesPayPal, detail: result.customIdFromPayPal ? shortDigest(result.customIdFromPayPal) : 'No custom_id on the order' }} />
          </Card>
          <SectionTitle>Details</SectionTitle>
          <Card>
            <KeyValue k="Recomputed" v={result.digestRecomputed} mono />
            <KeyValue k="From PayPal" v={result.customIdFromPayPal ?? '—'} mono />
            <KeyValue k="Order status" v={result.orderStatus ?? '—'} />
            <KeyValue k="Checked" v={new Date(result.checkedAt).toLocaleString()} />
          </Card>
          <Text style={type.small}>
            Limits: this proves the record was not changed after approval. It does not prove the photos are truthful or judge the quality of the work.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
