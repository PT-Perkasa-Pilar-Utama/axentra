import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import {
  documentProcessJobName,
  documentProcessingJobName,
  documentProcessingJobSchema,
  systemHealthCheckJobName,
  systemHealthCheckJobSchema,
  type DocumentProcessJob,
  type DocumentProcessingJob,
  type SystemHealthCheckJob,
} from "@axentra/shared";
import { queueCommandConnectionOptions, redisConnectionOptions } from "./connection";
import { reconcileRetainedDocumentJob } from "./reconciliation";

export type QueueProducer = {
  enqueueSystemHealthCheck: (payload: SystemHealthCheckJob) => Promise<string>;
  enqueueDocumentProcessing: (payload: DocumentProcessingJob) => Promise<string>;
  enqueueDocumentProcess?: ((payload: DocumentProcessJob) => Promise<string>) | undefined;
  reconcileDocumentProcessing: (payload: DocumentProcessingJob) => Promise<string>;
  close: () => Promise<void>;
};

export function createQueueProducer(
  queueName: string,
  redisUrl: string,
  commandTimeoutMs = 1500,
): QueueProducer {
  const queue = new Queue(queueName, {
    connection: queueCommandConnectionOptions(redisUrl, commandTimeoutMs),
  });
  return {
    async enqueueSystemHealthCheck(payload: SystemHealthCheckJob): Promise<string> {
      const validated = systemHealthCheckJobSchema.parse(payload);
      const job = await withCommandDeadline(
        queue.add(systemHealthCheckJobName, validated, {
          jobId: validated.jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        }),
        commandTimeoutMs,
      );
      if (job.id === undefined) throw new Error("Queue did not return a job identifier");
      return job.id;
    },

    async enqueueDocumentProcessing(payload: DocumentProcessingJob): Promise<string> {
      const validated = documentProcessingJobSchema.parse(payload);
      const job = await withCommandDeadline(
        queue.add(documentProcessingJobName, validated, {
          jobId: validated.jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        }),
        commandTimeoutMs,
      );
      if (job.id === undefined) throw new Error("Queue did not return a job identifier");
      return job.id;
    },

    async enqueueDocumentProcess(payload: DocumentProcessJob): Promise<string> {
      return this.enqueueDocumentProcessing(payload);
    },

    async reconcileDocumentProcessing(payload: DocumentProcessingJob): Promise<string> {
      const validated = documentProcessingJobSchema.parse(payload);
      return reconcileRetainedDocumentJob(
        validated,
        (jobId) => withCommandDeadline(queue.getJob(jobId), commandTimeoutMs),
        (next) => this.enqueueDocumentProcessing(next),
      );
    },

    async close(): Promise<void> {
      await queue.close();
    },
  };
}

async function withCommandDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  void observeQueueCommand(operation);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Queue command timed out")), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function observeQueueCommand(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch {
    // The deadline owns the caller-facing failure. A late rejection stays contained.
  }
}

export type SystemHealthJobHandler = (payload: SystemHealthCheckJob) => Promise<void>;
export type DocumentProcessingJobHandler = (payload: DocumentProcessingJob) => Promise<void>;
export type DocumentProcessJobHandler = DocumentProcessingJobHandler;

export type QueueJobHandlers = {
  handleSystemHealthCheck?: SystemHealthJobHandler | undefined;
  handleDocumentProcessing?: DocumentProcessingJobHandler | undefined;
  handleDocumentProcess?: DocumentProcessJobHandler | undefined;
};

export type QueueWorkerHandlers = QueueJobHandlers;

export function createQueueWorker(
  queueName: string,
  redisUrl: string,
  concurrency: number,
  handlers: QueueJobHandlers,
): Worker {
  return new Worker(
    queueName,
    async (job: Job): Promise<void> => {
      if (job.name === systemHealthCheckJobName && handlers.handleSystemHealthCheck) {
        await handlers.handleSystemHealthCheck(systemHealthCheckJobSchema.parse(job.data));
        return;
      }
      const documentHandler = handlers.handleDocumentProcessing ?? handlers.handleDocumentProcess;
      if (
        (job.name === documentProcessingJobName || job.name === documentProcessJobName) &&
        documentHandler
      ) {
        await documentHandler(documentProcessingJobSchema.parse(job.data));
        return;
      }
      throw new Error(`Unsupported job type: ${job.name}`);
    },
    {
      connection: redisConnectionOptions(redisUrl),
      concurrency,
    },
  );
}

export function createSystemHealthWorker(
  queueName: string,
  redisUrl: string,
  concurrency: number,
  handler: SystemHealthJobHandler,
): Worker {
  return createQueueWorker(queueName, redisUrl, concurrency, {
    handleSystemHealthCheck: handler,
  });
}
