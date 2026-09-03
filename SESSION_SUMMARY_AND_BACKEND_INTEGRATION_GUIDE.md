# 📑 Rangkuman Sesi Diskusi & Panduan Integrasi Backend

Dokumen ini merangkum seluruh analisis, perbaikan bug, penyesuaian data, dan integrasi backend **SAP S/4HANA (OData V2 & RAP OData V4)** yang dilakukan pada aplikasi **SD - Document Flow & Status Report (`reportdocumentflowapp`)**.

---

## 📌 Daftar Topik & Pembahasan Utama

1. [Perbaikan Multi-Paste Persistence (Event Race Condition)](#1-perbaikan-multi-paste-persistence-event-race-condition)
2. [Penyelarasan Data & Process Flow Dokumen `2110000181`](#2-penyelarasan-data--process-flow-dokumen-2110000181)
3. [Arsitektur Data: Mock Data vs Live Backend Dinamis](#3-arsitektur-data-mock-data-vs-live-backend-dinamis)
4. [Konfigurasi Autentikasi Live Proxy SAP](#4-konfigurasi-autentikasi-live-proxy-sap)
5. [Analisis & Perbaikan Error Backend ABAP RAP `ZSD_SD_DOCFLOW`](#5-analisis--perbaikan-error-backend-abap-rap-zsd_sd_docflow)
6. [Evaluasi UI/UX: Pop-up Dialog vs Standard `SOFM_ReuseLib`](#6-evaluasi-uiux-pop-up-dialog-vs-standard-sofm_reuselib)
7. [Perubahan Setelah Sesi Ini (Kondisi Kode Terkini)](#7-perubahan-setelah-sesi-ini-kondisi-kode-terkini)
8. [Known Issues / Technical Debt](#8-known-issues--technical-debt)


---

## 1. Perbaikan Multi-Paste Persistence (Event Race Condition)

### ⚠️ Masalah:
Ketika pengguna mem-paste 17 nomor dokumen sekaligus ke dalam field `MultiInput` (Sales Order Number), awalnya tabel menampilkan 17 data, namun sesaat kemudian tampilan berubah menjadi hanya 1 data terakhir (`2110000182`).

### 🔍 Akar Masalah (*Root Cause*):
Terjadi *event race condition* antara 3 event bawaan UI5 `MultiInput`:
1. Event **`paste`** memproses 17 token dan memanggil `onSearch()`.
2. Event **`change`** kemudian ter-trigger oleh UI5 dan memanggil ulang fungsi paste dengan string input parsial.
3. Event **`tokenUpdate`** (tipe "added") menambahkan token duplikat.
4. Fungsi `getVal("idSDDocNum")` sempat membaca dari `oCtrl.getValue()` yang berisi *raw string*, bukan dari *array tokens*.

### ✅ Solusi yang Diterapkan:
* **Guard Flag `_bProcessingPaste`**: Menambahkan *debounce flag* (500ms) di `Main.controller.js` untuk memblokir event `change` dan `tokenUpdate` re-entrant selama proses paste berlangsung.
* **Refactoring `getVal()`**: Memastikan `getVal("idSDDocNum")` hanya membaca dari `conditionModel>/tokens` atau `adaptFilterModel>/fieldValues/sdDocNum` dan tidak pernah membaca `MultiInput.getValue()`.
* **Pembersihan XML**: Menghapus atribut `submit="onSearch"` dari `MultiInput` di `Main.view.xml` guna menghindari *double search trigger*.
* **Pembersihan pada `onClear`**: Menambahkan reset `conditionModel` (tokens dan conditions) saat tombol *Clear* ditekan.

---

## 2. Penyelarasan Data & Process Flow Dokumen `2110000181`

### ⚠️ Masalah:
Pada dokumen **`2110000181`**, diagram *Process Flow* lokal (Gambar 1) menampilkan nomor dokumen dan tanggal acak yang berbeda dengan Standar SAP (Gambar 2).

### 🔍 Akar Masalah:
Nomor `2110000181` belum terdaftar di kamus relasi lokal (`MASTER_DOC_RELATIONS`), sehingga sistem mengaktifkan algoritma cadangan `_getDocRelationsFallback` yang meng-generate nomor dokumen simulasi.

> ℹ️ **Koreksi nama fungsi**: dokumen versi sebelumnya menyebut fungsi ini `_buildDynamicMockFlow`. Nama nyata di kode adalah **`_getDocRelationsFallback`** (`Main.controller.js` L4193).

### ✅ Penyesuaian yang Dilakukan:
Daftarkan data relasi alur dokumen asli ke `MASTER_DOC_RELATIONS` dan `MASTER_DOC_HEADERS`:
* **Quotation Part**: `1511000025` (Valid To `28.07.2026`) - *Fully Referenced*
* **Sales Part**: `2110000181` (Req. Delivery `21.07.2026`, Completely Invoiced) - *Completed*
* **Part Delivery**: `8110000103` (Shipped On `21.07.2026`) - *Shipped*
* **Invoice Part**: `9110000067` (Billed On `21.07.2026`, Net Value `15.000.000 IDR`) - *Completed*
* **Journal Entry**: `90000010` (Posted On `21.07.2026`) - *Not Cleared*

> ⚠️ **Status saat ini**: entri di `MASTER_DOC_RELATIONS` **masih aktif dipakai** oleh fallback Process Flow. Sebaliknya, entri di `MASTER_DOC_HEADERS` **sudah tidak berpengaruh** karena satu-satunya pemakainya (`_applyLocalFilter`) telah menjadi *dead code*. Lihat bagian 3.

---

## 3. Arsitektur Data: Mock Data vs Live Backend Dinamis

### 💡 Kondisi Nyata Saat Ini ("Live SAP First"):

| Komponen | Sumber Data | Status |
| :--- | :--- | :--- |
| Tabel header, KPI Tiles, Chart Issue | **Live OData V2** `C_SlsDocFlfllmntAnalyzer` (service `SD_SOFA`), `$top=5000` | ✅ Sepenuhnya live |
| Process Flow Diagram | **Live OData V4** `DocRelations` (service RAP `ZSD_SD_DOCFLOW`), dengan fallback lokal 600 ms | ⚠️ Live dengan fallback |
| `MASTER_DOC_RELATIONS` (L1522–2148) | 10 alur dokumen hardcoded | ⚠️ **Masih aktif** sebagai tahap pertama fallback Process Flow |
| `MASTER_DOC_HEADERS` (L19–1480, ±660 record) | Mock header offline | ❌ **Dead code** — hanya dipakai `_applyLocalFilter` yang tidak pernah dipanggil |
| `_applyLocalFilter` (L2991) | Filter client-side atas mock header | ❌ **Dead code** |
| Generator mock dinamis (L3103–3185) | — | ❌ Sudah di-*comment out* (`[DISABLED/COMMENTED] Dynamic Fake Mock Generator (Solusi 3)`) |

### ⚠️ Tidak Ada Lagi Fallback Offline untuk Daftar Header

Berbeda dari desain awal, saat OData V2 gagal (401 / VPN mati / gateway down) aplikasi **tidak** beralih ke mock. Yang terjadi:

1. `_parseODataError` mengekstrak pesan error (JSON / XML / `statusText`).
2. `MessageBox.error` ditampilkan dengan HTTP status code.
3. `/results` dikosongkan, `/tableTitle` menjadi `"... Documents (0 - Error)"`, seluruh `/kpiData` di-set `0`, dan `/issueData` dikosongkan.

Artinya: **aplikasi wajib terhubung ke SAP** untuk menampilkan data apa pun di tabel.


---

## 4. Konfigurasi Autentikasi Live Proxy SAP

Agar server lokal (`http://localhost:8080`) dapat mengakses data dari server SAP backend (`https://s2025pst.pst.co.id:44305/sap`) tanpa terhalang error *401 Unauthorized*, telah dikonfigurasi:

### File [`.env`](file:///.env) & [`ui5.yaml`](file:///ui5.yaml):
```yaml
specVersion: "4.0"
metadata:
  name: reportdocumentflowapp
type: application
server:
  customMiddleware:
    - name: ui5-middleware-simpleproxy
      mountPath: /sap
      afterMiddleware: compression
      configuration:
        baseUri: "https://s2025pst.pst.co.id:44305/sap"
        strictSSL: false
        username: "PST-HASNI"
        password: "<PASSWORD_SAP>"
```
*Hasil:* Pengujian koneksi berhasil (**HTTP 200 OK**) dan data tabel langsung ditarik dari database SAP.

### 🔴 Action Item Keamanan (BELUM DIKERJAKAN)

| Temuan | Detail |
| :--- | :--- |
| **Password plaintext** | Pada file `ui5.yaml` yang nyata, baris `password:` berisi **nilai asli** (bukan placeholder `<PASSWORD_SAP>` seperti pada kutipan di atas). Siapa pun yang menerima folder project ini ikut menerima kredensial SAP. |
| **`.env` tidak terpakai** | File `.env` ada di root project, tetapi `ui5.yaml` **tidak** membacanya. Middleware `ui5-middleware-simpleproxy` menerima nilai langsung dari YAML. |
| **`strictSSL: false`** | Validasi sertifikat TLS dimatikan; dapat diterima untuk dev lokal, tidak untuk lingkungan bersama. |

**Rekomendasi**: gunakan dukungan variabel lingkungan `ui5-middleware-simpleproxy` (mis. `username: env:SAP_USER`, `password: env:SAP_PASS`) atau berkas konfigurasi lokal yang di-*ignore* oleh version control, lalu rotasi password yang sudah tersebar.


---

## 5. Analisis & Perbaikan Error Backend ABAP RAP `ZSD_SD_DOCFLOW`

### ⚠️ Masalah Error di Backend:
Saat memanggil endpoint OData V4 `DocRelations`, server SAP mengembalikan pesan:
```json
{
  "code": "RAP_RUNTIME/004",
  "message": "Error occurred during execution of query provider 'ZCL_SD_DOCFLOW_QUERY'",
  "details": [
    {
      "code": "RAP_RUNTIME/014",
      "message": "Query not fully covered by implementation: Call to method if_rap_query_request~get_paging missing"
    }
  ]
}
```

### 🔍 Akar Masalah:
Di interface ABAP RAP `IF_RAP_QUERY_PROVIDER~SELECT`, framework OData V4 mewajibkan pemanggilan `io_request->get_paging( )` jika `is_data_requested( )` aktif, dan pengecekan `is_total_numb_of_rec_requested( )`.

### ✅ Perbaikan di [`document_flow_backend_design.md`](file:///document_flow_backend_design.md):
Method `select` pada class `ZCL_SD_DOCFLOW_QUERY` telah disempurnakan:
```abap
IF io_request->is_data_requested( ).
  DATA(lo_paging) = io_request->get_paging( ).
  IF lo_paging IS BOUND.
    lv_top  = lo_paging->get_page_size( ).
    lv_skip = lo_paging->get_offset( ).
  ENDIF.
ENDIF.

" ... Query data alur tabel VBFA ...

IF io_request->is_total_numb_of_rec_requested( ).
  io_response->set_total_number_of_records( lines( lt_result ) ).
ENDIF.

IF io_request->is_data_requested( ).
  io_response->set_data( lt_result ).
ENDIF.
```
*Hasil:* Setelah kode diaktifkan di SAP (Eclipse ADT), endpoint OData V4 `DocRelations` merespon dengan **HTTP 200 OK**.

---

## 6. Evaluasi UI/UX: Pop-up Dialog vs Standard `SOFM_ReuseLib`

| Kriteria | Menggunakan Standar `SOFM_ReuseLib` (Full Page) | Menggunakan Custom Pop-up Dialog (`ProcessFlow`) ⭐ |
| :--- | :--- | :--- |
| **Konteks Navigasi** | ❌ Pindah halaman penuh, tabel utama tertutup, harus klik *Back*. | ✅ **Zero Context Loss**: Pop-up muncul di atas tabel tanpa reload. |
| **Kecepatan Monitoring** | ⚠️ Lambat untuk mengecek banyak dokumen secara berurutan. | ✅ **Sangat Cepat & Efisien**: Cukup klik baris $\rightarrow$ cek $\rightarrow$ tutup. |
| **Interaktivitas Visual** | Standar Fiori Launchpad. | ✅ Didukung fitur lengkap: Zoom, Fit-View, Color Status Node. |
| **Fleksibilitas Desain** | Terikat template standar SAP. | ✅ Bebas disesuaikan dengan kebutuhan alur bisnis khusus. |

### 🎯 Kesimpulan:
Keputusan mempertahankan **Pop-up Dialog (`sap.suite.ui.commons.ProcessFlow`)** adalah keputusan yang **terbaik untuk kemudahan UI/UX laporan operasional**.

Implementasi nyata: [`webapp/view/fragment/ProcessFlowDialog.fragment.xml`](file:///webapp/view/fragment/ProcessFlowDialog.fragment.xml) — dialog `94vw` × `86vh`, *resizable* & *draggable*, dengan toolbar Zoom In / Zoom Out / Fit View / Reload dan tombol **Copy Flow Summary**. Menekan node membuka [`DocDetailsPopover.fragment.xml`](file:///webapp/view/fragment/DocDetailsPopover.fragment.xml).

---

## 7. Perubahan Setelah Sesi Ini (Kondisi Kode Terkini)

Fitur berikut sudah ada di kode namun belum terangkum pada bagian 1–6.

### 7.1 Strategi "Live SAP First"
* `onInit` (L2152) menginisialisasi `reportModel` dalam keadaan **kosong** dengan `tableBusy: true` / `chartBusy: true`, lalu memicu `onSearch()` setelah `setTimeout` 100 ms.
* Generator mock dinamis (L3103–3185) dinonaktifkan permanen dengan komentar `[DISABLED/COMMENTED] Dynamic Fake Mock Generator (Solusi 3)`.
* `MessageToast` sukses berbunyi `"Live SAP: Loaded <n> <tipe> records directly from SAP backend."` (L2671).
* Entity mentah OData disimpan per baris sebagai `rawRap` (L2606) untuk keperluan *debugging*.

### 7.2 Select-Options Value Help ala ABAP
* [`SalesDocValueHelpDialog.fragment.xml`](file:///webapp/view/fragment/SalesDocValueHelpDialog.fragment.xml) menyediakan baris kondisi dinamis (tambah/hapus baris, pilihan operator, nilai `value1`/`value2`).
* Model `conditionModel` menyimpan `{ conditions: [...], tokens: [...], activeConditions: [...] }`.
* Handler terkait: `onAddConditionRow`, `onRemoveConditionRow`, `onConditionOperatorChange`, `onConditionValueLiveChange`, `onRemoveAllConditions`, `onSDDocNumValueHelpOK`.
* `_syncPasteToTokensAndConditions` (L3473) memecah teks yang di-*paste* dengan pemisah `[\s,;\n\r\t]+` lalu membentuk kondisi `equal to` + token.
* Beberapa token `SalesDocument` dikirim ke OData sebagai **satu grup filter `OR`** berisi beberapa `EQ` (L2534–2539).

### 7.3 Adapt Filters Dialog
* [`AdaptFiltersDialog.fragment.xml`](file:///webapp/view/fragment/AdaptFiltersDialog.fragment.xml) mengatur visibility 9 field filter dengan pengelompokan `BASIC` / `ORG` / `PARTNER`, pencarian nama field, *select all*, dan *restore default*.
* Karena panel filter memakai `sap.ui.layout.cssgrid.CSSGrid` (`repeat(auto-fill, minmax(280px, 1fr))`), grid otomatis mengalir ulang saat field disembunyikan.

### 7.4 Table Personalization (P13n) & Tampilan Tabel
* [`TableSettingsDialog.fragment.xml`](file:///webapp/view/fragment/TableSettingsDialog.fragment.xml): visibility **13 kolom**, pilihan sort (`sortKey` + `sortDescending`), *grouping*, serta filter `Process Phase` / `Status`. Implementasi memakai `sap.ui.model.Sorter`.
* Kolom `sdDocNum` tidak bisa dinonaktifkan lewat *Deselect All* (L3885).
* Density switcher `cozy` / `compact` (`onTableDensityChange`, L5034).
* Tabel memakai `growingThreshold="100"` dan `mode="SingleSelectMaster"`.

### 7.5 Kolom & Pemetaan Status Tambahan
* Kolom baru **`Order Processing`** diisi oleh `_mapOrderProcessingStatus` (L2913) — sebelumnya tidak terdokumentasi.
* Kolom baru **`RAP Flow`** berisi tombol *View Flow* (`onOpenDocFlowPress`).
* `_mapOverallFulfilment` sekarang mengembalikan `statusState` (`Success` / `Warning` / `Error` / `Information`) untuk `ObjectStatus` kolom 12, dan `overallFulfilmentType: "chevron"` khusus kode `'2'`.

### 7.6 Export
* `onExportPress` (L5058) membuat CSV `SD_Document_Flow_Report.csv` berisi 11 kolom secara *client-side* (data-URI + `<a download>`).
* `MenuButton` di *header toolbar* menawarkan dua opsi (`*.xlsx` dan `*.csv`) tetapi **keduanya memanggil handler yang sama**, sehingga hasilnya selalu `.csv`.

### 7.7 Empat Entry Point Process Flow
`onDocLinkPress` (L4035), `onRowPress` (L4044), `onOpenDocFlowPress` (L4053), dan `onViewFlowSelectedPress` (L4062) semuanya memanggil `_openDocumentFlow` (L4079).

---

## 8. Known Issues / Technical Debt

Daftar temuan hasil audit silang dokumentasi vs kode. Semua masih **terbuka** (belum diperbaiki) dan menjadi rujukan tunggal bagi dokumen lain.

| # | Temuan | Lokasi | Dampak | Prioritas |
| :--: | :--- | :--- | :--- | :--: |
| 1 | **Kredensial SAP plaintext** — `username` & `password` tertulis langsung di YAML; `.env` ada tapi tidak dibaca | `ui5.yaml` L13–14 | Kredensial ikut tersebar bersama folder project | 🔴 Tertinggi |
| 2 | **i18n tidak berfungsi** — `manifest.json` mendeklarasikan `sap.app/i18n: "i18n/i18n.properties"` dan `ResourceModel` `myapp.i18n.i18n`, tetapi folder `webapp/i18n/` tidak ada | `webapp/manifest.json` L6, L57–62 | Model `i18n` gagal dimuat; seluruh label harus ditulis inline | 🔴 Tinggi |
| 3 | **`Log` dipakai tanpa di-import** — `sap/base/Log` tidak ada di `sap.ui.define` | `Main.controller.js` L4118 | `ReferenceError` bila render ProcessFlow gagal, menutupi error aslinya | 🔴 Tinggi |
| 4 | **`onLegendPress` didefinisikan dua kali** — L2971 (membuka `LegendPopover`) dan L5104 (toggle legenda VizFrame); definisi kedua menang | `Main.controller.js` L2971, L5104 | `LegendPopover.fragment.xml` menjadi *dead code*; tombol legend tabel tidak membuka popover | 🟠 Sedang |
| 5 | **Dead code besar** — `MASTER_DOC_HEADERS` (±660 record, ±1.410 baris) + `_applyLocalFilter` tidak terjangkau; ±41% isi controller | `Main.controller.js` L14–1517, L2991 | Ukuran bundel & beban pemeliharaan | 🟠 Sedang |
| 6 | **Navigation property dibaca tanpa `$expand`** — `o.to_OverallFulfillmentStatus.FulfillmentStatus_Text` | `Main.controller.js` L2751 | Teks status selalu memakai fallback bahasa Inggris hardcoded, bukan teks dari SAP | 🟠 Sedang |
| 7 | **Tidak ada debounce** — 7 filter input memakai `liveChange="onSearch"` | `Main.view.xml` L116, 122, 132, 137, 142, 147 | Setiap ketikan memicu satu read `$top=5000` ke SAP | 🔴 Tinggi |
| 8 | **Export "Excel" menghasilkan CSV** — kedua `MenuItem` memakai `onExportPress`; export juga mengabaikan visibility kolom dan sort/filter aktif | `Main.view.xml` L339–340; `Main.controller.js` L5058 | Ekspektasi pengguna tidak terpenuhi | 🟡 Rendah |
| 9 | **`"Already Payment"` tidak pernah tercapai** — logika KPI Payment mengeceknya, tetapi `_mapProcessPhase` tidak pernah mengembalikan nilai itu | `Main.controller.js` L2639, L2859–2911 | KPI Payment efektif hanya bergantung pada `Completely Processed` | 🟡 Rendah |
| 10 | **Referensi kontrol yang di-comment** — `byId("idBtnViewFlow")` sedangkan tombolnya di-comment di view | `Main.controller.js` L4022; `Main.view.xml` L308–315 | Blok kode tidak berefek | 🟡 Rendah |
| 11 | **Value help Sold-to Party tidak berbasis entity** — di-bind ke `reportModel>/results` | `SoldToPartyValueHelpDialog.fragment.xml` | Hanya menawarkan pelanggan yang sudah ada di hasil pencarian, bukan master data | 🟠 Sedang |
| 12 | **Pesan error campur bahasa** — handler error OData berbahasa Indonesia, sisa UI berbahasa Inggris | `Main.controller.js` L2710–2716, L2725, L2733 | Inkonsistensi UX; terkait erat dengan temuan #2 | 🟡 Rendah |
| 13 | **Filter "Sales Employee" memfilter `CreatedByUser`** — bukan partner fungsi Sales Employee | `Main.controller.js` L2552 | Hasil filter bisa menyesatkan pengguna bisnis | 🟠 Sedang |
| 14 | **Dropdown SD Document Type hanya berisi `C`** — 5 cabang `_getDocTypeLabel` / `onSDDocTypeChange` tidak dapat dijangkau dari UI | `Main.view.xml` L84; `Main.controller.js` L2355–2397 | 4 dari 6 KPI tile dan 2 bucket issue selalu `0` | 🟠 Sedang |
| 15 | **Status `'5'` (Due Next Issue) tidak muncul di legend maupun chart** — mapper memproduksinya, tetapi `LegendPopover` hanya berisi 4 status dan tidak ada bucket issue untuknya | `LegendPopover.fragment.xml`; `Main.controller.js` L2643–2658 | Dokumen peringatan dini tidak terlihat | 🟡 Rendah |
| 16 | **Ikon status `1` tidak konsisten** — mapper memakai `sap-icon://future`, legend memakai `sap-icon://history` | `Main.controller.js` L2757; `LegendPopover.fragment.xml` L39 | Legend tidak cocok dengan ikon di tabel | 🟡 Rendah |
| 17 | **Deklarasi `var that = this;` ganda** dalam satu scope `onInit` | `Main.controller.js` L2224, L2348 | Kebersihan kode | 🟡 Rendah |
| 18 | **Fallback Process Flow bisa memfabrikasi data** — di luar 10 dokumen di `MASTER_DOC_RELATIONS`, nomor dokumen dibentuk dari hash anchor | `Main.controller.js` L4193–4745 | Diagram bisa menampilkan nomor yang tidak ada di SAP tanpa penanda visual | 🔴 Tinggi |

---

*File dibuat secara otomatis sebagai dokumentasi proyek `reportdocumentflowapp`.*

