import type { DocumentProcessingJob } from "@axentra/shared";

export type RetainedProcessingJob = {
  id?: string | undefined;
  getState: () => Promise<string>;
  remove: () => Promise<void>;
};

const runnableJobStates = new Set([
  "active",
  "delayed",
  "prioritized",
  "waiting",
  "waiting-children",
]);

export async function reconcileRetainedDocumentJob(
  payload: DocumentProcessingJob,
  findJob: (jobId: string) => Promise<RetainedProcessingJob | undefined>,
  enqueueJob: (payload: DocumentProcessingJob) => Promise<string>,
): Promise<string> {
  const existing = await findJob(payload.jobId);
  if (existing !== undefined) {
    const state = await existing.getState();
    if (runnableJobStates.has(state)) return existing.id ?? payload.jobId;
    if (state === "completed" || state === "failed") {
      await existing.remove();
    }
  }
  return enqueueJob(payload);
}
