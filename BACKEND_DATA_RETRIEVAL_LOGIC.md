# 📊 Panduan Logika Penarikan & Pemetaan Data Backend SAP

Dokumen ini menjelaskan alur teknis, fungsi pemetaan (*mapping logic*), dan arsitektur pengambilan data dari backend SAP S/4HANA / ABAP RAP ke dalam aplikasi **SD Document Flow & Status Report**.

> Referensi baris kode mengacu pada [webapp/controller/Main.controller.js](file:///webapp/controller/Main.controller.js) (5.169 baris). Nomor baris dapat bergeser jika kode diubah.

---

## 🔄 1. Diagram Alur Penarikan Data (Data Flow Pipeline)

```
[ Pengguna Mengisi Filter / Mengetik / Klik 'Go' ]
                    │
                    ▼
          onSearch()  (L2409)
                    │
                    ▼
   _loadDynamicHeaderData(oFilterData)  (L2509)
                    │
                    ▼
   read("/C_SlsDocFlfllmntAnalyzer", { $top: 5000, filters })  (L2566)
                    │
       ┌────────────┴────────────┐
       ▼ (success)               ▼ (error)
_mapProcessPhase(o)        _parseODataError(oError)  (L2479)
_mapOverallFulfilment(o)             │
_mapOrderProcessingStatus(o)         ▼
       │                   MessageBox.error(...)  (L2710)
       │                   /results = []
       │                   /kpiData = semua 0
       │                   /issueData = []
       ▼
[ Update reportModel: /results, /kpiData, /issueData, /tableTitle ]
                    │
                    ▼
[ User klik link / baris / tombol View Flow ]
  onDocLinkPress | onRowPress | onOpenDocFlowPress | onViewFlowSelectedPress
                    │
                    ▼
        _openDocumentFlow(sDocNum)  (L4079)
                    │
                    ▼
        _fetchDocRelations(sDocNum)  (L4138)
                    │
       ┌────────────┴─────────────────────────────┐
       ▼ (V4 menjawab <600ms & tidak kosong)       ▼ (timeout 600ms / kosong / gagal)
bindList("/DocRelations")                   _getDocRelationsFallback()  (L4193)
  filter AnchorSalesDocument EQ               1. cek MASTER_DOC_RELATIONS (10 dok)
       │                                      2. jika tidak ada → fabrikasi node
       └────────────┬─────────────────────────────┘
                    ▼
   _transformAndBindProcessFlow(aRelations)  (L4747)
                    │
                    ▼
 [ Render ProcessFlow: 5 Lanes, Nodes, Connections, Zoom-to-Fit ]
```

> ⚠️ **Tidak ada fallback untuk daftar header.** Fungsi `_applyLocalFilter` (L2991) beserta dataset `MASTER_DOC_HEADERS` masih ada di kode namun **tidak pernah dipanggil** (*dead code*). Ketika OData V2 gagal, tabel dikosongkan dan seluruh KPI di-nol-kan.

---

## 📡 2. Layanan Backend yang Digunakan

### A. OData V2 Service: `SD_SOFA` (Sales Order Fulfillment Analysis)

* **Model UI5**: model tanpa nama (`""`), dataSource `mainService`.
* **Base URI**: `/sap/opu/odata/sap/SD_SOFA/`
* **EntitySet Utama**: `/C_SlsDocFlfllmntAnalyzer`
* **Cara panggil**: satu `oODataModel.read(...)` per pencarian (L2566).
* **`urlParameters`**: `{ "$top": "5000" }` — **tidak** menggunakan `$select`, `$expand`, `$skip`, `$orderby`, maupun `$count`.
* **Fungsi**: Mengambil daftar header dokumen penjualan beserta status pemenuhan (*fulfillment status*) dan fase proses (*process phase*).

#### A.1 Pemetaan 9 Filter UI ke Field & Operator OData (L2523–2563)

| Field Filter di UI | Field OData | Operator | Baris |
| :--- | :--- | :--- | :--- |
| SD Document Type | `SDDocumentCategory` | `EQ` | 2526 |
| SD Document Number (1 token) | `SalesDocument` | `EQ` | 2531 |
| SD Document Number (banyak token) | `SalesDocument` | grup `OR` berisi beberapa `EQ` | 2534–2539 |
| Sold to Party | `SoldToParty` | `Contains` | 2543 |
| Customer Reference | `PurchaseOrderByCustomer` | `Contains` | 2546 |
| Document Date | `SalesDocumentDate` | `EQ` | 2549 |
| **Sales Employee** | **`CreatedByUser`** | `Contains` | 2552 |
| Sales Organization | `SalesOrganization` | `EQ` | 2555 |
| Distribution Channel | `DistributionChannel` | `EQ` | 2558 |
| Division | `OrganizationDivision` | `EQ` | 2561 |

> ⚠️ **Perhatikan baris "Sales Employee"**: filter yang berlabel *Sales Employee* di layar sebenarnya memfilter **`CreatedByUser`** (user pembuat dokumen), bukan field partner fungsi Sales Employee (`VBPA-PARVW = 'VE'`). Ini perilaku nyata kode saat ini.

#### A.2 Properti Response yang Dikonsumsi

Dibaca langsung saat pemetaan baris (L2575–2607):

`SalesDocument`, `SoldToParty`, `SoldToPartyName`, `PurchaseOrderByCustomer`, `SalesDocumentDate`, `CreationDate`, `CreatedByUser`, `SalesOrganization`, `DistributionChannel`, `OrganizationDivision`, `NetAmount`, `TransactionCurrency`, `SDDocumentCategory`, `OverallSDRejectionStatus`, `OverallSDDocumentRejectionStatus`. Entity mentah disimpan utuh sebagai `rawRap`.

Dibaca oleh fungsi-fungsi pemetaan status:

`OverallFulfillmentStatus`, `FulfillmentStatusInOrder`, `FulfillmentStatusInDelivery`, `FulfillmentStatusInInvoice`, `FulfillmentStatusInAccounting`, `FulfillmentProcessPhase`, `HeaderBillingBlockReason`, `OverallSDProcessStatus`, `OverallTotalDeliveryStatus`, `OverallBillingStatus`, `OverallOrdReltdBillgStatus`.

Tidak dikonsumsi controller (walau tersedia di CDS View): `FulfillmentStatusInSupply`, `FulfillmentStatusInTransit`, `TotalNetAmount`, `SoldToPartyFullName`.

> 🐛 **Catatan bug**: L2751 membaca `o.to_OverallFulfillmentStatus.FulfillmentStatus_Text`, tetapi navigation property tersebut tidak pernah di-`$expand`. Akibatnya nilai teks selalu kosong dan kode selalu memakai teks fallback bahasa Inggris yang di-hardcode.

---

### B. OData V4 Service: `zui_sd_docflow` (ABAP RAP Document Flow)

* **Model UI5**: model bernama `rapFlowService`, dataSource `rapService`, `preload: false`.
* **Base URI**: `/sap/opu/odata4/sap/zui_sd_docflow/srvd/sap/zsd_sd_docflow/0001/`
* **EntitySet**: **`/DocRelations`**
* **Cara panggil** (L4158):
  ```javascript
  var oListBinding = oODataModel.bindList("/DocRelations", null, null, [
      new Filter("AnchorSalesDocument", FilterOperator.EQ, sAnchorDoc)
  ]);
  oListBinding.requestContexts().then(...);
  ```
  Tanpa `$select`, tanpa `$expand`, tanpa sorter.
* **Fungsi**: Membaca hubungan hierarki rantai dokumen dari Quotation hingga Accounting Document.
* **Field yang dikonsumsi frontend**:

| Field | Dipakai Untuk |
| :--- | :--- |
| `AnchorSalesDocument` | Kunci filter (dokumen yang diklik) |
| `DocNumber` | `nodeId` (`"node_" + DocNumber`) & judul node |
| `DocCategory` | Penentuan lane & singkatan node (`QT`/`SO`/`OD`/`GI`/`INV`/`JE`) |
| `DocTitle` | Judul node |
| `Status` | Dipetakan ke state UI5 node |
| `StatusText` | `stateText` node |
| `CreatedOnDate` | Baris teks node (fallback `"Created On <tanggal>"`) |
| `CreatedBy` | Detail di `DocDetailsPopover` |
| `SubsequentDocs` | `children` node (di-`split(",")`) |
| `ExtraLine1`, `ExtraLine2` | Dua baris teks node bila tersedia |
| `AdditionalInfo` | Detail di popover |
| `type` | `type` node (default `"Single"`) |

---

## ⚙️ 3. Logika Pemetaan Status (Standard F2577 Mapping Logic)

Ada **tiga** fungsi pemetaan, masing-masing mengisi satu kolom tabel:

| Fungsi | Baris | Kolom Tabel yang Diisi |
| :--- | :--- | :--- |
| `_mapOverallFulfilment` | 2737–2857 | Kolom 2 – Overall Fulfilment (+ `status` & `statusState` kolom 12) |
| `_mapProcessPhase` | 2859–2911 | Kolom 3 – Process Phase |
| `_mapOrderProcessingStatus` | 2913–2969 | Kolom 4 – Order Processing |

---

### A. Pemetaan Overall Fulfilment (`_mapOverallFulfilment`)

**Prioritas 1 — switch langsung pada kode `OverallFulfillmentStatus`** (L2749–2793):

| Kode | Tipe | Icon UI5 | Warna | Teks Legend | `statusState` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`'1'`** | icon | `sap-icon://future` | `#475467` | `Not Yet Processed` | `Information` |
| **`'2'`** | **chevron** | `sap-icon://process` | `#475467` | `Partially Processed` | `Warning` |
| **`'3'`** | icon | `sap-icon://sys-enter-2` | `#2e7d32` | `Completely Processed` | `Success` |
| **`'4'`** | icon | `sap-icon://error` | `#d32f2f` | `Issue : Action Overdue` | `Error` |
| **`'5'`** | icon | `sap-icon://warning2` | `#f39c12` | `Due Next Issue` | `Warning` |

Jika `OverallFulfillmentStatus` tidak tersedia, dievaluasi 5 tingkat fallback berikut secara berurutan:

| Prioritas | Baris | Kondisi | Hasil |
| :--: | :--- | :--- | :--- |
| 2 | 2797–2807 | Baris sudah membawa `overallFulfilmentType` / `overallFulfilmentIcon` sendiri | *pass-through* (jalur data mock) |
| 3 | 2817–2825 | `RejectionStatus` / `OverallSDRejectionStatus` / `OverallSDDocumentRejectionStatus === "C"`, **atau** status `Blocked` / `Delivery Blocked` / `Issue : Action Overdue`, **atau** `DeliveryBlocked === true`, **atau** `BillingBlocked === true` | `Issue : Action Overdue` (`Error`) |
| 4 | 2828–2836 | Status `Completely Processed` / `Completed / Paid`, **atau** fase `Already Payment`, **atau** (`overall === "C"` **dan** `billing === "C"` **dan** fase ≠ `Accounting`) | `Completely Processed` (`Success`) |
| 5 | 2839–2847 | `overall === "B"`, delivery `B`/`C`, billing `B`, status `In Process` / `Partially Processed` / `Partially Blocked` / `Accounting` / `Release`, atau fase `Accounting` | `Partially Processed` (`Warning`) |
| 6 | 2850–2856 | *default* | `Not Yet Processed` (`Information`) |

```javascript
_mapOverallFulfilment: function (o) {
    if (o.OverallFulfillmentStatus) {
        var sCode = String(o.OverallFulfillmentStatus).trim();
        switch (sCode) {
            case "1": return { overallFulfilmentIcon: "sap-icon://future",     overallFulfilmentColor: "#475467", overallFulfilmentText: "Not Yet Processed",      statusState: "Information" };
            case "2": return { overallFulfilmentType: "chevron", overallFulfilmentIcon: "sap-icon://process", overallFulfilmentColor: "#475467", overallFulfilmentText: "Partially Processed", statusState: "Warning" };
            case "3": return { overallFulfilmentIcon: "sap-icon://sys-enter-2", overallFulfilmentColor: "#2e7d32", overallFulfilmentText: "Completely Processed",   statusState: "Success" };
            case "4": return { overallFulfilmentIcon: "sap-icon://error",       overallFulfilmentColor: "#d32f2f", overallFulfilmentText: "Issue : Action Overdue",  statusState: "Error" };
            case "5": return { overallFulfilmentIcon: "sap-icon://warning2",    overallFulfilmentColor: "#f39c12", overallFulfilmentText: "Due Next Issue",          statusState: "Warning" };
        }
    }
    // ... 5 tingkat fallback sesuai tabel di atas
}
```

> ℹ️ Kolom 12 (**Status**) dirender sebagai `<ObjectStatus text="{status}" state="{statusState}"/>`, sehingga nilai state yang mungkin muncul adalah `Success`, `Warning`, `Error`, `Information`, dan `None`.

---

### B. Pemetaan Process Phase (`_mapProcessPhase`)

Fungsi ini mengembalikan **string** fase, dievaluasi berurutan:

**Step 1 — Kategori dokumen (jalan keluar cepat)**
* `SDDocumentCategory === 'A'` → `"Inquiry"`
* `SDDocumentCategory === 'B'` → `"Quotation"`
* `SDDocumentCategory === 'H'` → `"Returns"`

**Step 2 — Deteksi *issue* per tahap (kode `'4'` = ada kendala di tahap tersebut)**
* `FulfillmentStatusInOrder === "4"` → `"Order Processing"`
* `FulfillmentStatusInDelivery === "4"`, atau kategori `J` / `R` → `"Delivery Processing"`
* `FulfillmentStatusInInvoice === "4"`, atau `HeaderBillingBlockReason` bukan `""`/`"00"` → `"Invoicing"`
* `FulfillmentStatusInAccounting === "4"` → `"Accounting"`

**Step 3 — Jalur delivery normal**
* `LFSTK` (`OverallTotalDeliveryStatus`) `B`/`C`, atau `FulfillmentProcessPhase` `'2'`/`'3'` → `"Delivery Processing"`
* **Kecuali** dokumen finansial non-delivery: kategori `L`/`P`/`O`, atau tipe dokumen `DR`/`CR` yang punya status akuntansi → `"Accounting"`

**Step 4 — Default**
* → `"Order Processing"`

**Nilai keluaran yang mungkin**: `Inquiry`, `Quotation`, `Returns`, `Order Processing`, `Delivery Processing`, `Invoicing`, `Accounting`.

> 🐛 **`"Already Payment"` tidak pernah dikembalikan fungsi ini**, meskipun logika KPI Payment (L2639) dan fallback `_mapOverallFulfilment` (L2830) masih mengeceknya. Kondisi tersebut secara efektif *dead*.

---

### C. Pemetaan Order Processing (`_mapOrderProcessingStatus`)

Mengisi kolom 4 (`orderProcessingIcon`, `orderProcessingColor`, `orderProcessingText`).

**Prioritas 1 — switch pada `FulfillmentStatusInOrder`** dengan set ikon/warna yang sama seperti tabel Overall Fulfilment (`'1'`–`'5'`).

**Prioritas 2 — heuristik teks status**
* Mengandung `blocked` atau `overdue` → `sap-icon://error`, `#d32f2f`
* Mengandung `open`, `not yet processed`, atau `not blocked` → `sap-icon://future`, `#475467`
* Mengandung `in process` **dan** fase `Order Processing` / `Invoicing` → `sap-icon://process`, `#475467`

**Default** → `Completed`, `sap-icon://sys-enter-2`, `#2e7d32`.

---

### D. Parsing Error OData (`_parseODataError`, L2479)

Mengekstrak pesan error dari 3 kemungkinan bentuk response:
1. `responseText` berformat JSON → `error.message.value`
2. `responseText` berformat XML → isi tag `<message>`
3. Selain itu → `statusText`

Hasilnya ditampilkan lewat `MessageBox.error` bersama HTTP status code.

---

## 📊 4. Agregasi Metrik KPI & Chart Dinamis

Setiap kali data dokumen berhasil ditarik dari live backend, controller menghitung ulang agregasi secara *client-side* dalam **satu iterasi** atas array hasil (L2615–2665) — tanpa `$apply` / `GroupBy` di sisi server:

1. **KPI Stage Summary** (`reportModel>/kpiData`): `inquiry`, `quotation`, `salesOrder`, `delivery`, `billing`, `payment`.
2. **VizFrame Bar Chart** (`reportModel>/issueData`): `Open Sales Order`, `Open Inquiry Document`, `Open Delivery Document`, `Ready to Goods Issue`, `Pending Approval`, `Not Yet Payment`.

Rumus lengkap beserta batasannya dijelaskan di [KPI_AND_ISSUES_CALCULATION_LOGIC.md](file:///KPI_AND_ISSUES_CALCULATION_LOGIC.md).

---

## 🛡️ 5. Mekanisme Fallback & Karakteristik Performa

### 5.1 Fallback Process Flow (satu-satunya fallback yang aktif)

`_fetchDocRelations` (L4138) memasang timer **600 ms**. Fallback dipicu bila salah satu terjadi: timer habis, hasil V4 kosong, atau request ditolak (L4169–4178).

`_getDocRelationsFallback` (L4193–4745) bekerja dua tahap:
1. **Cek kamus lokal** `MASTER_DOC_RELATIONS` (L1522–2148) — berisi **10 alur dokumen hardcoded**: `70000009`, `70000013`, `2100000098`, `2110000182`, `2110000174`, `2110000176`, `2110000177`, `2110000178`, `2110000179`, `2110000181`.
2. **Jika nomor dokumen tidak terdaftar** → **memfabrikasi** alur: nomor dokumen turunan dibentuk dari hash nomor anchor (prefiks `1511…` untuk quotation, `8110…` delivery, `9110…` invoice, `9000…` journal entry, L4228–4232) dengan offset tanggal +7 / +10 / +14 hari (L4235–4239).

> ⚠️ Karena itu, diagram Process Flow untuk dokumen di luar 10 nomor tersebut **bukan data SAP asli** apabila OData V4 tidak menjawab dalam 600 ms.

### 5.2 Tidak Ada Caching, Batching, atau Debounce

| Aspek | Kondisi Nyata |
| :--- | :--- |
| Caching | Tidak ada. Setiap `onSearch` mengirim ulang `read` dengan `$top=5000`; setiap pembukaan flow mengirim ulang `bindList`. |
| Batching | Tidak ada `$batch` eksplisit. Satu `read` (V2) dan satu `requestContexts()` (V4). |
| Debounce | **Tidak ada.** 7 filter input memakai `liveChange="onSearch"`, sehingga **setiap ketikan** memicu satu request `$top=5000` ke SAP. |
| Paging | Hanya di sisi UI (`growing="true"`, `growingThreshold="100"`). Seluruh 5.000 baris tetap ditarik sekaligus. |
| Guard | `_bProcessingPaste` (guard 500 ms) untuk paste massal; `bCallbackCalled` untuk mencegah callback ganda pada fallback flow. |
