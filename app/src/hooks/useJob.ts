import { useCallback, useEffect, useState } from 'react';
import { getJob, listJobs, subscribe } from '../storage/jobs';
import type { Job } from '../types';

export function useJob(id: string): Job | null | undefined {
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const load = useCallback(() => {
    getJob(id).then(setJob).catch(() => setJob(null));
  }, [id]);
  useEffect(() => {
    load();
    return subscribe(load);
  }, [load]);
  return job;
}

export function useJobs(): Job[] | undefined {
  const [jobs, setJobs] = useState<Job[] | undefined>(undefined);
  const load = useCallback(() => {
    listJobs().then(setJobs).catch(() => setJobs([]));
  }, []);
  useEffect(() => {
    load();
    return subscribe(load);
  }, [load]);
  return jobs;
}
