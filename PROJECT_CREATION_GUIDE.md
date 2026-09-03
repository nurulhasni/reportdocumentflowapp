# 📘 Panduan Step-by-Step Pembuatan Aplikasi SD Document Flow & Status Report

Dokumen ini berisi panduan teknis komprehensif mengenai arsitektur, tahapan implementasi, dan konfigurasi yang dilakukan dalam membangun aplikasi **SD Document Flow & Status Report** (Custom SAPUI5 Freestyle yang mengadopsi standar SAP F2577 *Track Sales Orders*).

---

## 🏛️ 1. Arsitektur Aplikasi

Aplikasi ini dibangun menggunakan arsitektur **SAPUI5 Freestyle (MVC)** dengan integrasi **Dual Data Sources**:
1. **OData V2 Service (`mainService` / `SD_SOFA`)**: Digunakan sebagai model default (tanpa nama) untuk membaca data analisis dokumen penjualan dari CDS View standar `C_SlsDocFlfllmntAnalyzer`.
2. **OData V4 Service (`rapService` / `zui_sd_docflow`)**: Dipetakan ke model bernama `rapFlowService`, digunakan untuk membaca relasi pohon dokumen (*Document Flow Tree*) dari entity `DocRelations` di ABAP RESTful Application Programming Model (RAP).
3. **Local Fallback Layer (khusus Process Flow)**: Jika OData V4 tidak merespons dalam 600 ms / gagal / mengembalikan data kosong, diagram alur dirender dari `MASTER_DOC_RELATIONS` (10 dokumen hardcoded) atau dari generator sintetis `_getDocRelationsFallback`.

> ⚠️ **Tidak ada fallback untuk daftar header.** Jika OData V2 gagal, tabel dikosongkan dan muncul `MessageBox.error`. Fungsi `_applyLocalFilter` beserta dataset `MASTER_DOC_HEADERS` masih ada di kode tetapi sudah menjadi *dead code* (tidak pernah dipanggil).

```
┌───────────────────────────────────────────────────────────┐
│                     SAPUI5 Application                    │
│                                                           │
│  ┌───────────────────────┐     ┌───────────────────────┐  │
│  │  DynamicPage Header   │     │  Process Flow Dialog  │  │
│  │  - Selection Screen   │     │  - 5 Interactive Lanes│  │
│  │  - Adapt Filters      │     │  - Document Nodes     │  │
│  │  - Value Help Dialogs │     │  - Zoom & Flow Conn   │  │
│  └───────────────────────┘     └───────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  DynamicPage Content                                │  │
│  │  - Card: 6 KPI Stage Tiles (44%) + VizFrame (54%)   │  │
│  │  - Responsive Table (P13n, Growing 100, Sorting)    │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────┬─────────────────────────────┬──────────────┘
               │                             │
    (OData V2 - Read Header)     (OData V4 - Doc Relations)
               ▼                             ▼
┌──────────────────────────────┐ ┌───────────────────────────┐
│ /sap/opu/odata/sap/SD_SOFA/  │ │ /sap/opu/odata4/sap/       │
│ C_SlsDocFlfllmntAnalyzer     │ │ zui_sd_docflow/.../0001/   │
│ ($top=5000)                  │ │ DocRelations               │
└──────────────────────────────┘ └───────────────────────────┘
```

> ℹ️ KPI Tiles dan VizFrame berada di **`f:content`** (di dalam `sap.f.Card`), **bukan** di `DynamicPageHeader`. Hanya panel filter yang berada di header.

---

## 📁 2. Struktur Direktori Project

```
reportdocumentflowapp/
├── webapp/
│   ├── Component.js                  # UIComponent, manifest-driven (TANPA routing)
│   ├── manifest.json                 # Konfigurasi dataSources, models & libraries
│   ├── index.html                    # Entry point container, tema horizon & custom CSS
│   ├── controller/
│   │   └── Main.controller.js        # Controller tunggal (Search, KPI, Chart, Dialog, P13n)
│   └── view/
│       ├── Main.view.xml             # Tampilan utama (Selection, Analytics, Table)
│       └── fragment/
│           ├── ProcessFlowDialog.fragment.xml       # Dialog Process Flow visual
│           ├── DocDetailsPopover.fragment.xml       # Popover detail node dokumen
│           ├── AdaptFiltersDialog.fragment.xml      # Dialog personalisasi filter
│           ├── TableSettingsDialog.fragment.xml     # Dialog personalisasi kolom/sort/group
│           ├── SalesDocValueHelpDialog.fragment.xml # Value help select-options ABAP
│           ├── SoldToPartyValueHelpDialog.fragment.xml # Value help pelanggan
│           └── LegendPopover.fragment.xml           # Popover legend status
├── ui5.yaml                          # Konfigurasi UI5 Tooling Dev Server + proxy SAP
├── package.json                      # npm scripts & devDependency proxy middleware
├── package-lock.json
├── .env
├── screen_stitch.png                 # Screenshot referensi UI
├── reference_sdtracker/              # Salinan referensi aplikasi standar SAP F2577
│   └── localService/mockdata/        # Dataset mock standar SAP
└── *.md                              # 15 file dokumentasi project
```

> ⚠️ **Yang TIDAK ada di project ini** (jangan diasumsikan ada):
> `webapp/i18n/`, `webapp/model/models.js`, `webapp/view/App.view.xml`,
> `webapp/controller/App.controller.js`, `webapp/localService/`, dan konfigurasi `routing`/`targets`.
> Seluruh teks label saat ini ditulis langsung (*inline*) di dalam view dan fragment.
> `manifest.json` masih mendeklarasikan `i18n` walaupun foldernya belum dibuat — lihat
> bagian *Known Issues* di [SESSION_SUMMARY_AND_BACKEND_INTEGRATION_GUIDE.md](file:///SESSION_SUMMARY_AND_BACKEND_INTEGRATION_GUIDE.md).

---

## 🛠️ 3. Tahapan Pembuatan (Step-by-Step)

### **Langkah 1: Konfigurasi `manifest.json` & Dual DataSource**

Konfigurasi nyata di [webapp/manifest.json](file:///webapp/manifest.json) — perhatikan bahwa nama *dataSource* (`rapService`) berbeda dari nama *model* (`rapFlowService`):

```json
"dataSources": {
    "mainService": {
        "uri": "/sap/opu/odata/sap/SD_SOFA/",
        "type": "OData",
        "settings": {
            "odataVersion": "2.0"
        }
    },
    "rapService": {
        "uri": "/sap/opu/odata4/sap/zui_sd_docflow/srvd/sap/zsd_sd_docflow/0001/",
        "type": "OData",
        "settings": {
            "odataVersion": "4.0"
        }
    }
},
"models": {
    "i18n": {
        "type": "sap.ui.model.resource.ResourceModel",
        "settings": {
            "bundleName": "myapp.i18n.i18n"
        }
    },
    "": {
        "dataSource": "mainService",
        "preload": true,
        "settings": {
            "defaultBindingMode": "TwoWay",
            "defaultCountMode": "Inline",
            "refreshAfterChange": false,
            "metadataUrlParams": {
                "sap-value-list": "none"
            }
        }
    },
    "rapFlowService": {
        "dataSource": "rapService",
        "preload": false,
        "settings": {
            "synchronizationMode": "None",
            "operationMode": "Server"
        }
    }
}
```

Catatan penting:
* Tidak ada `localUri` (tidak ada mock server lokal untuk aplikasi ini).
* Tidak ada `autoExpandSelect` maupun `groupId` pada model V4.
* **`reportModel` tidak dideklarasikan di `manifest.json`.** Seluruh model JSON dibuat secara programatik di `onInit` dan diikat ke *view*:
  `reportModel`, `adaptFilterModel`, `conditionModel`, `tableSettingsModel`, `pfModel`, `nodeDetailModel`.

---

### **Langkah 2: Pembuatan Entry Point (`index.html` & `Component.js`)**
1. **`webapp/index.html`**:
   * Menggunakan tema **`sap_horizon`**.
   * Memuat pustaka UI5 yang dibutuhkan (`sap.m`, `sap.f`, `sap.ui.layout`, `sap.ui.core`, `sap.viz`, `sap.suite.ui.microchart`, `sap.suite.ui.commons`).
   * Menginstansiasi `sap.ui.core.ComponentContainer` dengan `manifest: true` dan `resourceRoots` `{"myapp": "./"}`.
   * Memuat blok `<style>` kustom (animasi, styling KPI card, tabel, ProcessFlow, scrollbar).
2. **`webapp/Component.js`**:
   * Mewarisi `sap.ui.core.UIComponent` dengan `metadata: { manifest: "json" }`.
   * `init` **hanya** memanggil `UIComponent.prototype.init.apply(this, arguments)`.
   * **Tidak ada routing.** Aplikasi memakai `rootView` (`myapp.view.Main`) langsung; tidak ada `this.getRouter().initialize()`.

---

### **Langkah 3: Membangun Antarmuka Pengguna (`Main.view.xml`)**
Antarmuka menggunakan pola desain **SAP Fiori Dynamic Page (`sap.f.DynamicPage`)** di dalam `VBox` bersama `sap.f.ShellBar`:

1. **`DynamicPageHeader` (Selection Screen / Filter Panel)**:
   * Layout memakai **`sap.ui.layout.cssgrid.CSSGrid`** dengan `gridTemplateColumns="repeat(auto-fill, minmax(280px, 1fr))"` sehingga grid otomatis mengalir ulang saat filter disembunyikan/ditampilkan.
   * **9 field filter**: SD Document Type (`Select`, saat ini hanya opsi `Sales Order` / kategori `C`), SD Document Number (`MultiInput` + value help select-options + dukungan paste massal), Sold to Party (`Input` + value help), Customer Reference, Document Date (`DatePicker`), Sales Employee, Sales Organization, Distribution Channel, Division.
   * Tombol aksi: **Go**, **Adapt Filters**, **Clear**.
2. **`f:content` (Analytics + Tabel)**:
   * **`OverflowToolbar`** analitik: Details, View By, Legend, Zoom In/Out, Chart Personalization, Full Screen, Chart Type, View Switcher (Hybrid/Chart/Table), More Actions.
   * **`sap.f.Card`** berisi 6 KPI Stage Tiles (`width="44%"`) dan `VizFrame` bar chart (`width="54%"`, `height="280px"`).
   * **`sap.m.Table`** dengan `growing="true"`, `growingThreshold="100"`, `mode="SingleSelectMaster"`, dan **13 kolom**:

| # | Kolom | Kontrol Sel | Field `reportModel` | Default Tampil |
|:--:| :--- | :--- | :--- | :--: |
| 1 | SD Document Number (label dinamis) | `Link` | `sdDocNum` | ✅ |
| 2 | Overall Fulfilment | `core:Icon` | `overallFulfilmentIcon` / `Color` / `Text` | ✅ |
| 3 | Process Phase | `Text` | `processPhase` | ✅ |
| 4 | Order Processing | `core:Icon` | `orderProcessingIcon` / `Color` / `Text` | ✅ |
| 5 | Sales Order | `Text` | `salesOrder` | ❌ |
| 6 | Sold-to Party | `Text` | `soldToParty` | ❌ |
| 7 | Customer Ref | `Text` | `customerRef` | ❌ |
| 8 | Doc Date | `Text` | `docDate` | ❌ |
| 9 | Sales Employee | `Text` | `salesEmployee` | ❌ |
| 10 | Sales Org | `Text` | `salesOrg` | ❌ |
| 11 | Net Value | `Text` | `netValue` | ❌ |
| 12 | Status | `ObjectStatus` | `status` + `statusState` | ❌ |
| 13 | RAP Flow | `Button` "View Flow" | — | ❌ |

   Visibility setiap kolom terikat ke `tableSettingsModel>/colVisibility/*` dan diatur lewat dialog **Table Settings**.

---

### **Langkah 4: Membuat Visual Process Flow Dialog (`ProcessFlowDialog.fragment.xml`)**
Membuat dialog diagram alur dokumen menggunakan `sap.suite.ui.commons.ProcessFlow` (dialog `94vw` × `86vh`, *resizable* & *draggable*):

* **Lanes**: **5 jalur** yang didefinisikan di `_transformAndBindProcessFlow`:

| Kategori | `laneId` | Teks Lane | Ikon |
| :--: | :--- | :--- | :--- |
| `B` | `lane_quotation` | Quotation Processing | `sap-icon://sales-quote` |
| `C` | `lane_order` | Order Processing | `sap-icon://sales-order` |
| `J` (juga `R`, `h`) | `lane_delivery` | Delivery Processing | `sap-icon://shipping-status` |
| `M` | `lane_invoicing` | Invoicing | `sap-icon://sales-order-item` |
| `g` (juga `r`) | `lane_accounting` | Accounting | `sap-icon://customer-financial-fact-sheet` |

  > **Tidak ada lane khusus Inquiry.** Kategori `A` (Inquiry) jatuh ke *default* `lane_order`. Lane yang tidak memiliki dokumen dibuang, lalu sisanya di-indeks ulang (`position: idx`).
* **Nodes**: Setiap dokumen menjadi kartu dengan `state` `Positive`, `Critical`, `Negative`, `PlannedNeutral`, atau `Neutral`. Singkatan node: `QT`, `SO`, `OD`, `GI`, `INV`, `JE`, atau `DOC`. Node dokumen anchor diberi `focused="true"`.
* **Connections**: Garis penghubung otomatis dari `children` yang diambil dari `SubsequentDocs.split(",")`.
* **State Lane**: dihitung sebagai histogram state node di lane tersebut (mengecualikan node berstatus *planned*).
* **Toolbar dialog**: Zoom In, Zoom Out, Fit View, Reload, dan **Copy Flow Summary**.
* Menekan node membuka `DocDetailsPopover.fragment.xml`.

---

### **Langkah 5: Implementasi Controller Logic (`Main.controller.js`)**
Controller menangani:
1. **Inisialisasi (`onInit`)**: Membuat 6 model JSON, mengatur properti `VizFrame` (judul `Total Issue`, `colorPalette: ["#0b557b"]`, legenda mati), lalu memicu `onSearch()` setelah `setTimeout` 100 ms.
2. **Pencarian / Filtering (`onSearch` → `_loadDynamicHeaderData`)**: Membaca 9 nilai filter, menyusun string ringkasan filter, lalu mengirim satu `read("/C_SlsDocFlfllmntAnalyzer")` dengan `$top=5000`.
3. **Pemetaan Status**: `_mapOverallFulfilment`, `_mapProcessPhase`, dan `_mapOrderProcessingStatus` menerjemahkan field CDS menjadi ikon/warna/teks/`statusState` per baris.
4. **Agregasi KPI & Issue**: dihitung *client-side* dalam satu iterasi atas hasil OData (lihat [KPI_AND_ISSUES_CALCULATION_LOGIC.md](file:///KPI_AND_ISSUES_CALCULATION_LOGIC.md)).
5. **Personalisasi Filter (`onAdaptFilters` / `onApplyAdaptFilters`)**: Menyembunyikan/menampilkan field filter beserta pengelompokan `BASIC` / `ORG` / `PARTNER`.
6. **Select-Options Value Help (`onSDDocNumValueHelp`)**: Dialog kondisi ABAP (operator + nilai), token `MultiInput`, dan penanganan *paste* massal dengan *guard flag* `_bProcessingPaste`.
7. **Pengaturan Kolom (`onTableSettingsPress` / `onConfirmTableSettings`)**: Visibility 13 kolom, `Sorter` (sort + grouping), serta filter Process Phase / Status.
8. **Interaksi Process Flow**: 4 entry point — `onDocLinkPress`, `onRowPress`, `onOpenDocFlowPress`, dan `onViewFlowSelectedPress` — semuanya memanggil `_openDocumentFlow`, yang lalu memanggil `_fetchDocRelations` (OData V4, dengan timer fallback 600 ms) dan `_transformAndBindProcessFlow`.
9. **Export (`onExportPress`)**: Membuat CSV `SD_Document_Flow_Report.csv` berisi 11 kolom secara *client-side*.

---

### **Langkah 6: Menjalankan dan Menguji Aplikasi Secara Lokal**

1. Pasang dependency:
   ```bash
   npm install
   ```
2. Atur proxy SAP di `ui5.yaml` (`ui5-middleware-simpleproxy`): `baseUri`, `username`, `password`.
   > ⚠️ Saat ini `ui5.yaml` menyimpan kredensial SAP dalam bentuk *plaintext*. Pindahkan ke variabel lingkungan sebelum project ini dibagikan.
3. Jalankan dev server:
   ```bash
   npm start
   ```
   *(setara dengan `npx @ui5/cli serve`)*
4. Buka browser di alamat: **`http://localhost:8080/index.html`**.

