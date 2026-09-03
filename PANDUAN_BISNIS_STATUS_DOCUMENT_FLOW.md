# 📋 Panduan Bisnis & Operasional: Cara Membaca Status Dokumen Penjualan (SD Document Flow)

> **Untuk Audiens**: Sales Manager, Customer Service, Sales Admin, dan Tim Logistik/Finance.  
> **Tujuan**: Memahami arti status pesanan di dunia nyata, mengetahui potensi kendala operasional, dan menentukan tindakan cepat yang harus diambil tanpa perlu memahami istilah teknis sistem.

---

## 🧭 1. Analogi Sederhana: Membaca 3 Kolom Utama

Bayangkan Anda sedang melacak pesanan belanja online. Di laporan ini ada 3 kolom status yang perlu dibaca bersama-sama:

```
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────────┐
│   1. OVERALL FULFILLMENT     │      2. PROCESS PHASE        │    3. ORDER PROCESSING       │
│   (Kondisi Kesehatan Total)  │     (Ada di Meja Siapa?)     │  (Kondisi Khusus Tahap Order)│
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┤
│ Menjawab:                    │ Menjawab:                    │ Menjawab:                    │
│ "Apakah pesanan ini secara   │ "Saat ini barang sedang      │ "Apakah tahap pembuatan &    │
│ keseluruhan aman, lancar,    │ berproses di departemen      │ persetujuan order-nya sendiri│
│ atau sedang macet?"          │ mana (Sales/Gudang/Finance)?"│ sudah beres atau tertahan?"  │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────────┘
```

> ℹ️ **Catatan urutan kolom di layar**: kolom ke-3 pada tabel aplikasi berjudul **`Process Phase`** dan kolom ke-4 berjudul **`Order Processing`**. Kolom `Order Processing` diisi oleh fungsi `_mapOrderProcessingStatus` dan hanya menilai **tahap order** (`FulfillmentStatusInOrder`), **bukan** kondisi gudang/pengiriman. Tidak ada kolom khusus bernama *Delivery Processing* — status pengiriman muncul sebagai salah satu **nilai** di kolom `Process Phase`.

---

## 🔗 2. Hubungan Antara 3 Kolom dalam Bahasa Sehari-hari

Banyak pengguna bingung ketika melihat kombinasi status yang tampak berbeda. Berikut penjelasannya:

* **Contoh Kasus**: *Process Phase* tertulis **`Delivery Processing`**, tetapi *Overall Fulfillment* menyala **`Merah (Issue)`**.
  * **Artinya di Dunia Nyata**: Pesanan tersebut secara alur bisnis memang adalah pesanan barang fisik yang harus dikirim oleh gudang (*Delivery Processing*). Namun, pesanan tersebut **sedang ditahan/diblokir** (misalnya: limit kredit pelanggan habis, atau ada persetujuan diskon yang belum ditandatangani bos). 
  * **Kesimpulan**: *Overall Fulfillment* adalah "lampu indikator total" yang menggabungkan 5 pos pemeriksaan sekaligus (Persetujuan Sales, Ketersediaan Stok, Pengiriman Gudang, Pembuatan Faktur, dan Pembayaran Piutang). Jika salah satu pos macet, lampu total langsung menyala **Merah**.

* **Contoh Kasus 2**: *Overall Fulfillment* **Merah**, tetapi *Order Processing* **Hijau**.
  * **Artinya di Dunia Nyata**: Tahap pembuatan order-nya sendiri sudah beres dan disetujui, tapi kemacetannya ada di pos lain (gudang, faktur, atau pembayaran). Gunakan kolom `Process Phase` untuk mengetahui pos mana.

### Nilai yang Mungkin Muncul di Kolom `Process Phase`

| Nilai | Artinya |
| :--- | :--- |
| `Inquiry` | Dokumen berupa permintaan harga (pre-sales) |
| `Quotation` | Dokumen berupa surat penawaran harga |
| `Order Processing` | Masih di tahap pembuatan / persetujuan order penjualan |
| `Delivery Processing` | Sudah masuk alur gudang & pengiriman |
| `Invoicing` | Sudah/sedang di tahap pembuatan faktur |
| `Accounting` | Sudah masuk pembukuan keuangan (jurnal / piutang) |
| `Returns` | Dokumen retur barang |

---


## 🚦 3. Arti Warna & Status pada Skenario Dunia Nyata

---

### ⚪ 1. Status Abu-abu / Jam (`1 - Not Yet Processed`)
* **Apa yang Sedang Terjadi di Lapangan?**
  * Sales Admin baru saja selesai mengetik dan menyimpan pesanan di sistem.
  * Dokumen baru berumur hitungan menit/jam dan **belum ada staf gudang yang mulai memproses Surat Jalan (*Delivery Note*)**.
* **Dampaknya**: Normal untuk pesanan yang baru masuk hari ini.

---

### 🔄 2. Status Abu-abu / Panah Proses (`2 - Partially Processed`)
* **Apa yang Sedang Terjadi di Lapangan?**
  * Pesanan sedang **bergerak aktif di lantai operasional**.
  * **Skenario Nyata**:
    1. Surat Jalan sudah dicetak, staf gudang sedang mengambil barang (*picking*) di rak, atau
    2. Barang dikirim sebagian dulu (*Partial Delivery* - misal pesan 100 baru dikirim 50 karena kapasitas truk penuh), atau
    3. Barang sudah sampai di pelanggan, dan bagian Finance sedang menunggu jadwal cetak faktur tagihan mingguan/bulanan.
* **Dampaknya**: Sangat sehat. Operasional sedang berjalan normal.

---

### 🟢 3. Status Hijau Centang (`3 - Completely Processed`)
* **Apa yang Sedang Terjadi di Lapangan?**
  * **Siklus 100% Selesai dan Sempurna (*Order-to-Cash Closed*)**.
  * Barang sudah diterima utuh oleh pelanggan, faktur sudah diterbitkan, dan bagian Finance sudah memverifikasi bahwa pembayaran dari pelanggan sudah masuk ke rekening bank perusahaan.
* **Dampaknya**: Tidak memerlukan tindakan apa pun lagi.

---

### 🔴 4. Status Merah Silang (`4 - Issue : Action Overdue`)
* **Apa yang Sedang Terjadi di Lapangan?**
  * **Pesanan Macet Total / Terkena Pemblokiran Sistem**.
  * **Skenario Nyata**:
    1. **Blokir Kredit (*Credit Block*)**: Pelanggan memiliki tagihan lama yang menunggak atau melebihi plafon kredit, sehingga sistem mengunci pembuatan surat jalan secara otomatis.
    2. **Blokir Pengiriman (*Delivery Block*)**: Alamat pengiriman belum jelas, ada instruksi khusus dari Sales untuk menunda kirim, atau stok fisik di gudang kosong.
    3. **Melewati Batas Waktu (*Overdue*)**: Tanggal janji kirim ke pelanggan (*Requested Delivery Date*) sudah lewat dari hari ini, tetapi barang belum dikeluarkan dari gudang.
    4. **Faktur Macet (*Billing Issue*)**: Faktur sudah dicetak di logistik tapi tertahan dan gagal masuk ke pembukuan Finance.
* **Dampaknya**: **KRITIS**. Pelanggan berpotensi komplain jika tidak segera di-follow up.

---

### 🟡 5. Status Kuning Tanda Seru (`5 - Due Next Issue / Peringatan Dini`)
* **Apa yang Sedang Terjadi di Lapangan?**
  * Pesanan belum macet, tetapi **mendekati tenggat waktu kritis (*Warning*)**.
  * **Skenario Nyata**:
    1. Tanggal kirim yang diminta pelanggan jatuh tempo besok pagi, namun status packing di gudang belum selesai.
    2. Ada pesanan sampel gratis atau diskon khusus yang sedang menunggu persetujuan (*approval workflow*) dari Sales Director.
* **Dampaknya**: Butuh perhatian segera agar tidak berubah menjadi Merah besok.

---

### ⚠️ Catatan Keterbatasan Tampilan Saat Ini

Dua hal berikut adalah kondisi nyata aplikasi yang perlu Anda ketahui agar tidak salah menafsirkan layar:

| Keterbatasan | Detail | Dampak bagi Pengguna |
| :--- | :--- | :--- |
| **Legend hanya berisi 4 status** | Popover *Overall Fulfilment Status Legend* menampilkan `Completely Processed`, `Issue : Action Overdue`, `Partially Processed`, dan `Not Yet Processed`. Status **`Due Next Issue` (kuning) tidak tercantum**, walaupun ikonnya bisa muncul di tabel. | Jika Anda melihat ikon segitiga/tanda seru berwarna kuning-oranye di kolom *Overall Fulfilment*, itu berarti **`Due Next Issue`** — cocokkan dengan penjelasan poin 5 di atas, bukan dengan legend. |
| **Ikon status "Not Yet Processed" berbeda antara tabel dan legend** | Tabel memakai ikon jam-masa-depan (`future`), sedangkan legend memakai ikon riwayat (`history`). Keduanya merujuk status yang sama. | Jangan bingung bila bentuk ikon di legend tidak persis sama dengan yang ada di baris tabel. |
| **Dokumen berstatus kuning tidak muncul di grafik Total Issue** | Grafik hanya mengelompokkan status `Issue : Action Overdue`, `Partially Processed`, dan `Not Yet Processed`. | Untuk memantau peringatan dini (kuning), gunakan kolom *Overall Fulfilment* di tabel, bukan grafik. |

Kedua isu ikon/legend sudah dicatat sebagai *technical debt* di [SESSION_SUMMARY_AND_BACKEND_INTEGRATION_GUIDE.md](file:///SESSION_SUMMARY_AND_BACKEND_INTEGRATION_GUIDE.md) bagian 8 (temuan #15 dan #16).

---


## 📊 4. Tabel Aksi Cepat: Masalah, Penyebab & Siapa yang Dihubungi

Gunakan tabel ini sebagai panduan operasional harian tim Sales & CS:

| Indikator Warna | Kondisi Bisnis Nyata | Kemungkinan Penyebab | Tindakan yang Harus Dilakukan | PIC yang Dihubungi |
| :---: | :--- | :--- | :--- | :--- |
| **🔴 MERAH**<br>*(Issue Overdue)* | Surat Jalan tidak bisa terbit | Plafon kredit customer habis (*Credit Limit Exceeded*) | Minta Finance/AR review pembayaran customer atau ajukan *Credit Release*. | **Finance / AR Collection** |
| **🔴 MERAH**<br>*(Issue Overdue)* | Tanggal kirim terlewat (*Overdue*) | Gudang kehabisan armada truk / barang belum selesai dipacking | Hubungi Supervisor Gudang untuk prioritaskan pengiriman (*Urgent Delivery*). | **Logistik / Kepala Gudang** |
| **🔴 MERAH**<br>*(Issue Overdue)* | Faktur tertahan di sistem | Periode akuntansi belum dibuka / ada selisih harga faktur | Minta tim Accounting melakukan *Release Billing Document* (transaksi VFX3). | **Accounting / Billing Team** |
| **🟡 KUNING**<br>*(Due Next)* | Order tertahan status Approval | Diskon di luar standar atau pesanan sampel gratis | Ingatkan Sales Manager / Director untuk menyetujui pesanan di inbox approval. | **Sales Manager / Approver** |
| **🔄 ABU-ABU**<br>*(Partially)* | Pengiriman baru sebagian | Stok gudang tidak mencukupi untuk kirim sekaligus 100% | Konfirmasi ke customer jadwal kirim sisa barang (*Backorder Batch 2*). | **PPIC / CS Order Desk** |
| **⚪ ABU-ABU**<br>*(Not Yet)* | Order belum diproses gudang | Baru dibuat hari ini / antrean pembuatan Surat Jalan | Biarkan proses normal jika belum melewati batas SLA standar (misal: 1x24 jam). | **Sales Admin** |

---

## ❓ 5. FAQ: Pertanyaan Sering Ditanyakan Pengguna Bisnis

---

### ❓ Tanya 1: *"Kenapa order saya status Process Phase-nya tertulis 'Delivery Processing' padahal sudah selesai lunas dan dibayar?"*
> **Jawab**:  
> Di sistem SAP, kolom **`Process Phase`** menunjukkan **Jalur Alur Bisnis Barang**.  
> Karena pesanan Anda adalah pesanan barang fisik yang harus dikirim dari gudang (bukan jasa/sewa), maka jalur bisnisnya dinamakan **`Delivery Processing`** (*In Supply / Delivery / Transit*).  
> Untuk melihat apakah pesanan itu sudah selesai dibayar atau belum, lihat kolom **`Overall Fulfillment`**: jika centang **🟢 Hijau (`Completely Processed`)**, artinya barang sudah sampai dan pembayaran sudah lunas 100%.

---

### ❓ Tanya 2: *"Apa bedanya status Merah di kolom Overall Fulfillment vs status Merah di kolom Order Processing?"*
> **Jawab**:  
> * **Merah di `Order Processing`**: Masalahnya **ada di tahap order itu sendiri** — misalnya order ditolak (*rejected*), tertahan blokir pengiriman/faktur di level header, atau menunggu persetujuan yang belum turun. Barang belum bisa jalan karena dokumennya sendiri belum "sah".
> * **Merah di `Overall Fulfillment`**: Masalahnya bisa terjadi di **pos mana saja** — bisa karena limit kredit Finance, approval Sales yang belum ditandatangani, kendala di gudang, atau faktur yang gagal masuk pembukuan — meskipun tahap order-nya sendiri sudah beres (hijau).
>
> **Cara praktis membacanya**: lihat `Overall Fulfillment` untuk tahu *apakah ada masalah*, lalu lihat `Process Phase` untuk tahu *di departemen mana masalahnya*, dan `Order Processing` untuk memastikan *apakah akar masalahnya di dokumen order*.


---

### ❓ Tanya 3: *"Kenapa pesanan baru saya langsung berwarna Merah padahal baru dibuat 5 menit yang lalu?"*
> **Jawab**:  
> Kemungkinan besar pelanggan tersebut **terkena Blokir Kredit (*Credit Block*) otomatis** oleh sistem SAP saat order disimpan, karena ada invoice lama yang sudah jatuh tempo 30 hari belum dibayar oleh pelanggan tersebut. Segera koordinasi dengan tim Finance AR.

---

### ❓ Tanya 4: *"Pelanggan saya komplain barangnya belum sampai. Kolom mana yang harus pertama kali saya cek?"*
> **Jawab**:  
> 1. Buka kolom **`Overall Fulfillment`**: Jika merah, lihat alasannya (apakah tertahan kredit atau pengiriman).
> 2. Klik nomor dokumen untuk membuka diagram visual **`Process Flow`**:
>    * Jika kotak Surat Jalan (*Delivery*) berwarna **Abu-abu/In Transit**, artinya barang **sudah dibawa truk ekspedisi** dan sedang dalam perjalanan.
>    * Jika kotak Delivery belum ada, artinya barang **masih antre di gudang**.

---

## 📌 6. Lampiran Referensi Singkat (Khusus Tim IT)

*(Bagian ini hanya untuk referensi teknis jika Sales Admin berkoordinasi dengan Tim IT Support/ABAP):*

* **Status 1 (Not Yet)**: `GBSTK = 'A'`, `LFSTK = 'A'`, `FKSTK = 'A'`.
* **Status 2 (Partially)**: `GBSTK = 'B'`, `LFSTK = 'B'/'C'`, `FKSTK = 'B'/'A'`.
* **Status 3 (Completed)**: `GBSTK = 'C'`, `LFSTK = 'C'`, `FKSTK = 'C'`, `AUGBL IS NOT INITIAL`.
* **Status 4 (Overdue/Block)**: `VBAK-LIFSK <> ''` (Delivery Block), `VBAK-FAKSK <> ''` (Billing Block), `VBAK-CMGST = 'B'` (Credit Block), `ABSTK = 'C'` (Rejection), atau `VDATU < sy-datum`.
* **Status 5 (Due Next Warning)**: `FulfillmentStatus = '5'` (SLA threshold warning).
