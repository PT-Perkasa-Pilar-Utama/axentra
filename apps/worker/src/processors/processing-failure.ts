// Stored in documents.error_message, which the document detail API returns to every role that can
// open the document. Each value is a fixed sentence: driver errors carry the SQL text and its
// parameters (extracted text, author, object keys), so no error text is ever written to the column.
// Technical detail goes to the job logger through summarizeError instead.
export const PROCESSING_FAILURE_MESSAGE = "Pemrosesan dokumen gagal. Silakan unggah ulang dokumen.";

// Stored when recovery has re-enqueued a stranded document the maximum number of times without it completing.
export const PROCESSING_RECOVERY_EXHAUSTED_MESSAGE =
  "Pemrosesan dokumen gagal setelah beberapa kali pemulihan otomatis. Silakan unggah ulang dokumen.";

// Thrown to the queue in place of the driver or storage error, so BullMQ's failedReason and the
// Redis job record hold the same fixed copy as the document row.
export class DocumentProcessingFailedError extends Error {
  public constructor() {
    super(PROCESSING_FAILURE_MESSAGE);
    this.name = "DocumentProcessingFailedError";
  }
}
