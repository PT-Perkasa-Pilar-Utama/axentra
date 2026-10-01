export type SearchResultItem = {
  id: string;
  filename: string;
  snippet: string;
};

export async function searchDocuments(keyword: string): Promise<SearchResultItem[]> {
  // Ambil token dari session (disesuaikan dengan arsitektur auth Axentra)
  const sessionStr =
    sessionStorage.getItem("ax_auth_session") || sessionStorage.getItem("auth-storage");
  let token = "";
  if (sessionStr) {
    try {
      token = JSON.parse(sessionStr).state?.session?.token || JSON.parse(sessionStr).token || "";
    } catch {
      // Abaikan jika gagal parse
    }
  }

  // Gunakan base URL environment jika ada, fallback ke /api/v1
  const baseUrl =
    import.meta.env && import.meta.env.VITE_API_BASE_URL
      ? import.meta.env.VITE_API_BASE_URL
      : "/api/v1";
  const url = `${baseUrl}/search/documents?keyword=${encodeURIComponent(keyword)}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error?.message || "Gagal memuat hasil pencarian");
  }

  return data.data;
}
