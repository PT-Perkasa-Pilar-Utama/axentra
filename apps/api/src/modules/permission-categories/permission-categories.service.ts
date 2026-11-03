import type { PermissionCategory } from "@axentra/shared";
import { NotFoundError } from "../../http/errors";
import type {
  IPermissionCategoriesRepository,
  UpdateCategoryPermissionActor,
} from "./permission-categories.repository";

export type IPermissionCategoriesService = {
  listPermissionCategories: (limit?: number) => Promise<ReadonlyArray<PermissionCategory>>;
  updateCategoryDownloadPermission: (
    categoryId: string,
    downloadEnabled: boolean,
    actor?: UpdateCategoryPermissionActor,
  ) => Promise<PermissionCategory>;
};

export class PermissionCategoriesService implements IPermissionCategoriesService {
  public constructor(private readonly repository: IPermissionCategoriesRepository) {}

  public async listPermissionCategories(
    limit?: number,
  ): Promise<ReadonlyArray<PermissionCategory>> {
    return this.repository.listPermissionCategories(limit);
  }

  public async updateCategoryDownloadPermission(
    categoryId: string,
    downloadEnabled: boolean,
    actor?: UpdateCategoryPermissionActor,
  ): Promise<PermissionCategory> {
    const applyUpdate = async (
      repo: IPermissionCategoriesRepository,
    ): Promise<PermissionCategory> => {
      const updated = await repo.updateCategoryDownloadPermission(
        categoryId,
        downloadEnabled,
        actor,
      );
      if (!updated) {
        throw new NotFoundError("Kategori tidak ditemukan");
      }
      return updated;
    };

    if (this.repository.transaction) {
      return await this.repository.transaction(applyUpdate);
    }

    return await applyUpdate(this.repository);
  }
}

export function createPermissionCategoriesService(
  repository: IPermissionCategoriesRepository,
): PermissionCategoriesService {
  return new PermissionCategoriesService(repository);
}
