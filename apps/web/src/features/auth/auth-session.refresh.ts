import type { LoginResponse } from "@axentra/shared";
import type { RefreshResult } from "./auth-session.helpers";
import { runWithRefreshLock } from "./refresh-lock";
import { getAuthToken, getSessionGeneration } from "./session.storage";

export type RefreshInFlight = { generation: number; promise: Promise<RefreshResult> };

/**
 * Satu siklus refresh di dalam lock lintas tab. Token dan generasi dibaca ulang setelah lock didapat:
 * bila sesi berganti selama menunggu, refresh tidak diperlukan lagi dan cookie yang sudah dirotasi
 * tab lain tidak boleh dipakai ulang.
 */
async function refreshWithinLock(
  generation: number,
  token: string | null,
  refreshApi: () => Promise<LoginResponse>,
): Promise<RefreshResult> {
  return runWithRefreshLock(async (): Promise<RefreshResult> => {
    if (getSessionGeneration() !== generation || getAuthToken() !== token) {
      return { skipped: true };
    }
    return { skipped: false, response: await refreshApi() };
  });
}

// release dipanggil setelah siklus selesai, baik berhasil maupun gagal, agar refresh berikutnya
// tidak membagi hasil yang sudah usang.
export async function runSharedRefresh(
  generation: number,
  token: string | null,
  refreshApi: () => Promise<LoginResponse>,
  release: () => void,
): Promise<RefreshResult> {
  try {
    return await refreshWithinLock(generation, token, refreshApi);
  } finally {
    release();
  }
}
