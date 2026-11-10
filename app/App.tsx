import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList } from './src/navigation/types';
import CameraScreen from './src/screens/CameraScreen';
import CredentialsScreen from './src/screens/CredentialsScreen';
import DisputesScreen from './src/screens/DisputesScreen';
import HoldScreen from './src/screens/HoldScreen';
import HomeScreen from './src/screens/HomeScreen';
import JobScreen from './src/screens/JobScreen';
import NewJobScreen from './src/screens/NewJobScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import VerdictScreen from './src/screens/VerdictScreen';
import VerifyScreen from './src/screens/VerifyScreen';
import { loadCredentials } from './src/storage/credentials';
import { colors } from './src/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initial, setInitial] = useState<'Home' | 'Credentials' | null>(null);

  useEffect(() => {
    loadCredentials()
      .then((c) => setInitial(c ? 'Home' : 'Credentials'))
      .catch(() => setInitial('Credentials'))
      .finally(() => SplashScreen.hideAsync().catch(() => undefined));
  }, []);

  if (!initial) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initial}
          screenOptions={{
            headerStyle: { backgroundColor: colors.paper },
            headerShadowVisible: false,
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.paper },
          }}
        >
          <Stack.Screen name="Credentials" component={CredentialsScreen} options={{ title: 'Sandbox setup' }} />
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'HoldProof' }} />
          <Stack.Screen name="NewJob" component={NewJobScreen} options={{ title: '1 · Scope the job' }} />
          <Stack.Screen name="Camera" component={CameraScreen} options={{ title: 'Evidence camera' }} />
          <Stack.Screen name="Hold" component={HoldScreen} options={{ title: '3 · PayPal hold' }} />
          <Stack.Screen name="Job" component={JobScreen} options={{ title: 'Job' }} />
          <Stack.Screen name="Verdict" component={VerdictScreen} options={{ title: '5 · Verdict' }} />
          <Stack.Screen name="Verify" component={VerifyScreen} options={{ title: 'Verify record' }} />
          <Stack.Screen name="Disputes" component={DisputesScreen} options={{ title: 'Disputes' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
