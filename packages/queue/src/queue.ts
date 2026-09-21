import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import {
  documentProcessJobName,
  documentProcessJobSchema,
  systemHealthCheckJobName,
  systemHealthCheckJobSchema,
  type DocumentProcessJob,
  type SystemHealthCheckJob,
} from "@axentra/shared";
import { redisConnectionOptions } from "./connection";

export type QueueProducer = {
  enqueueSystemHealthCheck: (payload: SystemHealthCheckJob) => Promise<string>;
  enqueueDocumentProcess: (payload: DocumentProcessJob) => Promise<string>;
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
    async enqueueDocumentProcess(payload: DocumentProcessJob): Promise<string> {
      const validated = documentProcessJobSchema.parse(payload);
      const job = await queue.add(documentProcessJobName, validated, {
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
export type DocumentProcessJobHandler = (payload: DocumentProcessJob) => Promise<void>;

export type QueueWorkerHandlers = {
  handleSystemHealthCheck?: SystemHealthJobHandler;
  handleDocumentProcess?: DocumentProcessJobHandler;
};

export function createQueueWorker(
  queueName: string,
  redisUrl: string,
  concurrency: number,
  handlers: QueueWorkerHandlers,
): Worker {
  return new Worker(
    queueName,
    async (job: Job): Promise<void> => {
      if (job.name === systemHealthCheckJobName) {
        if (!handlers.handleSystemHealthCheck) {
          throw new Error(`No handler registered for job type: ${job.name}`);
        }
        await handlers.handleSystemHealthCheck(systemHealthCheckJobSchema.parse(job.data));
        return;
      }
      if (job.name === documentProcessJobName) {
        if (!handlers.handleDocumentProcess) {
          throw new Error(`No handler registered for job type: ${job.name}`);
        }
        await handlers.handleDocumentProcess(documentProcessJobSchema.parse(job.data));
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
