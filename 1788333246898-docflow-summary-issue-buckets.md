# Plan: Perbaikan Chart "Total" & "Total Issues" agar Sesuai 10 Kriteria Doc Flow Summary

## 1. Temuan Analisis (kondisi saat ini)

### 1.1 Chart Issue sekarang vs 10 kriteria

Sumber tunggal chart & tile: `read("/C_SlsDocFlfllmntAnalyzer")` di `webapp/controller/Main.controller.js:701`, dihitung client-side di `webapp/controller/Main.controller.js:750-800`.

| # | Kriteria yang diminta | Status | Bukti |
| :-: | :--- | :--- | :--- |
| 1 | Open Inquiry document (belum fully referenced) | Ada bucket, logika salah: `documentCategory === "A" && overallFulfilmentText !== "Completely Processed"`, bukan status referensi | `Main.controller.js:788-790` |
| 2 | Rejected Inquiry | **Tidak ada** | — |
| 3 | Open Quotation document | **Tidak ada bucket sama sekali** | `Main.controller.js:758-765` |
| 4 | Rejected Quotation | **Tidak ada** | — |
| 5 | Open Sales Order | Ada, tapi memakai teks fulfilment; dokumen rejected juga ikut terhitung open (dobel hitung) | `Main.controller.js:785-787` |
| 6 | Rejected Sales Order | **Tidak ada**, dan field rejection tidak pernah terbaca (lihat 1.3) | `Main.controller.js:739` |
| 7 | Unpicked Delivery | **Tidak ada** | — |
| 8 | Ready to Goods Issue | Nama ada, logika tidak berhubungan: `overallFulfilmentText === "Partially Processed"` | `Main.controller.js:780-781` |
| 9 | No Journal Entry Created | **Tidak ada** | — |
| 10 | Not Yet Payment | Nama ada, logika tidak berhubungan: `overallFulfilmentText === "Not Yet Processed"` | `Main.controller.js:782-783` |
| — | Bucket ekstra `Open Delivery Document` | Di luar kriteria, dan selalu 0 | `Main.controller.js:791-793` |
| — | Bucket ekstra `Pending Approval` | Di luar kriteria | `Main.controller.js:778-779` |

Kesimpulan: **2 dari 10 kriteria terpenuhi secara konsep, 0 terpenuhi secara logika.**

### 1.2 Penyebab utama: entity sumber tidak punya datanya

Daftar lengkap property `C_SlsDocFlfllmntAnalyzerType` (`reference_sdtracker/localService/metadata.xml:35`) hanya berisi field header **dokumen penjualan** (VBAK). Tidak ada:

- status picking (`KOSTK`) dan goods movement (`WBSTK`) → kriteria 7 & 8 mustahil
- entitas/nomor billing document dan `RFBSK` → kriteria 9 mustahil
- accounting document / clearing (`AUGBL`) → kriteria 10 mustahil
- status billing apa pun (`OverallBillingStatus` / `OverallOrdReltdBillgStatus` yang dibaca `_mapOverallFulfilment` **tidak ada** di payload)

Tambahan pembatas: query selalu menambah `SDDocumentCategory EQ <1 nilai>` (`Main.controller.js:659`) dan dropdown hanya menyediakan `C` (`webapp/view/Main.view.xml:84`), sehingga semua bucket non-`C` dan 5 dari 6 tile Total **selalu 0**.

`ZCL_SD_DOCFLOW_QUERY` sudah membaca VBAK/VBAP/LIKP/VBRK/BKPF/BSEG/VBFA, tetapi hanya per-anchor (`AnchorSalesDocument` wajib, `abap/ZCL_SD_DOCFLOW_QUERY.clas.abap:420-428`), tanpa kemampuan agregasi (`:435-440`), jadi tidak bisa dipakai untuk summary.

### 1.3 Bug field-name yang ikut ditemukan (bukan chart, tapi nyata)

| Lokasi | Kode | Field sebenarnya | Akibat |
| :--- | :--- | :--- | :--- |
| `Main.controller.js:734-735` | `o.NetAmount` | `TotalNetAmount` | kolom Net Value selalu `-`, `netValueNum` selalu 0 |
| `Main.controller.js:739` | `o.OverallSDRejectionStatus \|\| o.OverallSDDocumentRejectionStatus` | `OverallSDDocumentRejectionSts` | `rejectionStatus` selalu `""` |
| `Main.controller.js:727` | `o.SoldToPartyName` | `SoldToPartyFullName` | tampil kode customer, bukan nama |

## 2. Keputusan Desain (sudah disetujui)

1. **Perhitungan dipindah ke backend**: custom entity RAP baru + class query baru, diekspos di service `ZSD_SD_DOCFLOW` yang sudah ada. Satu panggilan mengembalikan 6 Total + 10 Issue.
2. **SD Document Type tetap terkunci `Sales Order`** (mengikuti standar Track Sales Orders). Filter ini **tidak** diteruskan ke query summary.
3. **Bucket 1-6 dihitung per kategori langsung dari VBAK** memakai selection criteria yang sama; **bucket 7-10 dihitung dari follow-on document** sales order terpilih via VBFA (order → delivery → billing → FI).
4. **Definisi Open/Rejected**: Inquiry/Quotation `RFSTK <> 'C'`; Sales Order `GBSTK <> 'C'`; semua bucket Open **mengecualikan** `ABSTK = 'C'`; bucket Rejected = `ABSTK = 'C'`; `ABSTK = 'B'` masuk Open.
5. **Delivery**: cakupan `WBSTK <> 'C'`. Unpicked = `KOSTK <> 'C'`. Ready to GI = `KOSTK = 'C'` AND `LIFSK` kosong AND `UVALL = 'C'`. Saling eksklusif.
6. **Billing/FI**: No Journal Entry = VBRK (`VBTYP` in `M`/`O`/`P`, `FKSTO <> 'X'`, `RFBSK <> 'D'`) tanpa record BKPF (`AWTYP='VBRK'`, `AWKEY=VBELN`). Not Yet Payment = BKPF (`STBLG` kosong) yang punya minimal satu baris BSEG `KOART='D'` dengan `AUGBL` kosong; dihitung per dokumen FI.
7. **6 tile Total**: Inquiry/Quotation/Sales Order = jumlah dokumen VBAK per `VBTYP` A/B/C; Delivery = jumlah delivery follow-on; Billing = jumlah billing doc follow-on; Payment = jumlah accounting doc yang **semua** baris pelanggannya sudah ter-clearing.
8. **Filter nomor dokumen** (select-options) diterapkan ke `VBAK-VBELN` untuk ketiga kategori A/B/C.
9. Bucket ekstra `Open Delivery Document` dan `Pending Approval` **dihapus** dari chart (tidak ada di kriteria).

## 3. Task List

### Fase A — Backend ABAP (wajib, blocking)

**A1. Buat CDS custom entity `abap/ZR_SD_DocFlowSummary.ddls.abap`**

Satu baris per bucket agar langsung cocok dengan `FlattenedDataset` VizFrame:

```abap
@EndUserText.label: 'SD Doc Flow Summary (Totals & Issues)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_SD_DOCFLOW_SUMMARY'
define root custom entity ZR_SD_DocFlowSummary
{
  key SummaryType        : abap.char( 10 );   // 'TOTAL' | 'ISSUE'
  key BucketKey          : abap.char( 30 );   // OPEN_INQUIRY, REJECTED_INQUIRY, ...
      BucketText         : abap.char( 60 );   // label yang dirender chart/tile
      Counter            : abap.int4;
      SortOrder          : abap.int4;
      IsTruncated        : abap.char( 1 );    // 'X' jika cakupan dokumen dipotong

      // --- filter-only fields (tidak diisi di hasil) ---
      SalesOrganization  : vkorg;
      DistributionChannel: vtweg;
      OrganizationDivision: spart;
      SoldToParty        : kunnr;
      PurchaseOrderByCustomer : bstkd;
      SalesDocumentDate  : abap.dats;
      CreatedByUser      : ernam;
      SalesDocument      : vbeln;
}
```

`BucketKey` yang harus dihasilkan, `SortOrder` mengikuti urutan kriteria:

| SortOrder | SummaryType | BucketKey | BucketText |
| :-: | :--- | :--- | :--- |
| 10 | ISSUE | `OPEN_INQUIRY` | Open Inquiry Document |
| 20 | ISSUE | `REJECTED_INQUIRY` | Rejected Inquiry |
| 30 | ISSUE | `OPEN_QUOTATION` | Open Quotation Document |
| 40 | ISSUE | `REJECTED_QUOTATION` | Rejected Quotation |
| 50 | ISSUE | `OPEN_SALES_ORDER` | Open Sales Order |
| 60 | ISSUE | `REJECTED_SALES_ORDER` | Rejected Sales Order |
| 70 | ISSUE | `UNPICKED_DELIVERY` | Unpicked Delivery |
| 80 | ISSUE | `READY_TO_GOODS_ISSUE` | Ready to Goods Issue |
| 90 | ISSUE | `NO_JOURNAL_ENTRY` | No Journal Entry Created |
| 100 | ISSUE | `NOT_YET_PAYMENT` | Not Yet Payment |
| 110-160 | TOTAL | `TOTAL_INQUIRY`, `TOTAL_QUOTATION`, `TOTAL_SALES_ORDER`, `TOTAL_DELIVERY`, `TOTAL_BILLING`, `TOTAL_PAYMENT` | Inquiry / Quotation / Sales Order / Delivery / Billing / Payment |

Selalu kembalikan **16 baris**, termasuk yang `Counter = 0`, supaya chart tidak berubah bentuk.

**A2. Buat `abap/ZCL_SD_DOCFLOW_SUMMARY.clas.abap` (`if_rap_query_provider`)**

Urutan eksekusi, satu pass, tanpa BFS rekursif (semua mass read `FOR ALL ENTRIES`, maksimal 3 hop):

1. `get_filter( )->get_as_ranges( )` di dalam `TRY`; petakan nama filter → range internal. Filter yang tidak dikenal diabaikan.
   - Dukung wildcard: nilai `low` yang mengandung `*` diubah dari `option 'EQ'` menjadi `option 'CP'` (agar operator *contains / starts with / ends with* dari UI tetap bekerja).
   - `sign 'E'` diperlakukan sebagai exclusion pada semua SELECT.
2. `AUTHORITY-CHECK` (belum ada sama sekali di `ZCL_SD_DOCFLOW_QUERY`, jangan diulang):
   - `V_VBAK_VKO` ACTVT `03` per kombinasi `VKORG/VTWEG/SPART` yang muncul
   - `V_LIKP_VST` sebelum baca LIKP, `F_BKPF_BUK` sebelum baca BKPF/BSEG
   - Jika gagal: kembalikan 16 baris dengan `Counter = 0` dan `IsTruncated = 'A'` (ditolak) — jangan dump.
3. `SELECT vbeln, vbtyp, rfstk, gbstk, abstk, lfstk, fksak FROM vbak` dengan seluruh filter (`vbtyp IN ('A','B','C')`), `UP TO mc_max_docs ROWS` (usulan konstanta `50000`). Set `IsTruncated = 'X'` bila tercapai.
4. Hitung bucket 1-6 + tile Inquiry/Quotation/Sales Order dari hasil langkah 3 sesuai keputusan 2.4.
5. `SELECT vbelv, vbeln, vbtyp_n FROM vbfa FOR ALL ENTRIES IN <orders VBTYP 'C'> WHERE vbelv = ... AND vbtyp_n IN ('J','M','O','P')` → kumpulkan delivery (`J`) dan order-related billing (`M`/`O`/`P`).
6. `SELECT vbeln, kostk, wbstk, lifsk, uvall FROM likp FOR ALL ENTRIES IN <deliveries>` → bucket 7 & 8 + tile Delivery (jumlah delivery distinct).
7. `SELECT vbelv, vbeln, vbtyp_n FROM vbfa FOR ALL ENTRIES IN <deliveries> WHERE vbtyp_n IN ('M','O','P')` → billing delivery-related; gabung dengan hasil langkah 5, buang duplikat.
8. `SELECT vbeln, rfbsk, fksto, vbtyp FROM vbrk FOR ALL ENTRIES IN <billings>` → tile Billing (exclude `FKSTO = 'X'`).
9. Bentuk `AWKEY` dari nomor billing (pola sama seperti `ZCL_SD_DOCFLOW_QUERY.clas.abap:925-929`), lalu `SELECT bukrs, belnr, gjahr, awkey, stblg FROM bkpf WHERE awtyp = 'VBRK' AND awkey IN ...` → bucket 9 = billing relevan tanpa BKPF.
10. `SELECT bukrs, belnr, gjahr, augbl FROM bseg FOR ALL ENTRIES IN <bkpf keys> WHERE koart = 'D'` → bucket 10 (ada `AUGBL` kosong) + tile Payment (semua `AUGBL` terisi).
11. `io_response->set_data( )` + `set_total_number_of_records( 16 )`; hormati paging seperti `ZCL_SD_DOCFLOW_QUERY.clas.abap:446-469`.

Catatan performa: bila BSEG terbukti lambat di sistem target, ganti langkah 10 dengan CDS view item akuntansi (`I_OperationalAcctgDocItem` / kompatibilitas BSID) — logika bucket tidak berubah. Ukur dulu, jangan optimasi buta.

**A3. Ekspos entity baru**

Tambahkan `expose ZR_SD_DocFlowSummary as DocFlowSummary;` ke service definition `ZSD_SD_DOCFLOW` (lihat `document_flow_backend_design.md:464-476`), lalu **Publish ulang** service binding `ZUI_SD_DOCFLOW` dan bersihkan cache metadata sesuai `DEPLOYMENT_AND_LIFECYCLE_GUIDE.md`.

### Fase B — Frontend

**B1. `webapp/controller/Main.controller.js` — hapus perhitungan client-side**

- Hapus blok `oKPIs` / `mIssueCounts` / `forEach` beserta binding-nya (`:750-800`).
- Reset 0-record (`:812-820`) dan error handler (`:833-841`) tidak lagi mengisi `kpiData`/`issueData`; summary punya siklus sendiri.

**B2. Tambah `_loadDocFlowSummary(oFilterData)`**

- Pakai model `rapFlowService` (sudah ada di `webapp/manifest.json:75-82`), `bindList("/DocFlowSummary", null, null, aFilters)` lalu `requestContexts(0, 20)`.
- Filter yang dikirim: `SalesOrganization`, `DistributionChannel`, `OrganizationDivision`, `SoldToParty`, `PurchaseOrderByCustomer`, `SalesDocumentDate` (BT/GE/LE), `CreatedByUser`, dan select-options `SalesDocument`. **Jangan** kirim `SDDocumentCategory`.
- Operator *contains / starts with / ends with* dikonversi jadi `EQ` dengan nilai berwildcard (`*nilai*`, `nilai*`, `*nilai`) agar bisa dibaca sebagai `CP` di ABAP (lihat A2 langkah 1). Reuse `CONDITION_OPERATORS` (`Main.controller.js:25-50`) untuk pemetaannya.
- Hasil dipetakan: baris `SummaryType = 'ISSUE'` → `/issueData` (`{ issueType: BucketText, count: Counter }`, urut `SortOrder`); baris `TOTAL` → `/kpiData` per `BucketKey`.
- `IsTruncated = 'X'` → `MessageToast` peringatan bahwa cakupan dipotong. `IsTruncated = 'A'` → pesan otorisasi kurang.
- Kegagalan summary **tidak boleh** menggagalkan tabel: tangani error terpisah, set `/chartBusy` false, `/issueData` ke 16 bucket bernilai 0.

**B3. Panggil dari `onSearch`**

Panggil `_loadDocFlowSummary(oFilterData)` bersebelahan dengan `_loadDynamicHeaderData(oFilterData)` di `Main.controller.js:609` (paralel, dua request independen).

**B4. `webapp/view/Main.view.xml` — chart 10 bar**

- Tinggi `VizFrame` (`:274`) dari `280px` → minimal `360px` agar 10 label terbaca.
- Binding `/issueData` tetap; tidak perlu ubah dataset/feed.
- Lebar kolom: pertimbangkan tile 40% / chart 58% (`:211`, `:270`) supaya label bar tidak terpotong.
- `onInit` `issueData` (`Main.controller.js:85`) diisi 16 bucket nol sebagai placeholder agar chart tidak kosong saat load pertama.

**B5. (Sekunder, defect terpisah) Perbaiki 3 field name di mapping tabel**

`Main.controller.js:727`, `:734-735`, `:739` sesuai tabel di bagian 1.3. Ini memperbaiki kolom Net Value, Status, dan Sold-to Party — tidak memengaruhi chart, tapi ditemukan saat analisis ini.

## 4. Risiko & Mitigasi

| Risiko | Mitigasi |
| :--- | :--- |
| BSEG mahal untuk portfolio besar | `mc_max_docs` cap + `IsTruncated`; siapkan opsi ganti ke view item akuntansi |
| `RFSTK`/`UVALL` tidak terisi di sistem target (tergantung release/customizing) | Verifikasi dulu lewat SE16N pada 5 dokumen contoh; sediakan fallback `GBSTK`/`LIFSK` dan catat di dokumentasi |
| Operator select-options non-range (`contains`) gagal jadi range | Konversi wildcard di B2 + `CATCH cx_rap_query_filter_no_range` yang mengembalikan bucket nol, bukan dump |
| Angka chart dan tabel terlihat tidak sinkron (chart lintas kategori, tabel hanya Sales Order) | Tambah subtitle pada Card (`Main.view.xml:203-205`) yang menyatakan chart mencakup seluruh alur dokumen, tabel hanya sales order |
| Tidak ada authority check di `ZCL_SD_DOCFLOW_QUERY` (temuan lama) | Di luar cakupan tugas ini, tapi catat sebagai isu keamanan terbuka: service yang sama sudah mengekspos data BSEG tanpa cek otorisasi (`abap/ZCL_SD_DOCFLOW_QUERY.clas.abap:971-978`) |

## 5. Validasi

1. **Backend, langsung via URL** (lewat proxy `ui5.yaml`):
   `/sap/opu/odata4/sap/zui_sd_docflow/srvd/sap/zsd_sd_docflow/0001/DocFlowSummary?$filter=SalesOrganization eq '1010'`
   → harus 16 baris, `SortOrder` 10..160.
2. **Cross-check angka ke transaksi SAP** untuk satu sales org + rentang tanggal yang sama:
   - VA05 (open orders) → `OPEN_SALES_ORDER`
   - VA05 dengan reason for rejection → `REJECTED_SALES_ORDER`
   - VL06O / VL06P → `UNPICKED_DELIVERY`, `READY_TO_GOODS_ISSUE`
   - VFX3 / VF05 → `NO_JOURNAL_ENTRY`
   - FBL5N open items → `NOT_YET_PAYMENT`
3. **Invariant internal** (uji manual atau ABAP unit test pada method hitung):
   - `OPEN_INQUIRY + REJECTED_INQUIRY <= TOTAL_INQUIRY` (idem quotation & sales order)
   - `UNPICKED_DELIVERY + READY_TO_GOODS_ISSUE <=` jumlah delivery belum GI
   - tidak ada dokumen yang muncul di bucket Open dan Rejected sekaligus
4. **Frontend**: jalankan `npm start`, tekan Go tanpa filter lalu dengan filter sales org + rentang tanggal; pastikan 10 bar tampil, 6 tile terisi, dan `IsTruncated` memunculkan toast. Uji juga jalur error (matikan VPN) → tabel tetap menampilkan pesan errornya sendiri, chart jatuh ke 16 bucket nol.
5. **Regresi**: buka Process Flow dari satu baris tabel → `/DocRelations` harus tetap berfungsi (service binding di-publish ulang di A3).

## 6. Di Luar Cakupan

- Drill-down klik bar → filter tabel (belum diminta).
- Migrasi tabel header dari `C_SlsDocFlfllmntAnalyzer` ke `DocHeader` RAP.
- Menambah authority check ke `ZCL_SD_DOCFLOW_QUERY` yang sudah ada.
- Memperluas dropdown SD Document Type ke kategori lain (diputuskan tetap Sales Order).
