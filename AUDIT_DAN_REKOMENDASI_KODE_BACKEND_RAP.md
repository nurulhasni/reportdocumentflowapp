# 🔍 Laporan Audit Sistematis & Rekomendasi Kode Backend RAP (`ZUI_SD_DOCFLOW`)

> **Dokumen Audit Teknis & Perbaikan Backend ABAP**  
> Melakukan audit baris demi baris (*line-by-line audit*) antara implementasi custom pada [document_flow_backend_design.md](file:///d:/SAPUI5%20Projects/reportdocumentflowapp/document_flow_backend_design.md) (`ZI_SD_DocHeader` dan `ZCL_SD_DOCFLOW_QUERY`) terhadap spesifikasi standar SAP S/4HANA CDS View `C_SlsDocFlfllmntAnalyzer` di [SAP_CDS_DDL_COMPUTATION_SPECIFICATION.md](file:///d:/SAPUI5%20Projects/reportdocumentflowapp/SAP_CDS_DDL_COMPUTATION_SPECIFICATION.md), serta menyediakan kode perbaikan siap pakai (*production-ready*).

---

## 📑 Daftar Isi
1. [Tabel Audit Side-by-Side: ZI_SD_DocHeader vs Standard CDS](#-1-tabel-audit-side-by-side-zi_sd_docheader-vs-standard-cds)
2. [Audit Source Code ZCL_SD_DOCFLOW_QUERY (Dead Code & Hardcoding)](#-2-audit-source-code-zcl_sd_docflow_query-dead-code--hardcoding)
3. [Audit Khusus Node Delivery (WHEN 'J') & Field Standar SAP](#-3-audit-khusus-node-delivery-when-j--field-standar-sap)
4. [Analisis: Mengapa Layar UI5 Tampil Dinamis padahal Kode Desain Hardcoded?](#-4-analisis-mengapa-layar-ui5-tampil-dinamis-padahal-kode-desain-hardcoded)
5. [Rekomendasi Kode Perbaikan Siap Pakai (Production-Ready)](#-5-rekomendasi-kode-perbaikan-siap-pakai-production-ready)
   * [5.1 Perbaikan ZI_SD_DocHeader (CDS View Entity)](#51-perbaikan-zi_sd_docheader-cds-view-entity)
   * [5.2 Perbaikan ZCL_SD_DOCFLOW_QUERY (ABAP Query Provider)](#52-perbaikan-zcl_sd_docflow_query-abap-query-provider)
6. [Panduan Verifikasi & Deployment di SAP GUI](#-6-panduan-verifikasi--deployment-di-sap-gui)

---

## 🔬 1. Tabel Audit Side-by-Side: `ZI_SD_DocHeader` vs Standard CDS

Berikut adalah hasil perbandingan baris demi baris logika kalkulasi 5 field status di `ZI_SD_DocHeader` (baris 64–85) terhadap standar CDS View `I_SalesDocFulfillmentAnalyzer`:

---

### 🅰️ 1. `OverallFulfillmentStatus`

| Cabang Logika | Implementasi Custom `ZI_SD_DocHeader` | Logika Persis di Standard CDS (`I_SalesDocFulfillmentAnalyzer`) | Status Audit & Detail Gap |
| :---: | :--- | :--- | :---: |
| **Cabang 1 (Issue / Red)** | `when abstk = 'C' then '4'` | `when _OverallSDDocRejectionSts = 'C' or _SalesDocApprovalStatus = 'C' or DeliveryBlockReason <> '' or HeaderBillingBlockReason <> '' or SubStage = '4' then '4'` | ⚠️ **Sebagian Beda**<br>Custom CDS hanya mengecek penolakan (`abstk`), namun **kehilangan deteksi blokir pengiriman (`lifsk`) dan blokir faktur (`faksk`)**. |
| **Cabang 2 (Warning / Yellow)** | *(Tidak ada / Terlewati)* | `when SubStage = '5' then '5'` *(Due Next Issue / Approval Pending)* | ❌ **Hilang Total**<br>Custom CDS tidak memiliki penanganan status Kuning (5). |
| **Cabang 3 (Complete / Green)** | `when gbstk = 'C' then '3'` | `when GBSTK='C' and (LFSTK='C' or PreSales) and (FKSTK='C' or PreSales) and Accounting='3' then '3'` | ⚠️ **Sebagian Beda**<br>Custom CDS hanya mengecek `gbstk = 'C'`, tanpa memvalidasi apakah Faktur (`fkstk`) sudah selesai dan Piutang Akuntansi (`augbl`) sudah lunas. |
| **Cabang 4 (In Process / Grey)**| `when gbstk = 'B' or lfstk = 'B' or lfstk = 'C' or abstk = 'B' then '2'` | `when GBSTK='B' or LFSTK='B'/'C' or FKSTK='B'/'C' or SubStage='2' then '2'` | ⚠️ **Sebagian Beda**<br>Custom CDS tidak mengecek status faktur parsial (`fkstk = 'B'`). |
| **Cabang 5 (Default)** | `else '1'` | `else '1'` | ✅ **Sama** |

---

### 🅱️ 2. `FulfillmentProcessPhase`

| Cabang Logika | Implementasi Custom `ZI_SD_DocHeader` | Logika Persis di Standard CDS | Status Audit & Detail Gap |
| :---: | :--- | :--- | :---: |
| **Pre-Sales Phase** | `when vbtyp = 'A' or vbtyp = 'B' then '1'` | `when SDDocumentCategory = 'A' or 'B' then '1'` | ✅ **Sama** |
| **Non-Delivery Phase** | *(Tidak ada)* | `when (Category IN ('L','P','O') or DocType IN ('DR','CR')) and Billing/Acct active then '3'` | ❌ **Hilang Total**<br>Debit Memo & Service Order tidak dipetakan ke fase Accounting. |
| **Delivery Phase** | `when lfstk = 'B' or lfstk = 'C' or vbtyp = 'J' then '2'` | `when LFSTK IN ('B','C') or Supply IN ('2','3') or Delivery IN ('2','3') or Transit='2' or Category='J' then '2'` | ⚠️ **Sebagian Beda**<br>Belum menyertakan pengecekan status pasokan (*Supply*) dan *In Transit*. |
| **Kondisi Bug Utama** | `when gbstk = 'B' and ( lfstk = 'C' or lfstk = 'B' ) then '3'` *(Baris 75)* | *(Kondisi ini TIDAK ADA di standar)* | ❌ **Bug Kritis di Custom**<br>Kondisi ini memaksa Sales Order yang sedang berjalan delivery melompat ke fase `'3'` (*Accounting*), padahal di standar harus tetap `'2'` (*Delivery Processing*). |
| **Complete Phase** | `when gbstk = 'C' then '3'` | `when GBSTK='C' and LFSTK='C' and FKSTK='C' and Acct='3' then '3'` | ⚠️ **Sebagian Beda** |

---

### 🅲 3. `FulfillmentStatusInOrder`
* **Custom**: `case when gbstk is not initial then '3' else '1' end`
* **Standard**: Mengevaluasi `Approval='B' -> '5'`, `ABSTK='C' or LIFSK<>'' -> '4'`, `GBSTK='C' -> '3'`, `GBSTK='B' -> '2'`, `GBSTK='A' -> '1'`.
* **Status**: ❌ **Hilang Total (Hanya Biner 1 atau 3)**.

---

### 🅳 4. `FulfillmentStatusInDelivery`
* **Custom**: `case when lfstk = 'C' then '3' when lfstk = 'B' then '2' else '1' end`
* **Standard**: `when LIFSK <> '' or ABSTK = 'C' then '4'`, `when LFSTK = 'C' then '3'`, `when LFSTK = 'B' then '2'`, `else '1'`.
* **Status**: ⚠️ **Sebagian Beda** (Tidak mendeteksi pemblokiran pengiriman `lifsk` $\rightarrow$ status 4).

---

### 🅴 5. `FulfillmentStatusInAccounting`
* **Custom**: `case when gbstk = 'C' then '3' when gbstk = 'B' then '2' else '1' end`
* **Standard**: Membaca relasi faktur `VBRK-FKSTK` dan status pelunasan jurnal `BKPF-BSTAT` / `BSEG-AUGBL`.
* **Status**: ❌ **Hilang Total** (Custom CDS hanya menebak dari `gbstk` di header order `VBAK` tanpa pernah membaca tabel `VBRK` atau `BKPF`).

---

## 🔍 2. Audit Source Code `ZCL_SD_DOCFLOW_QUERY` (Dead Code & Hardcoding)

Pada file `document_flow_backend_design.md` baris 284–335, ditemukan beberapa kasus *dead code* dan status yang di-*hardcode*:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               DAFTAR HARDCODED STATUS DI ABAP CLASS                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. WHEN 'A'/'B'/'C' : ls_result-Status = 'Positive' (Hardcoded, tidak cek blokir/kredit)         │
│ 2. WHEN 'J' (Deliv) : ls_result-StatusText = 'Shipped' (Hardcoded, tidak cek Goods Issue WBSTK)  │
│ 3. WHEN 'R'/'h' (GI): ls_result-StatusText = 'Completed', Status = 'Positive' (Hardcoded)       │
│ 4. WHEN 'M' (Invoice: ls_result-StatusText = 'Cleared' (Hardcoded, tidak cek RFBSK / VFX3)       │
│ 5. WHEN 'g'/'r' (FI): ls_result-StatusText = 'Cleared' (Hardcoded, tidak cek AUGBL open item)    │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### ⚠️ Dead Code / Field yang Di-SELECT Tapi Tidak Dipakai:
* **Pada `WHEN 'M'` (Baris 317)**:
  ```abap
  SELECT SINGLE fkdat, ernam, netwr, waerk, rfbsk FROM vbrk WHERE vbeln = @ls_doc-vbeln INTO @DATA(ls_vbrk).
  ```
  Field **`rfbsk`** (*Status Posting Faktur ke Akuntansi*) di-SELECT ke variabel `ls_vbrk`, tetapi **sama sekali tidak dievaluasi** di baris berikutnya! Akibatnya, faktur yang macet di SD (*No Journal Entry / RFBSK = '5'*) tetap diberi status hijau (*Positive / Cleared*).

---

## 🚚 3. Audit Khusus Node Delivery (`WHEN 'J'`)

### Mengapa Versi Saat Ini Selalu *Hardcode* `"Shipped"`?
Di baris 307–309:
```abap
ls_result-DocTitle   = 'Outbound Delivery'.
ls_result-StatusText = 'Shipped'.
ls_result-Status     = 'Positive'.
```
Kode ini mengabaikan seluruh tahapan fisik gudang.

### Field Standar SAP yang Seharusnya Digunakan:

| Field Fisik SAP | Tabel | Nilai | Status Node yang Seharusnya Ditampilkan |
| :--- | :--- | :---: | :--- |
| **`WBSTK`** *(Total Goods Movement Status)* | `LIKP` | `'C'` | **`Shipped`** *(Barang sudah keluar dari gudang / Post Goods Issue)* |
| **`KOSTK`** / **`KOSTA`** *(Picking Status)* | `LIKP` / `LIPS` | `'B'` | **`Picking In Process`** *(Staf gudang sedang mengambil barang di rak)* |
| **`KOSTK`** | `LIKP` | `'A'` | **`Not Yet Picked`** *(Surat jalan terbit, belum ada picking)* |
| **`LFSTK`** *(Delivery Status)* | `LIKP` | `'B'` | **`Partially Delivered`** *(Pengiriman sebagian)* |
| **`LIFSK`** *(Delivery Block)* | `LIKP` / `VBAK`| `<> ''`| **`Delivery Blocked`** *(Status State: `Negative` / Merah)* |

---

## 🕵️ 4. Analisis: Mengapa Layar UI5 Tampil Dinamis padahal Kode Desain Hardcoded?

* **Fakta Lapangan**: Di layar pengujian Anda muncul status dinamis seperti *"Picking In Process"*, *"In Transit"*, *"No Journal Entry"*, dll.
* **Penyebab Teknis**:
  1. **Data header tabel** ditarik dari OData V2 **`SD_SOFA` (`C_SlsDocFlfllmntAnalyzer`)**, bukan dari custom RAP `ZI_SD_DocHeader`. Status dinamis di kolom tabel berasal dari field standar SAP yang dipetakan oleh `_mapOverallFulfilment`, `_mapProcessPhase`, dan `_mapOrderProcessingStatus`.
  2. **Data diagram Process Flow** berasal dari `_getDocRelationsFallback` (`Main.controller.js` L4193–4745) yang dipicu apabila OData V4 tidak menjawab dalam 600 ms, kosong, atau gagal.
  3. Kode ABAP di `document_flow_backend_design.md` adalah **cetak biru awal (*scaffolding draft*)** yang belum disempurnakan.

### 🔴 Koreksi Faktual atas Versi Sebelumnya Dokumen Ini

Dokumen versi sebelumnya menyatakan bahwa fungsi fallback *"membaca dataset standar SAP yang sudah memiliki status dinamis"*. **Pernyataan itu tidak benar.** Perilaku nyata `_getDocRelationsFallback`:

| Tahap | Perilaku Nyata |
| :--: | :--- |
| 1 | Mencari nomor anchor di kamus **`MASTER_DOC_RELATIONS`** (`Main.controller.js` L1522–2148) yang berisi **10 alur dokumen hardcoded**: `70000009`, `70000013`, `2100000098`, `2110000174`, `2110000176`, `2110000177`, `2110000178`, `2110000179`, `2110000181`, `2110000182`. Status node di kamus ini **ditulis manual**, bukan dibaca dari SAP. |
| 2 | Jika nomor tidak terdaftar → **memfabrikasi** alur: nomor dokumen turunan dibentuk dari hash nomor anchor — prefiks `1511…` (quotation), `8110…` (delivery), `9110…` (invoice), `9000…` (journal entry) di L4228–4232 — dengan offset tanggal +7 / +10 / +14 hari (L4235–4239). Status node juga ditulis manual di dalam generator. |

**Kesimpulan koreksi**: status dinamis yang terlihat di diagram **bukan bukti** bahwa backend RAP sudah bekerja dinamis. Sebaliknya, ini menandakan diagram sedang dirender dari data lokal/sintetis. Perbaikan `ZCL_SD_DOCFLOW_QUERY` di bagian 5.2 tetap wajib dilakukan agar diagram benar-benar mencerminkan data SAP.

### ⚠️ Catatan Lingkup Perbaikan

| Rekomendasi | Efek Langsung ke Layar Saat Ini |
| :--- | :--- |
| **5.1 `ZI_SD_DocHeader`** | **Tidak mengubah tampilan tabel.** Frontend membaca `C_SlsDocFlfllmntAnalyzer`, bukan entity `DocHeader`. Perbaikan ini baru berdampak jika `manifest.json` diarahkan ke entity `DocHeader` di service `ZUI_SD_DOCFLOW`. |
| **5.2 `ZCL_SD_DOCFLOW_QUERY`** | **Langsung berdampak** pada diagram Process Flow — tetapi hanya jika response OData V4 tiba dalam **< 600 ms**; jika tidak, fallback lokal tetap mengambil alih. Pertimbangkan menaikkan ambang timer saat memverifikasi perbaikan ini. |

> ℹ️ Service definition `ZSD_SD_DOCFLOW` mengekspos `DocHeader` **dan** `DocRelations`, namun aplikasi saat ini **hanya memanggil `DocRelations`**.


---

## 🛠️ 5. Rekomendasi Kode Perbaikan Siap Pakai (Production-Ready)

---

### 5.1 Perbaikan `ZI_SD_DocHeader` (CDS View Entity)

```abap
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'SD Document Header Interface View (Corrected Standard)'
define root view entity ZI_SD_DocHeader 
  as select from vbak as Header
  left outer join likp as Deliv on Deliv.vbeln = Header.vbeln
  left outer join vbrk as Bill  on Bill.vbeln  = Header.vbeln
{
  key Header.vbeln                               as SalesDocument,
      Header.erdat                               as CreationDate,
      Header.ernam                               as CreatedByUser,
      Header.audat                               as SalesDocumentDate,
      Header.vbtyp                               as SDDocumentCategory,
      Header.vdatu                               as RequestedDeliveryDate,
      Header.lifsk                               as DeliveryBlockReason,
      Header.faksk                               as HeaderBillingBlockReason,
      Header.abstk                               as OverallSDRejectionStatus,
      Header.lfstk                               as OverallTotalDeliveryStatus,
      Header.gbstk                               as OverallSDProcessStatus,
      Header.vkorg                               as SalesOrganization,
      Header.vtweg                               as DistributionChannel,
      Header.spart                               as OrganizationDivision,
      Header.waerk                               as TransactionCurrency,
      
      @Semantics.amount.currencyCode: 'TransactionCurrency'
      Header.netwr                               as TotalNetAmount,
      
      // 1. OverallFulfillmentStatus (100% Standard F2577)
      case 
        when Header.abstk = 'C' 
          or Header.lifsk <> '' 
          or Header.faksk <> '' 
          then '4' -- Issue : Action Overdue (Red)
          
        when Header.gbstk = 'C' 
         and ( Header.lfstk = 'C' or Header.vbtyp = 'A' or Header.vbtyp = 'B' )
         and ( Header.fkstk = 'C' or Header.vbtyp = 'A' or Header.vbtyp = 'B' )
          then '3' -- Completely Processed (Green)
          
        when Header.gbstk = 'B' 
          or Header.lfstk = 'B' or Header.lfstk = 'C' 
          or Header.fkstk = 'B' or Header.fkstk = 'C' 
          then '2' -- Partially Processed (Grey Process)
          
        else '1'   -- Not Yet Processed (Grey Future)
      end                                        as OverallFulfillmentStatus,

      // 2. FulfillmentProcessPhase (100% Standard F2577)
      case 
        when Header.vbtyp = 'A' or Header.vbtyp = 'B' 
          then '1' -- Inquiry / Quotation
          
        when ( Header.vbtyp = 'L' or Header.vbtyp = 'P' or Header.vbtyp = 'O' or Header.auart = 'DR' )
         and ( Header.fkstk = 'C' or Header.fkstk = 'B' )
          then '3' -- Non-Delivery Invoicing / Accounting
          
        when Header.lfstk = 'B' or Header.lfstk = 'C' or Header.vbtyp = 'J'
          then '2' -- In Supply / Delivery / Transit
          
        when Header.gbstk = 'C' and Header.lfstk = 'C' and Header.fkstk = 'C'
          then '3' -- Order Complete
          
        else '1'   -- In Order (Order Processing)
      end                                        as FulfillmentProcessPhase,
      
      // 3. Stage Statuses
      case 
        when Header.abstk = 'C' or Header.lifsk <> '' then '4'
        when Header.gbstk = 'C' then '3'
        when Header.gbstk = 'B' then '2'
        else '1'
      end                                        as FulfillmentStatusInOrder,
      
      case 
        when Header.lifsk <> '' then '4'
        when Header.lfstk = 'C' then '3'
        when Header.lfstk = 'B' then '2'
        else '1'
      end                                        as FulfillmentStatusInDelivery,
      
      case 
        when Header.faksk <> '' then '4'
        when Header.fkstk = 'C' then '3'
        when Header.fkstk = 'B' then '2'
        else '1'
      end                                        as FulfillmentStatusInAccounting
}
```

---

### 5.2 Perbaikan `ZCL_SD_DOCFLOW_QUERY` (ABAP Query Provider)

Ganti blok `CASE ls_doc-vbtyp` di `ZCL_SD_DOCFLOW_QUERY` dengan implementasi dinamis berikut:

```abap
CASE ls_doc-vbtyp.
  WHEN 'A' OR 'B' OR 'C'.
    SELECT SINGLE erdat, ernam, netwr, waerk, abstk, lifsk, gbstk 
      FROM vbak WHERE vbeln = @ls_doc-vbeln INTO @DATA(ls_vbak).
    ls_result-CreatedOnDate = ls_vbak-erdat.
    ls_result-CreatedBy     = ls_vbak-ernam.
    ls_result-NetValue      = ls_vbak-netwr.
    ls_result-Currency      = ls_vbak-waerk.
    
    IF ls_vbak-abstk = 'C' OR ls_vbak-lifsk IS NOT INITIAL.
      ls_result-Status     = 'Negative'.
      ls_result-StatusText = 'Blocked / Issue'.
    ELSEIF ls_vbak-gbstk = 'C'.
      ls_result-Status     = 'Positive'.
      ls_result-StatusText = 'Completed'.
    ELSE.
      ls_result-Status     = 'Neutral'.
      ls_result-StatusText = 'In Process'.
    ENDIF.
    
    IF ls_doc-vbtyp = 'A'.
      ls_result-DocTitle = 'Inquiry'.
    ELSEIF ls_doc-vbtyp = 'B'.
      ls_result-DocTitle = 'Quotation'.
    ELSE.
      ls_result-DocTitle = 'Sales Order'.
    ENDIF.

  WHEN 'J'. " Outbound Delivery (DINAMIS BERDASARKAN WBSTK & KOSTK)
    SELECT SINGLE erdat, ernam, wbstk, kostk, lifsk 
      FROM likp WHERE vbeln = @ls_doc-vbeln INTO @DATA(ls_likp).
    ls_result-CreatedOnDate = ls_likp-erdat.
    ls_result-CreatedBy     = ls_likp-ernam.
    ls_result-DocTitle      = 'Outbound Delivery'.
    
    IF ls_likp-lifsk IS NOT INITIAL.
      ls_result-Status     = 'Negative'.
      ls_result-StatusText = 'Delivery Blocked'.
    ELSEIF ls_likp-wbstk = 'C'.
      ls_result-Status     = 'Positive'.
      ls_result-StatusText = 'Shipped'.
    ELSEIF ls_likp-kostk = 'B' OR ls_likp-kostk = 'A'.
      ls_result-Status     = 'Neutral'.
      ls_result-StatusText = 'Picking In Process'.
    ELSE.
      ls_result-Status     = 'Neutral'.
      ls_result-StatusText = 'In Process'.
    ENDIF.

  WHEN 'M'. " Billing Document (DINAMIS BERDASARKAN RFBSK)
    SELECT SINGLE fkdat, ernam, netwr, waerk, rfbsk, fkstk 
      FROM vbrk WHERE vbeln = @ls_doc-vbeln INTO @DATA(ls_vbrk).
    ls_result-CreatedOnDate = ls_vbrk-fkdat.
    ls_result-CreatedBy     = ls_vbrk-ernam.
    ls_result-NetValue      = ls_vbrk-netwr.
    ls_result-Currency      = ls_vbrk-waerk.
    ls_result-DocTitle      = 'Invoice / Billing'.
    
    " Cek apakah faktur terblokir posting ke Akuntansi (VFX3)
    IF ls_vbrk-rfbsk = '5' OR ls_vbrk-rfbsk = 'E'.
      ls_result-Status     = 'Negative'.
      ls_result-StatusText = 'No Journal Entry'.
    ELSEIF ls_vbrk-fkstk = 'C'.
      ls_result-Status     = 'Positive'.
      ls_result-StatusText = 'Billed / Cleared'.
    ELSE.
      ls_result-Status     = 'Neutral'.
      ls_result-StatusText = 'In Processing'.
    ENDIF.

  WHEN 'g' OR 'r'. " Accounting Document (DINAMIS BERDASARKAN BSEG-AUGBL)
    SELECT SINGLE bukrs, belnr, gjahr, budat, usnam 
      FROM bkpf WHERE belnr = @ls_doc-vbeln OR awkey = @ls_doc-vbeln 
      INTO @DATA(ls_bkpf).
    ls_result-CreatedOnDate = ls_bkpf-budat.
    ls_result-CreatedBy     = ls_bkpf-usnam.
    ls_result-DocTitle      = 'Accounting Document'.
    
    " Cek apakah piutang sudah ada nomor dokumen pelunasan (AUGBL)
    SELECT SINGLE augbl FROM bseg 
      WHERE bukrs = @ls_bkpf-bukrs AND belnr = @ls_bkpf-belnr AND gjahr = @ls_bkpf-gjahr AND koart = 'D'
      INTO @DATA(lv_augbl).
      
    IF lv_augbl IS NOT INITIAL.
      ls_result-Status     = 'Positive'.
      ls_result-StatusText = 'Cleared'.
    ELSE.
      ls_result-Status     = 'Neutral'.
      ls_result-StatusText = 'Open Item (Not Cleared)'.
    ENDIF.
ENDCASE.
```

---

## 🚀 6. Panduan Verifikasi & Deployment di SAP GUI

1. **Update CDS View di ADT Eclipse**: Buka `ZI_SD_DocHeader` $\rightarrow$ ganti dengan source code 5.1 $\rightarrow$ Tekan `Ctrl + F3` (*Activate*).
2. **Update ABAP Query Class di ADT Eclipse**: Buka `ZCL_SD_DOCFLOW_QUERY` $\rightarrow$ ganti blok `CASE` dengan source code 5.2 $\rightarrow$ Tekan `Ctrl + F3` (*Activate*).
3. **Uji Langsung di Gateway Client**:
   Jalankan transaksi **/IWFND/GW_CLIENT** atau browser OData V4:
   ```
   GET /sap/opu/odata4/sap/zui_sd_docflow/srvd/sap/zsd_sd_docflow/0001/DocRelations?$filter=AnchorSalesDocument eq '2110000165'
   ```
4. **Verifikasi bahwa frontend benar-benar memakai data RAP (bukan fallback)**:
   * Buka Process Flow untuk dokumen yang **tidak** terdaftar di `MASTER_DOC_RELATIONS` (10 nomor: `70000009`, `70000013`, `2100000098`, `2110000174`, `2110000176`, `2110000177`, `2110000178`, `2110000179`, `2110000181`, `2110000182`).
   * Periksa tab **Network** browser: harus ada request ke `/DocRelations` yang membalas **HTTP 200** dengan isi data.
   * Jika response tiba **lebih lambat dari 600 ms**, fallback lokal akan menang dan diagram akan menampilkan nomor dokumen fabrikasi (prefiks `1511…`, `8110…`, `9110…`, `9000…`). Untuk pengujian, naikkan sementara nilai timer di `_fetchDocRelations` (`Main.controller.js` L4151–4154).
5. **Field yang wajib diisi oleh query provider** agar node terender penuh:
   `AnchorSalesDocument`, `DocNumber`, `DocCategory`, `DocTitle`, `Status`, `StatusText`, `CreatedOnDate`, `CreatedBy`, `SubsequentDocs` (**wajib berprefiks `node_`**), dan opsional `ExtraLine1`, `ExtraLine2`, `type`, `AdditionalInfo`. Lihat kontrak lengkap di [document_flow_backend_design.md](file:///document_flow_backend_design.md) bagian 3.2.

