/** On-device job store (expo-sqlite key-value store). PayPal remains the source of truth for money state. */
import Storage from 'expo-sqlite/kv-store';
import type { Job, LogEntry, LogKind } from '../types';

const INDEX_KEY = 'hp.jobs.index';
const jobKey = (id: string) => `hp.job.${id}`;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((l) => l());
}

async function readIndex(): Promise<string[]> {
  const raw = await Storage.getItemAsync(INDEX_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function listJobs(): Promise<Job[]> {
  const ids = await readIndex();
  const jobs = await Promise.all(ids.map((id) => getJob(id)));
  return jobs.filter((j): j is Job => j !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJob(id: string): Promise<Job | null> {
  const raw = await Storage.getItemAsync(jobKey(id));
  return raw ? (JSON.parse(raw) as Job) : null;
}

export async function saveJob(job: Job): Promise<Job> {
  await Storage.setItemAsync(jobKey(job.id), JSON.stringify(job));
  const ids = await readIndex();
  if (!ids.includes(job.id)) {
    ids.push(job.id);
    await Storage.setItemAsync(INDEX_KEY, JSON.stringify(ids));
  }
  emit();
  return job;
}

export async function updateJob(id: string, patch: (job: Job) => Job): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  return saveJob(patch(job));
}

export async function deleteJob(id: string): Promise<void> {
  await Storage.removeItemAsync(jobKey(id));
  const ids = (await readIndex()).filter((x) => x !== id);
  await Storage.setItemAsync(INDEX_KEY, JSON.stringify(ids));
  emit();
}

export function withLog(job: Job, kind: LogKind, message: string): Job {
  const entry: LogEntry = { at: new Date().toISOString(), kind, message };
  return { ...job, log: [...job.log, entry] };
}

export async function appendLog(id: string, kind: LogKind, message: string): Promise<Job> {
  return updateJob(id, (j) => withLog(j, kind, message));
}
