import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import {
  systemHealthCheckJobName,
  systemHealthCheckJobSchema,
  type SystemHealthCheckJob,
} from "@axentra/shared";
import { redisConnectionOptions } from "./connection";

export type QueueProducer = {
  enqueueSystemHealthCheck: (payload: SystemHealthCheckJob) => Promise<string>;
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
    async close(): Promise<void> {
      await queue.close();
    },
  };
}

export type SystemHealthJobHandler = (payload: SystemHealthCheckJob) => Promise<void>;

export function createSystemHealthWorker(
  queueName: string,
  redisUrl: string,
  concurrency: number,
  handler: SystemHealthJobHandler,
): Worker {
  return new Worker(
    queueName,
    async (job: Job): Promise<void> => {
      if (job.name !== systemHealthCheckJobName) {
        throw new Error(`Unsupported job type: ${job.name}`);
      }
      await handler(systemHealthCheckJobSchema.parse(job.data));
    },
    {
      connection: redisConnectionOptions(redisUrl),
      concurrency,
    },
  );
}
