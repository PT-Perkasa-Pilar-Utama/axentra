import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

// Registrasi Happy DOM SEKALI untuk seluruh test run package apps/web.
// File ini dimuat lewat bunfig.toml [test] preload, SEBELUM file test manapun
// di-load. Jangan panggil register()/unregister() lagi di file test individual:
// Bun menjalankan semua file test dalam satu package sebagai satu proses, jadi
// register() ganda akan crash dengan
// "Attempting to change configurable attribute of unconfigurable property".
//
// Package ini (apps/web) sudah dijalankan sebagai proses Bun terpisah dari
// apps/api lewat root script `bun run --filter='*' test`, jadi tidak ada lagi
// risiko happy-dom bocor ke test backend — unregister() di akhir tidak diperlukan.
GlobalRegistrator.register();

globalThis.document = window.document;
global.document = window.document;

// RTL harus di-require SETELAH GlobalRegistrator.register() dipanggil, karena
// RTL membaca `document` saat di-load pertama kali.
const { cleanup } = require("@testing-library/react");

// Cleanup RTL SETELAH SETIAP test, didaftarkan secara global di sini karena
// file ini di-preload sebelum semua file test. Ini mencegah elemen yang
// di-render di satu file test "bocor" ke file test lain lewat `document`
// yang sekarang dipakai bersama untuk seluruh test run package ini.
// Tidak lagi bergantung pada tiap file mengingat memanggil cleanup() sendiri.
afterEach(() => {
  cleanup();
});
