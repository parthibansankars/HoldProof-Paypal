import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useJob } from '../hooks/useJob';
import type { RootStackParamList } from '../navigation/types';
import { attachBeforePhoto, runVerdict } from '../services/holdproof';
import { storeEvidencePhoto } from '../storage/photos';
import type { PhotoEvidence } from '../types';
import { Button, Card, ErrorBanner, Screen } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Camera'>;

async function currentLocation(): Promise<{ lat: number | null; lng: number | null; accuracy: number | null }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return { lat: null, lng: null, accuracy: null };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  } catch {
    return { lat: null, lng: null, accuracy: null };
  }
}

export default function CameraScreen({ navigation, route }: Props) {
  const { jobId, mode } = route.params;
  const job = useJob(jobId);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!permission) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!permission.granted) {
    return (
      <Screen>
        <Text style={type.title}>Camera access needed</Text>
        <Text style={[type.body, { marginVertical: space.lg }]}>
          HoldProof accepts evidence only from the in-app camera, so photos cannot be swapped for older pictures from the gallery.
        </Text>
        <Button title="Allow camera" onPress={requestPermission} />
      </Screen>
    );
  }

  async function capture() {
    if (!cameraRef.current || !job) return;
    setError(null);
    setBusy('Capturing…');
    try {
      const [ref, loc] = await Promise.all([
        cameraRef.current.takePictureAsync({ pictureRef: true, quality: 0.8 }),
        currentLocation(),
      ]);
      const capturedAt = new Date().toISOString();
      const saved = await ref.savePictureAsync({ quality: 0.8 });
      setBusy('Sealing evidence…');
      const stored = await storeEvidencePhoto(saved.uri, `${jobId}-${mode}-${Date.now()}.jpg`);
      const evidence: PhotoEvidence = {
        fileName: stored.fileName,
        sha256: stored.sha256,
        capturedAt,
        lat: loc.lat,
        lng: loc.lng,
        accuracyMeters: loc.accuracy,
      };
      if (mode === 'before') {
        await attachBeforePhoto(jobId, evidence);
        navigation.replace('Hold', { jobId });
      } else {
        setBusy('Proposer and Critic are reviewing the photos…');
        const attempt = await runVerdict(jobId, evidence);
        navigation.replace('Verdict', { jobId, attemptId: attempt.id });
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
      <View style={{ position: 'absolute', top: space.lg, left: space.lg, right: space.lg }}>
        <Card style={{ marginBottom: 0 }}>
          <Text style={type.label}>{mode === 'before' ? 'Step 2 · BEFORE photo' : 'Step 4 · AFTER photo'}</Text>
          <Text style={[type.body, { marginTop: space.xs }]}>
            {mode === 'before'
              ? 'Frame the whole work area. Include fixed features (walls, doors, fixtures) so the AFTER photo can be matched.'
              : 'Stand where you took the BEFORE photo and frame the same area.'}
          </Text>
          {job?.criteria.map((c) => (
            <Text key={c.id} style={[type.small, { marginTop: 2 }]}>• {c.text}</Text>
          ))}
        </Card>
      </View>
      <View style={{ padding: space.lg, backgroundColor: colors.ink }}>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {busy ? (
          <View style={{ alignItems: 'center', padding: space.md }}>
            <ActivityIndicator color={colors.white} />
            <Text style={[type.body, { color: colors.white, marginTop: space.sm, textAlign: 'center' }]}>{busy}</Text>
          </View>
        ) : (
          <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
            <Button title={mode === 'before' ? 'Capture BEFORE photo' : 'Capture AFTER photo and verify'} onPress={capture} disabled={!ready || !job} />
          </View>
        )}
      </View>
    </View>
  );
}
