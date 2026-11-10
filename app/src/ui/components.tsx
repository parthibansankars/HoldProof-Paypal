import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Notice } from '../config';
import type { GuardCheck, JobStatus, LogEntry } from '../types';
import { colors, radius, shadow, space, type } from './theme';

export function Screen({ children, scroll = true, footer }: { children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: ViewStyle; tone?: 'amber' | 'green' | 'coral' | 'blue' | 'violet' }) {
  const toneStyle = tone ? { backgroundColor: colors[`${tone}Soft` as const], borderColor: 'transparent' } : null;
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const v = buttonVariants[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.button, v.container, inactive && styles.buttonDisabled, pressed && !inactive && { opacity: 0.85 }]}
    >
      {loading ? <ActivityIndicator color={v.text.color} /> : <Text style={[styles.buttonText, v.text]}>{title}</Text>}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { container: ViewStyle; text: { color: string } }> = {
  primary: { container: { backgroundColor: colors.ink }, text: { color: colors.white } },
  secondary: { container: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }, text: { color: colors.ink } },
  danger: { container: { backgroundColor: colors.coralSoft }, text: { color: colors.coral } },
  ghost: { container: { backgroundColor: 'transparent' }, text: { color: colors.blue } },
};

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={[type.label, { marginBottom: space.xs }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.mist}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, props.style]}
      />
      {hint ? <Text style={[type.small, { marginTop: space.xs }]}>{hint}</Text> : null}
    </View>
  );
}

const STATUS_META: Record<JobStatus, { label: string; bg: string; fg: string }> = {
  DRAFT: { label: 'Draft', bg: colors.line, fg: colors.inkSoft },
  READY: { label: 'Ready to hold', bg: colors.blueSoft, fg: colors.blue },
  AWAITING_APPROVAL: { label: 'Awaiting client', bg: colors.blueSoft, fg: colors.blue },
  HELD: { label: 'Held', bg: colors.amberSoft, fg: '#9A6514' },
  CAPTURED: { label: 'Released', bg: colors.greenSoft, fg: colors.green },
  VOIDED: { label: 'Hold voided', bg: colors.line, fg: colors.slate },
  CANCELLED: { label: 'Cancelled', bg: colors.line, fg: colors.slate },
};

export function StatusPill({ status }: { status: JobStatus }) {
  const m = STATUS_META[status];
  return (
    <View style={[styles.pill, { backgroundColor: m.bg }]} accessibilityLabel={`Status ${m.label}`}>
      <Text style={[styles.pillText, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}

export function SandboxBadge() {
  return (
    <View style={[styles.pill, { backgroundColor: colors.violetSoft, alignSelf: 'flex-start' }]}>
      <Text style={[styles.pillText, { color: colors.violet }]}>PayPal Sandbox · Hackathon demo</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={type.label}>{children}</Text>
      {right}
    </View>
  );
}

export function CheckRow({ check }: { check: GuardCheck }) {
  return (
    <View style={styles.checkRow} accessibilityLabel={`${check.label}: ${check.ok ? 'passed' : 'failed'}. ${check.detail}`}>
      <View style={[styles.checkDot, { backgroundColor: check.ok ? colors.green : colors.coral }]}>
        <Text style={styles.checkMark}>{check.ok ? '✓' : '✕'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '600', color: colors.ink }]}>{check.label}</Text>
        <Text style={type.small}>{check.detail}</Text>
      </View>
    </View>
  );
}

const LOG_COLORS: Record<LogEntry['kind'], string> = {
  paypal: colors.blue,
  ai: colors.violet,
  judge: colors.amber,
  user: colors.slate,
  error: colors.coral,
};
const LOG_LABEL: Record<LogEntry['kind'], string> = { paypal: 'PayPal', ai: 'AI', judge: 'Judge', user: 'You', error: 'Error' };

export function Timeline({ entries }: { entries: LogEntry[] }) {
  if (!entries.length) return <Text style={type.small}>No activity yet.</Text>;
  return (
    <View>
      {[...entries].reverse().map((e, i) => (
        <View key={`${e.at}-${i}`} style={styles.tlRow}>
          <View style={[styles.tlDot, { backgroundColor: LOG_COLORS[e.kind] }]} />
          <View style={{ flex: 1 }}>
            <Text style={[type.small, { color: LOG_COLORS[e.kind], fontWeight: '700' }]}>
              {LOG_LABEL[e.kind]} · {new Date(e.at).toLocaleTimeString()}
            </Text>
            <Text style={type.body}>{e.message}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <Card tone="coral" style={{ marginBottom: space.lg }}>
      <Text style={[type.body, { color: colors.coral, fontWeight: '600' }]} accessibilityRole="alert">{message}</Text>
      {onDismiss ? <Button title="Dismiss" variant="ghost" onPress={onDismiss} /> : null}
    </Card>
  );
}

export function KeyValue({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={type.small}>{k}</Text>
      <Text style={[mono ? type.mono : type.body, { color: colors.ink, flexShrink: 1, textAlign: 'right' }]} selectable>{v}</Text>
    </View>
  );
}

/** Renders the structured setup notice (src/config.ts SETUP_NOTICE). Used by the setup popup and Settings. */
export function NoticeContent({ notice }: { notice: Notice }) {
  return (
    <View>
      <Text style={[type.body, { color: colors.ink, fontWeight: '600', marginBottom: space.md }]} accessibilityRole="alert">
        {notice.lead}
      </Text>
      {notice.sections.map((s) => (
        <View key={s.heading} style={{ marginBottom: space.md }}>
          <Text style={[type.heading, { marginBottom: space.xs }]} accessibilityRole="header">{s.heading}</Text>
          {s.lines.map((line, i) => (
            <Text key={i} style={[type.small, { marginBottom: space.xs }]}>
              {s.lines.length > 1 ? `• ${line}` : line}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: space.lg, paddingBottom: space.xxl },
  footer: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper, gap: space.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, borderWidth: 1, borderColor: colors.line, ...shadow },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, fontSize: 16, color: colors.ink },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontSize: 12, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm, marginTop: space.sm },
  checkRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, alignItems: 'flex-start' },
  checkDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkMark: { color: colors.white, fontSize: 12, fontWeight: '800' },
  tlRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  tlDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 6 },
});
