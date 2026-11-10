import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { MAX_SCENE_DISTANCE_METERS } from '../core/judge';
import { useJob } from '../hooks/useJob';
import type { RootStackParamList } from '../navigation/types';
import { attachBeforePhoto, runVerdict } from '../services/holdproof';
import { storeEvidencePhoto } from '../storage/photos';
import type { PhotoEvidence } from '../types';
import { Button, Card, ErrorBanner, Screen } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Camera'>;

const LOCATION_TIMEOUT_MS = 15_000;
const LAST_KNOWN_MAX_AGE_MS = 120_000;

const LOCATION_REQUIRED =
  'Location is required. HoldProof compares where the BEFORE and AFTER photos were taken, and the payment cannot be released without it. ' +
  'Turn on location and allow access, then capture again.';

type LocationResult =
  | { ok: true; lat: number; lng: number; accuracy: number | null }
  | { ok: false; reason: 'denied' | 'blocked' | 'unavailable' };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Location timed out')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function currentLocation(): Promise<LocationResult> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return { ok: false, reason: perm.canAskAgain === false ? 'blocked' : 'denied' };
  try {
    const pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), LOCATION_TIMEOUT_MS);
    return { ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  } catch {
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
      if (last) return { ok: true, lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy ?? null };
    } catch {
      /* fall through */
    }
    return { ok: false, reason: 'unavailable' };
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
  const [locationBlocked, setLocationBlocked] = useState(false);

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
    setLocationBlocked(false);
    setBusy('Capturing…');
    try {
      const [ref, loc] = await Promise.all([
        cameraRef.current.takePictureAsync({ pictureRef: true, quality: 0.8 }),
        currentLocation(),
      ]);
      const capturedAt = new Date().toISOString();
      if (!loc.ok) {
        // Without a location the Judge can never permit the capture, so stop before any evidence or AI call.
        setLocationBlocked(loc.reason === 'blocked');
        setError(LOCATION_REQUIRED);
        setBusy(null);
        return;
      }
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
          <Text style={[type.small, { marginTop: space.xs }]}>
            Location must be on: the photo is recorded with where it was taken, and both photos must be within {MAX_SCENE_DISTANCE_METERS} m of each other.
          </Text>
          {job?.criteria.map((c) => (
            <Text key={c.id} style={[type.small, { marginTop: 2 }]}>• {c.text}</Text>
          ))}
        </Card>
      </View>
      <View style={{ padding: space.lg, backgroundColor: colors.ink }}>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {locationBlocked ? (
          <View style={{ marginBottom: space.md }}>
            <Button title="Open app settings" variant="secondary" onPress={() => Linking.openSettings()} />
          </View>
        ) : null}
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
