import { ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS, type AdminSummary } from "@axentra/shared";
import { InMemoryAdminRepository, type IAdminRepository } from "./admin.repository";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type AdminService = {
  getSummary: () => Promise<AdminSummary>;
};

export type AdminServiceOptions = {
  now?: (() => Date) | undefined;
};

export function createAdminService(
  repository: IAdminRepository = new InMemoryAdminRepository(),
  options?: AdminServiceOptions | undefined,
): AdminService {
  const now = options?.now ?? (() => new Date());

  return {
    async getSummary(): Promise<AdminSummary> {
      const uploadedSince = new Date(
        now().getTime() - ADMIN_SUMMARY_UPLOAD_WINDOW_DAYS * MILLISECONDS_PER_DAY,
      );
      return repository.getSummary(uploadedSince);
    },
  };
}
