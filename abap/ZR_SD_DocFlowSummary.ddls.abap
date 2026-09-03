// ---------------------------------------------------------------------
// CDS Custom Entity : ZR_SD_DocFlowSummary
// Purpose           : Agregat "Total" (6 tile) + "Total Issues" (10 bucket)
//                     untuk kartu Document Flow Summary & Analytics.
// Implemented by    : ZCL_SD_DOCFLOW_SUMMARY (if_rap_query_provider)
// Exposed as        : DocFlowSummary  (service definition ZSD_SD_DOCFLOW)
//
// Komentar memakai '//' (sintaks DDL) supaya isi file ini bisa disalin
// apa adanya ke ADT lalu langsung di-Activate.
//
// KONTRAK HASIL (WAJIB DIPEGANG FRONTEND):
//  1. Query SELALU mengembalikan 16 baris, termasuk yang Counter = 0,
//     supaya bentuk chart (10 bar) dan jumlah tile (6) tidak berubah.
//  2. SortOrder 10..100  = SummaryType 'ISSUE'  -> 10 bar chart
//     SortOrder 110..160 = SummaryType 'TOTAL'  -> 6 KPI tile
//  3. IsTruncated diisi sama pada seluruh 16 baris:
//       ' ' = hasil lengkap
//       'X' = cakupan dokumen dipotong (batas ZCL_SD_DOCFLOW_SUMMARY=>mc_max_docs)
//       'A' = sebagian/seluruh data dibuang karena otorisasi kurang
//       'F' = filter tidak bisa dikonversi jadi range (mis. "not between")
//             -> seluruh Counter = 0, JANGAN ditampilkan sebagai angka nyata
//
// FIELD FILTER-ONLY (SalesOrganization .. SalesDocument):
//  Hanya dipakai sebagai kriteria seleksi ($filter). Nilainya TIDAK diisi
//  pada baris hasil karena satu baris hasil mewakili agregat banyak dokumen.
//
// Setelah mengubah definisi ini WAJIB: Activate (Ctrl+F3) -> buka Service
// Binding ZUI_SD_DOCFLOW -> tombol "Publish" ulang, lalu bersihkan cache
// metadata (lihat DEPLOYMENT_AND_LIFECYCLE_GUIDE.md bagian 6).
//
// DAFTAR BUCKET YANG DIHASILKAN ZCL_SD_DOCFLOW_SUMMARY
//
//  SortOrder | SummaryType | BucketKey            | BucketText
//  ----------+-------------+----------------------+--------------------------
//         10 | ISSUE       | OPEN_INQUIRY         | Open Inquiry Document
//         20 | ISSUE       | REJECTED_INQUIRY     | Rejected Inquiry
//         30 | ISSUE       | OPEN_QUOTATION       | Open Quotation Document
//         40 | ISSUE       | REJECTED_QUOTATION   | Rejected Quotation
//         50 | ISSUE       | OPEN_SALES_ORDER     | Open Sales Order
//         60 | ISSUE       | REJECTED_SALES_ORDER | Rejected Sales Order
//         70 | ISSUE       | UNPICKED_DELIVERY    | Unpicked Delivery
//         80 | ISSUE       | READY_TO_GOODS_ISSUE | Ready to Goods Issue
//         90 | ISSUE       | NO_JOURNAL_ENTRY     | No Journal Entry Created
//        100 | ISSUE       | NOT_YET_PAYMENT      | Not Yet Payment
//        110 | TOTAL       | TOTAL_INQUIRY        | Inquiry
//        120 | TOTAL       | TOTAL_QUOTATION      | Quotation
//        130 | TOTAL       | TOTAL_SALES_ORDER    | Sales Order
//        140 | TOTAL       | TOTAL_DELIVERY       | Delivery
//        150 | TOTAL       | TOTAL_BILLING        | Billing
//        160 | TOTAL       | TOTAL_PAYMENT        | Payment
// ---------------------------------------------------------------------

@EndUserText.label: 'SD Doc Flow Summary (Totals & Issues)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_SD_DOCFLOW_SUMMARY'
define root custom entity ZR_SD_DocFlowSummary
{
      // ---- Key --------------------------------------------------------
  key SummaryType             : abap.char( 10 );   // 'TOTAL' | 'ISSUE'
  key BucketKey               : abap.char( 30 );   // OPEN_INQUIRY, REJECTED_INQUIRY, ...

      // ---- Isi bucket -------------------------------------------------
      BucketText              : abap.char( 60 );   // label yang dirender chart/tile
      Counter                 : abap.int4;         // jumlah dokumen pada bucket
      SortOrder               : abap.int4;         // 10..160 (lihat tabel di atas)
      IsTruncated             : abap.char( 1 );    // ' ' | 'X' | 'A' | 'F'

      // ---- Filter-only fields (tidak diisi di hasil) ------------------
      SalesOrganization       : vkorg;             // VBAK-VKORG
      DistributionChannel     : vtweg;             // VBAK-VTWEG
      OrganizationDivision    : spart;             // VBAK-SPART
      SoldToParty             : kunnr;             // VBAK-KUNNR
      PurchaseOrderByCustomer : bstkd;             // VBKD-BSTKD (join header POSNR = '000000')
      SalesDocumentDate       : abap.dats;         // VBAK-AUDAT
      CreatedByUser           : ernam;             // VBAK-ERNAM
      SalesDocument           : vbeln;             // VBAK-VBELN (select-options, mendukung *wildcard*)
}
