// ---------------------------------------------------------------------
// Service Definition : ZSD_SD_DOCFLOW
// Service Binding    : ZUI_SD_DOCFLOW  (OData V4 - UI)
// Endpoint           : /sap/opu/odata4/sap/zui_sd_docflow/srvd/sap/zsd_sd_docflow/0001/
//                      (harus identik dengan dataSource "rapService" di webapp/manifest.json)
//
// File ini adalah salinan objek repository ABAP. Isi di bawah sudah cocok
// dengan yang aktif di sistem (DocHeader + DocRelations terlihat di $metadata),
// ditambah satu baris baru DocFlowSummary. Bila service definition di sistem
// berbeda, JANGAN menimpanya mentah-mentah: cukup tambahkan baris
// DocFlowSummary ke definisi yang sudah berjalan.
//
// Setelah mengubah service definition WAJIB:
//   1. Activate (Ctrl+F3)
//   2. Buka Service Binding ZUI_SD_DOCFLOW -> tombol "Publish" ulang
//   3. Bersihkan cache metadata (DEPLOYMENT_AND_LIFECYCLE_GUIDE.md bagian 6)
// Tanpa langkah 2, /DocFlowSummary akan membalas 404 walaupun class dan
// custom entity-nya sudah aktif.
// ---------------------------------------------------------------------

@EndUserText.label: 'Service Definition Track SD Document Flow'
define service ZSD_SD_DOCFLOW {

  // Header sales order versi RAP. Sudah aktif di sistem (terlihat di $metadata
  // sebagai EntitySet DocHeader), walaupun frontend tabel saat ini masih memakai
  // OData V2 C_SlsDocFlfllmntAnalyzer. JANGAN dihapus.
  expose ZC_SD_DocHeader      as DocHeader;

  // Node + relasi alur dokumen untuk sap.suite.ui.commons.ProcessFlow
  expose ZR_SD_DocRelation    as DocRelations;

  // BARU: agregat 6 tile Total + 10 bucket Total Issues
  // (kartu Document Flow Summary & Analytics)
  expose ZR_SD_DocFlowSummary as DocFlowSummary;
}
