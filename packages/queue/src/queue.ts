import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import {
  documentProcessingJobName,
  documentProcessingJobSchema,
  systemHealthCheckJobName,
  systemHealthCheckJobSchema,
  type DocumentProcessingJob,
  type SystemHealthCheckJob,
} from "@axentra/shared";
import { redisConnectionOptions } from "./connection";

export type QueueProducer = {
  enqueueSystemHealthCheck: (payload: SystemHealthCheckJob) => Promise<string>;
  enqueueDocumentProcessing: (payload: DocumentProcessingJob) => Promise<string>;
  close: () => Promise<void>;
};

export function createQueueProducer(queueName: string, redisUrl: string): QueueProducer {
  const queue = new Queue(queueName, { connection: redisConnectionOptions(redisUrl) });
  return {
    async enqueueSystemHealthCheck(payload: SystemHealthCheckJob): Promise<string> {
      const validated = systemHealthCheckJobSchema.parse(payload);
      const job = await queue.add(systemHealthCheckJobName, validated, {
        jobId: validated.jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      if (job.id === undefined) throw new Error("Queue did not return a job identifier");
      return job.id;
    },

    async enqueueDocumentProcessing(payload: DocumentProcessingJob): Promise<string> {
      const validated = documentProcessingJobSchema.parse(payload);
      const job = await queue.add(documentProcessingJobName, validated, {
        jobId: validated.jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      if (job.id === undefined) throw new Error("Queue did not return a job identifier");
      return job.id;
    },

    async close(): Promise<void> {
      await queue.close();
    },
  };
}

export type SystemHealthJobHandler = (payload: SystemHealthCheckJob) => Promise<void>;
export type DocumentProcessingJobHandler = (payload: DocumentProcessingJob) => Promise<void>;

export type QueueJobHandlers = {
  handleSystemHealthCheck?: SystemHealthJobHandler | undefined;
  handleDocumentProcessing?: DocumentProcessingJobHandler | undefined;
};

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
      if (job.name === documentProcessingJobName && handlers.handleDocumentProcessing) {
        await handlers.handleDocumentProcessing(documentProcessingJobSchema.parse(job.data));
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
