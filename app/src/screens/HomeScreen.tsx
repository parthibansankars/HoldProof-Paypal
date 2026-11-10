import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useLayoutEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { formatMoney, toCents, fromCents } from '../core/money';
import { useJobs } from '../hooks/useJob';
import type { RootStackParamList } from '../navigation/types';
import type { Job } from '../types';
import { Button, Card, SandboxBadge, Screen, SectionTitle, StatusPill } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

function sum(jobs: Job[], pred: (j: Job) => boolean): string {
  return fromCents(jobs.filter(pred).reduce((s, j) => s + toCents(j.amount), 0));
}

export default function HomeScreen({ navigation }: Props) {
  const jobs = useJobs();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => navigation.navigate('Settings')} hitSlop={12}>
          <Text style={{ color: colors.blue, fontWeight: '700', fontSize: 15 }}>Settings</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  function open(job: Job) {
    if (job.status === 'DRAFT') navigation.navigate('Camera', { jobId: job.id, mode: 'before' });
    else if (job.status === 'READY' || job.status === 'AWAITING_APPROVAL') navigation.navigate('Hold', { jobId: job.id });
    else navigation.navigate('Job', { jobId: job.id });
  }

  return (
    <Screen footer={<Button title="Start a new job" onPress={() => navigation.navigate('NewJob')} />}>
      <SandboxBadge />
      <Text style={[type.display, { marginTop: space.md }]}>Your jobs</Text>

      {jobs === undefined ? (
        <ActivityIndicator style={{ marginTop: space.xxl }} color={colors.ink} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
            <Card tone="amber" style={{ flex: 1 }}>
              <Text style={type.label}>Held for you</Text>
              <Text style={[type.title, { marginTop: space.xs }]}>{formatMoney(sum(jobs, (j) => j.status === 'HELD'))}</Text>
            </Card>
            <Card tone="green" style={{ flex: 1 }}>
              <Text style={type.label}>Released</Text>
              <Text style={[type.title, { marginTop: space.xs }]}>{formatMoney(sum(jobs, (j) => j.status === 'CAPTURED'))}</Text>
            </Card>
          </View>
          <Text style={[type.small, { marginBottom: space.lg }]}>Totals come from jobs on this device; each amount is confirmed by PayPal Sandbox.</Text>

          <SectionTitle>Jobs</SectionTitle>
          {jobs.length === 0 ? (
            <Card>
              <Text style={type.heading}>No jobs yet</Text>
              <Text style={[type.body, { marginTop: space.sm }]}>
                1. Describe the job and agree photo-checkable criteria.{'\n'}
                2. Take a BEFORE photo; your client approves a PayPal hold.{'\n'}
                3. Take an AFTER photo; two AI agents check it and the Judge releases the money.
              </Text>
            </Card>
          ) : (
            jobs.map((job) => (
              <Pressable key={job.id} onPress={() => open(job)} accessibilityRole="button" accessibilityLabel={`${job.title}, ${formatMoney(job.amount)}`}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[type.heading, { flex: 1, marginRight: space.md }]} numberOfLines={1}>{job.title}</Text>
                    <StatusPill status={job.status} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
                    <Text style={type.small}>{new Date(job.createdAt).toLocaleString()}</Text>
                    <Text style={[type.heading]}>{formatMoney(job.amount)}</Text>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
