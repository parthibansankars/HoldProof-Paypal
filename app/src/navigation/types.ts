export type RootStackParamList = {
  Credentials: { editing?: boolean } | undefined;
  Home: undefined;
  NewJob: undefined;
  Camera: { jobId: string; mode: 'before' | 'after' };
  Hold: { jobId: string };
  Job: { jobId: string };
  Verdict: { jobId: string; attemptId: string };
  Verify: { jobId: string };
  Disputes: { jobId: string };
  Settings: undefined;
};
