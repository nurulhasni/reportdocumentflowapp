# Panduan Lengkap Skenario Bisnis, Percabangan & Kondisi Khusus Process Flow SAP S/4HANA (SD Document Flow)

Dokumen ini menyajikan analisis mendalam dan referensi komprehensif mengenai seluruh kondisi bisnis, jenis percabangan (*branching*), serta logika visual dari **SAP S/4HANA Process Flow** (sebagaimana terlihat pada aplikasi Fiori standar **F2577 - Track Sales Orders** dan tabel relasi dokumen **VBFA**).

---

## 1. Fondasi Arsitektur Document Flow SAP SD

Di SAP ECC maupun S/4HANA, alur dokumen penjualan (*Sales & Distribution*) disimpan pada tabel **VBFA** (*Sales Document Flow*). Setiap baris di VBFA menghubungkan:
- **`VBELV`** (*Preceding Document* / Dokumen Pendahulu)
- **`VBELN`** (*Subsequent Document* / Dokumen Penerus)
- **`VBTYP_V` & `VBTYP_N`** (*Document Categories*)

Karena sebuah dokumen dapat menjadi pendahulu bagi lebih dari satu dokumen penerus (atau sebaliknya), maka struktur alur dokumen **bukanlah rantai lurus 1 dimensi**, melainkan **grafik pohon berarah (*Directed Graph / Tree Structure*)**.

### Jenis Hubungan Relasi:
1. **`1-to-1` (Linear Chain)**: 1 Penawaran → 1 Order → 1 Surat Jalan → 1 Faktur → 1 Jurnal.
2. **`1-to-N` (Forward Branching / Percabangan Maju)**: 1 Sales Order memiliki banyak Faktur (misal: Uang Muka + Faktur Batal + Faktur Pengganti) ATAU memiliki banyak Surat Jalan (*Partial Deliveries*).
3. **`N-to-1` (Collective Processing / Penggabungan)**: Banyak Surat Jalan digabungkan menjadi 1 Faktur (*Collective Billing*).
4. **`1-to-0` (Terminated / Blocked Flow)**: Order tertahan / diblokir / belum lengkap sehingga alur terhenti di fase awal.

---

## 2. Kategori Dokumen SAP SD (*SD Document Category*)

| Kode Kategori | Nama Dokumen SAP | Lane Header Process Flow | Keterangan |
|---|---|---|---|
| **`A`** | Inquiry | *Quotation Processing* | Permintaan harga / spesifikasi dari calon pembeli |
| **`B`** | Quotation | *Quotation Processing* | Surat penawaran harga resmi dengan masa berlaku (*Valid To*) |
| **`C`** | Sales Order / Sales Unit / Sales Part | *Order Processing* | Surat pesanan penjualan / kontrak pemesanan resmi |
| **`H`** | Returns Order | *Order Processing* / *Returns* | Pesanan retur barang dari pelanggan |
| **`J`** | Outbound Delivery | *Delivery Processing* | Surat jalan pengiriman barang fisik dari gudang |
| **`M`** | Invoice / Billing Document | *Invoicing* | Faktur penjualan / tagihan piutang (*Billing*) |
| **`P`** | Debit Memo Request | *Invoicing* | Tagihan tambahan / koreksi debit |
| **`O`** | Credit Memo Request | *Invoicing* | Nota kredit / pengembalian dana kepada pelanggan |
| **`g` / `r`** | Journal Entry / Accounting Document | *Accounting* | Jurnal pencatatan buku besar (*FI-AR General Ledger*) |

> ℹ️ **Catatan implementasi aplikasi ini**: dokumen ini menjelaskan standar SAP F2577 dengan hingga 6 lane. Namun `Main.controller.js` (`_transformAndBindProcessFlow`) hanya mendefinisikan **5 lane** — `lane_quotation` (`B`), `lane_order` (`C`), `lane_delivery` (`J`/`R`/`h`), `lane_invoicing` (`M`), dan `lane_accounting` (`g`/`r`). **Tidak ada lane khusus Inquiry**; kategori `A` dipetakan ke `lane_order`. Kategori finansial non-delivery `P`/`O` di tabel di atas belum dipetakan secara khusus di frontend dan akan jatuh ke `lane_order` (default). Lihat [PROJECT_CREATION_GUIDE.md](file:///PROJECT_CREATION_GUIDE.md) Langkah 4 dan [document_flow_backend_design.md](file:///document_flow_backend_design.md) bagian 3.2.1.


---

## 3. Analisis Mendalam 8 Skenario Bisnis & Percabangan

```
                                      ┌──► Down Payment Request (90000097) ──► Journal Entry (90000060 - Not Cleared)
                                      │
[Skenario Down Payment] Sales Unit ───┼──► Invoice Canceled (90000099)     ──► Journal Entry (90000073 - Fully Cleared)
                                      │
                                      └──► Invoice Final (90000101)        ──► Journal Entry (90000076 - Not Cleared)
```

---

### Skenario 1: Standard Tangible Goods Flow (Barang Fisik Normal)
- **Karakteristik Bisnis**: Penjualan barang dagang / manufaktur fisik biasa dengan siklus lengkap.
- **Alur Dokumen**:
  `Quotation Part` → `Sales Part` → `Part Delivery` → `Invoice Part` → `Journal Entry`
- **Jumlah Lane**: **5 Lane** (`Quotation Processing` → `Order Processing` → `Delivery Processing` → `Invoicing` → `Accounting`).
- **Contoh Dokumen Standar**: `2110000182`, `2110000176`.
- **Status Node**:
  - Quotation: `Fully Referenced` (Positive - Centang Hijau)
  - Sales Part: `Completed`, teks: `Requested Delivery On <Tgl>`, `Completely Invoiced`
  - Delivery: `Shipped`, teks: `Shipped On <Tgl>`
  - Invoice: `Completed`, teks: `Billed On <Tgl>`, `Net Value <Jml>`
  - Journal Entry: `Not Cleared` / `Cleared`

---

### Skenario 2: Milestone / Down Payment Billing (Termin / Uang Muka & Pembatalan Faktur)
- **Karakteristik Bisnis**: Transaksi properti (*Sales Unit*), proyek konstruksi, atau jasa bernilai besar yang memerlukan uang muka (*Down Payment / FAZ*) dan termin penagihan tanpa pengiriman fisik (*No Delivery*).
- **Mengapa Ada Banyak Invoice pada 1 Sales Unit?**:
  1. **Invoice 1 (`Down Payment Request`)**: Tagihan uang muka di awal (misal: 10%).
  2. **Invoice 2 (`Canceled Invoice`)**: Faktur termin pertama sempat dibuat salah (misal: salah nominal/pajak) lalu di-cancel di SAP (*VF11*).
  3. **Invoice 3 (`Active Final Invoice`)**: Faktur pengganti yang benar yang ditagihkan ke pelanggan.
- **Mengapa Status Journal Entry-nya Berbeda?**:
  - Journal Entry untuk Faktur Batal berstatus **`Fully Cleared`** karena sudah dilakukan pembalikan jurnal (*Reversal / Storno Accounting*).
  - Journal Entry untuk Faktur Aktif berstatus **`Not Cleared`** karena pelanggan belum melakukan pembayaran kas/bank.
- **Alur Percabangan**:
  - `Sales Unit (2100000098)` [Status: *In Process*]
    - ├─► `Down Payment Request (90000097)` [Completed] ──► `Journal Entry (90000060)` [Not Cleared]
    - ├─► `Invoice (90000099)` [Canceled] ───────────────► `Journal Entry (90000073)` [Fully Cleared]
    - └─► `Invoice (90000101)` [Completed] ──────────────► `Journal Entry (90000076)` [Not Cleared]
- **Jumlah Lane**: **Hanya 3 Lane** (`Order Processing` → `Invoicing` → `Accounting`).
  - *Lane Quotation dan Delivery otomatis tidak ditampilkan karena tidak ada barang fisik.*
- **Contoh Dokumen Standar**: `2100000098`.

---

### Skenario 3: Partial Deliveries (Pengiriman Parsial / Bertahap)
- **Karakteristik Bisnis**: Stok di gudang hanya tersedia sebagian atau pelanggan meminta dikirim dalam beberapa batch.
- **Alur Percabangan**:
  - `Sales Order` [Status: *In Process*]
    - ├─► `Part Delivery 1 (Batch 1)` ──► `Invoice 1` ──► `Journal Entry 1`
    - └─► `Part Delivery 2 (Batch 2)` ──► `Invoice 2` ──► `Journal Entry 2`
- **Jumlah Lane**: **5 Lane**.

---

### Skenario 4: Combined Billing (Surat Jalan Terpisah, Faktur Digabung)
- **Karakteristik Bisnis**: Pengiriman dilakukan beberapa kali dalam 1 minggu, tetapi di akhir bulan dibuatkan 1 faktur tagihan rekapitulasi (*Collective Invoice*).
- **Alur Percabangan (*N-to-1*)**:
  - `Sales Order`
    - ├─► `Delivery 1` ──┐
    - └─► `Delivery 2` ──┴─► `Collective Invoice` ──► `Journal Entry`

---

### Skenario 5: Sales Order Blocked / Incomplete (Pesanan Belum Lengkap / Diblokir)
- **Karakteristik Bisnis**: Sales Order terkena *Credit Limit Block*, *Billing Block*, atau data pengiriman belum lengkap (*Incompletion Log*).
- **Alur Dokumen**:
  - Hanya ada 1 Node: `Sales Unit <Nomor>`
  - Status: **`Incomplete`** / **`Blocked`** (Silang Merah - *Negative*)
  - Baris Teks:
    * Baris 1: `Requested Delivery On <DD.MM.YYYY>`
    * Baris 2: `Not Shipped` *(menjelaskan bahwa barang tidak dikirim karena order tertahan)*
  - Tanda panah: Garis putus-putus (*dotted line*) ke kanan tanpa node lanjutan.
- **Jumlah Lane**: **Hanya 1 Lane** (`Order Processing`).
- **Contoh Dokumen Standar**: `2100000182` (kasus incomplete 2024), `2100000063`.

---

### Skenario 6: Customer Returns & Credit Memo (Retur Barang & Nota Kredit)
- **Karakteristik Bisnis**: Pelanggan mengembalikan barang cacat dan meminta kompensasi/potongan piutang.
- **Alur Dokumen**:
  - Alur Awal: `Sales Order` → `Delivery` → `Invoice` → `Journal Entry`
  - Alur Retur:
    `Return Order (Cat H)` → `Return Delivery` → `Credit Memo (Cat O)` → `Accounting Reversal`

---

### Skenario 7: Direct Sales / Cash Sales (Penjualan Langsung / Tunai)
- **Karakteristik Bisnis**: Transaksi di kasir / POS di mana penyerahan barang dan faktur terjadi seketika tanpa proses penawaran (*Quotation*) dan tanpa proses logistik terpisah.
- **Alur Dokumen**:
  `Sales Order` → `Delivery (Goods Issue)` → `Invoice` → `Journal Entry`
- **Jumlah Lane**: **4 Lane** (`Order Processing`, `Delivery Processing`, `Invoicing`, `Accounting`).

---

### Skenario 8: Pre-Sales Only (Inquiry & Quotation Saja)
- **Karakteristik Bisnis**: Calon pelanggan baru meminta penawaran harga dan belum menerbitkan PO / belum sepakat membeli.
- **Alur Dokumen**:
  `Inquiry` → `Quotation` (Alur berhenti di sini, menunggu konfirmasi pelanggan).
- **Jumlah Lane**: **1 Lane** (`Quotation Processing`).

---

## 4. Matriks Status, Visual State & Icon di Process Flow

| Status Teks SAP | Visual State UI5 | Icon | Warna | Arti Bisnis |
|---|---|---|---|---|
| **`Completed`** | `Positive` | Centang Hijau | Hijau (`#2e7d32`) | Tahapan selesai diproses secara sukses |
| **`Shipped`** | `Positive` | Centang Hijau | Hijau (`#2e7d32`) | Barang sudah keluar gudang (*Goods Issue Posted*) |
| **`Fully Referenced`** | `Positive` | Centang Hijau | Hijau (`#2e7d32`) | Seluruh kuantitas penawaran sudah diserap oleh Sales Order |
| **`Fully Cleared`** | `Positive` | Centang Hijau | Hijau (`#2e7d32`) | Piutang lunas atau jurnal balik telah mengeliminasi saldo |
| **`Canceled`** | `Positive` / `Information` | Centang Hijau teks "Canceled" | Hijau | Dokumen telah dibatalkan secara sah di sistem SAP |
| **`In Process`** | `Neutral` | Panah Chevron Abu-abu | Abu-abu (`#475467`) | Dokumen sedang aktif dikerjakan / belum tuntas |
| **`Not Cleared`** | `Neutral` | Panah Chevron Abu-abu | Abu-abu (`#475467`) | Jurnal piutang tercatat, menunggu pelunasan kas/bank |
| **`Picking In Process`** | `Critical` / `Warning` | Tanda Seru Kuning | Kuning (`#f39c12`) | Gudang sedang mengambil barang (*Picking/Packing*) |
| **`Incomplete`** | `Negative` / `Error` | Silang Merah | Merah (`#d32f2f`) | Data order belum lengkap (*Incompletion Log*) |
| **`Blocked`** | `Negative` / `Error` | Silang Merah | Merah (`#d32f2f`) | Order terkena blokir kredit / faktur / delivery |

---

## 5. Logika Dynamic Lane Header (*Aturan Tampil/Hilang*)

Process Flow SAP UI5 (`sap.suite.ui.commons.ProcessFlow`) bekerja dengan prinsip **Dynamic Lanes**:

1. **Evaluasi Dokumen yang Ada**: Sistem memeriksa seluruh node yang terbentuk dalam transaksi.
2. **Filter Lane**:
   - Jika **tidak ada** dokumen Quotation (`B`) → Header **Quotation Processing dihilangkan**.
   - Jika **tidak ada** dokumen Delivery (`J`) → Header **Delivery Processing dihilangkan**.
3. **Penyesuaian Posisi**:
   - Posisi lane disesuaikan ulang (`position: 0, 1, 2...`) agar jarak horizontal antar kartu tetap proporsional dan tidak ada celah kosong.

---

## 6. Ringkasan Kasus Nyata di Sistem

| Nomor Dokumen | Skenario Bisnis | Jumlah Lane | Ciri Khas Visual |
|---|---|---|---|
| **`2100000098`** | Milestone / Down Payment | **3 Lane** | Sales Unit bercabang 3 (Down Payment Request, Canceled Invoice, Active Invoice) |
| **`2110000182`** | Standard Tangible Goods | **5 Lane** | Alur linear 5 node dari Quotation hingga Journal Entry |
| **`2100000182` (2024)** | Incomplete Order | **1 Lane** | 1 Node *Sales Unit Incomplete* dengan teks *Requested Delivery On 01.07.2024* & *Not Shipped* |
| **`2100000063`** | Blocked Order | **1 Lane** | 1 Node *Sales Unit Blocked* di fase *Order Processing* |

---

## 7. Analisis Kasus Bisnis dari Mock Data Standar SAP S/4HANA (`C_SlsDocFlfllmntAnalyzer.json`)

Berdasarkan dataset resmi bawaan dari aplikasi standar SAP Fiori **Track Sales Orders** (`reference_sdtracker/localService/mockdata/C_SlsDocFlfllmntAnalyzer.json`), berikut adalah 5 kasus standar yang dirancang oleh SAP untuk memvalidasi seluruh variasi proses bisnis:

### Kasus 1: `10000001` - Standard Order (OR) - Alur Sempurna (*Fully Completed*)
- **Tipe Order**: `OR` (*Standard Order*)
- **Customer**: `Domestic US Customer 1` (`1000000`)
- **Nilai Penjualan**: `12,450.00 EUR`
- **Fulfillment Status**:
  - `OverallFulfillmentStatus`: `3` (*Completed - Centang Hijau*)
  - `FulfillmentProcessPhase`: `3` (*Order Complete*)
  - Seluruh sub-tahapan (`InOrder`, `InSupply`, `InDelivery`, `InTransit`, `InInvoice`, `InAccounting`) bernilai `3` (*Completed*).
- **Karakteristik Visual**: Alur 5 Lane lengkap (`Quotation Processing` → `Order Processing` → `Delivery Processing` → `Invoicing` → `Accounting`). Semua node hijau.

### Kasus 2: `10000002` - Standard Order (OR) - Tahap Persediaan (*In Supply Processing*)
- **Tipe Order**: `OR` (*Standard Order*)
- **Customer**: `Global Retail Corp` (`1000001`)
- **Nilai Penjualan**: `8,900.00 USD`
- **Fulfillment Status**:
  - `OverallFulfillmentStatus`: `2` (*In Processing - Abu-abu*)
  - `FulfillmentProcessPhase`: `2` (*In Supply*)
  - `FulfillmentStatusInOrder`: `3` (*Completed*)
  - `FulfillmentStatusInSupply`: `2` (*In Supply Processing*)
  - `FulfillmentStatusInDelivery` / `Invoice` / `Accounting`: `1` (*Not Yet Processed*)
- **Karakteristik Visual**: Sales Order sudah disetujui, tetapi barang fisik masih dalam proses alokasi / *procurement* di gudang. Alur berhenti di *Delivery Processing*.

### Kasus 3: `10000003` - Rush Order (RO) - Terblokir Limit Kredit (*Credit Limit Exceeded*)
- **Tipe Order**: `RO` (*Rush Order / Pesanan Kilat*)
- **Customer**: `TechSolutions Ltd` (`1000002`)
- **Nilai Penjualan**: `45,200.00 EUR`
- **Fulfillment Status**:
  - `OverallFulfillmentStatus`: `4` (*Overdue Issue - Silang Merah*)
  - `FulfillmentProcessPhase`: `2` (*In Supply Blocked*)
  - `FulfillmentStatusInSupply`: `4` (*Supply Issue - Overdue*)
  - `DeliveryBlockReason`: `01` (**Credit Limit Exceeded**)
- **Karakteristik Visual**: Pesanan kilat yang tidak bisa diterbitkan Surat Jalannya (*Outbound Delivery*) karena limit kredit pelanggan terlampaui. Node menampilkan status *Negative/Blocked*.

### Kasus 4: `10000004` - Standard Order (OR) - Barang Sedang Dikirim (*In Transit*)
- **Tipe Order**: `OR` (*Standard Order*)
- **Customer**: `Domestic US Customer 1` (`1000000`)
- **Nilai Penjualan**: `3,150.00 USD`
- **Fulfillment Status**:
  - `OverallFulfillmentStatus`: `2` (*In Transit - Abu-abu*)
  - `FulfillmentProcessPhase`: `2` (*In Transit*)
  - `OverallTotalDeliveryStatus`: `B` (*Partially Delivered*)
  - `FulfillmentStatusInDelivery`: `3` (*Completed - Picking/Packing selesai*)
  - `FulfillmentStatusInTransit`: `2` (*In Transit - Sedang di perjalanan truk/ekspedisi*)
  - `FulfillmentStatusInInvoice`: `1` (*Not Yet Processed*)
- **Karakteristik Visual**: Lane *Order* dan *Delivery* selesai, namun faktur (*Invoicing*) belum terbentuk karena menunggu konfirmasi tanda terima barang (*Proof of Delivery / POD*).

### Kasus 5: `10000005` - Delivery Free of Charge (FD) - Tertahan Persetujuan (*Pending Approval*)
- **Tipe Order**: `FD` (*Delivery Free of Charge / Sampel Gratis*)
- **Customer**: `Apex Industrial` (`1000003`)
- **Nilai Penjualan**: `0.00 EUR`
- **Fulfillment Status**:
  - `OverallFulfillmentStatus`: `5` (*Due Next Issue - Kuning*)
  - `FulfillmentProcessPhase`: `1` (*In Order Blocked*)
  - `HeaderBillingBlockReason`: `02` (**Check Prices & Terms**)
  - `SalesDocApprovalStatus`: `B` (**Pending Approval**)
  - `FulfillmentStatusInOrder`: `5` (*Order Approval Pending*)
- **Karakteristik Visual**: Order sampel gratis dengan nilai 0 EUR yang tertahan di lane awal (*Order Processing*) karena memerlukan persetujuan manajerial (*Workflow Approval*). Node berstatus *Warning* / *Pending*.

