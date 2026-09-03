# SD - Document Flow & Status Report (SAPUI5)

A SAP Fiori Elements-style **List Report** built as a SAPUI5 **freestyle** application with the SAP Morning Horizon theme (`sap_horizon`), adopting the standard SAP Fiori app **F2577 – Track Sales Orders** as its functional reference.

The app reads **live data from SAP S/4HANA** through two backends:

| Backend | Protocol | Service | Used for |
| :--- | :--- | :--- | :--- |
| `mainService` | OData **V2** | `/sap/opu/odata/sap/SD_SOFA/` → `C_SlsDocFlfllmntAnalyzer` | Header list, KPI tiles, issue chart |
| `rapService` | OData **V4** (ABAP RAP) | `/sap/opu/odata4/sap/zui_sd_docflow/srvd/sap/zsd_sd_docflow/0001/` → `DocRelations` | Process Flow diagram nodes |

---

## 🚀 Key Features

1. **Top SAP ShellBar** (`sap.f.ShellBar`):
   - SAP branding logo and application title `SD - Document Flow & Status Report`.
   - Copilot, search, notifications, and product switcher are disabled.

2. **Fiori DynamicPage Layout**:
   - **Variant Title**: "Selection Screen" styled with Horizon blue link styling and a dropdown indicator (`onVariantPress`).
   - **Snapped Content**: Shows an active filter summary (`Filters (X): ...`) when the filter header is collapsed.
   - **Header Actions**: Share button on the top right.
   - Header is pinnable and `preserveHeaderStateOnScroll` is enabled.

3. **Responsive Filter Area**:
   - Implemented with **`sap.ui.layout.cssgrid.CSSGrid`** using `gridTemplateColumns="repeat(auto-fill, minmax(280px, 1fr))"`, so the grid reflows automatically when filters are hidden or shown via *Adapt Filters*.
   - **9 filter fields**:
     1. **SD Document Type** – `Select`; currently exposes a single option, `Sales Order` (category `C`).
     2. **SD Document Number** – `MultiInput` with tokens, value help, and support for pasting many document numbers at once (ABAP-style select-options).
     3. **Sold to Party** – `Input` with value help.
     4. **Customer Reference**
     5. **Document Date** – `DatePicker` (`yyyy-MM-dd`).
     6. **Sales Employee**
     7. **Sales Organization**
     8. **Distribution Channel**
     9. **Division**
   - **Usability behaviour**:
     - `showClearIcon="true"` on all text inputs for 1-click clearing.
     - The 7 plain text inputs use `liveChange="onSearch"` **and** `submit="onSearch"`, so the search runs while typing and on **Enter**.
     - The `DatePicker` uses `change="onSearch"`.
     - The `MultiInput` uses `valueHelpRequest` / `tokenUpdate` / `change` and deliberately has **no** `submit` attribute, to avoid a double search trigger during multi-paste.
   - Filter buttons: **Go**, **Adapt Filters**, **Clear**.

4. **Document Flow Summary & Total Issue Analytics**:
   - Placed in the DynamicPage **content** area (not the header), inside a `sap.f.Card` (`idChartContainer`).
   - **Analytical View Toolbar**: Details, View By, Legend, Zoom In, Zoom Out, Chart Personalization, Full Screen, Chart Type, a **View Switcher** (`SegmentedButton`: Hybrid / Chart only / Table only), and a **More Actions** overflow button.
     > Several of these are currently `MessageToast` placeholders; Legend, Zoom, Chart Type, Full Screen, and the View Switcher are functional.
   - **Left Section – 6 KPI Summary Tiles (`width="44%"`)**:
     - 🏢 Inquiry, 🚚 Delivery, 📝 Quotation, 🧾 Billing, 💻 Sales Order, 💵 Payment.
     - Values are **computed live** from the OData V2 result set and bound to `reportModel>/kpiData/*` — they are not hardcoded.
   - **Right Section – Total Issue Horizontal Bar Chart (`width="54%"`)**:
     - `sap.viz.ui5.controls.VizFrame`, `vizType="bar"`, `height="280px"`.
     - Chart title `Total Issue`, data labels on, legend off, single-colour palette `#0b557b` — all set programmatically in `onInit`.
     - Six issue categories: `Open Sales Order`, `Open Inquiry Document`, `Open Delivery Document`, `Ready to Goods Issue`, `Pending Approval`, `Not Yet Payment`.

5. **Results Table (`sap.m.Table`)**:
   - **Declarative binding**: template declared in XML (`items="{reportModel>/results}"`).
   - **Pagination**: `growing="true"` with `growingThreshold="100"`.
   - **13 columns**, each with its visibility bound to `tableSettingsModel>/colVisibility/*` and configurable through the **Table Settings** dialog: SD Document Number, Overall Fulfilment, Process Phase, Order Processing, Sales Order, Sold-to Party, Customer Ref, Doc Date, Sales Employee, Sales Org, Net Value, Status, RAP Flow.
     > Columns 1–4 are visible by default; the remaining 9 are opt-in.
   - **Row interaction**: `mode="SingleSelectMaster"`; pressing a row or the document link opens the Process Flow dialog.
   - **Header toolbar**: table title, density switcher (Cozy / Compact), status legend popover, table settings, and an export split menu.
   - **Export**: client-side CSV (`SD_Document_Flow_Report.csv`) with 11 columns.
     > ⚠️ The menu offers both *Export to Excel (\*.xlsx)* and *Export as CSV (\*.csv)*, but both items call `onExportPress`, so both produce a `.csv` file. The export always writes the full result set, ignoring column visibility and any active sort/filter.

6. **Process Flow Dialog** (`ProcessFlowDialog.fragment.xml`):
   - `sap.suite.ui.commons.ProcessFlow` in a resizable, draggable dialog (`94vw` × `86vh`).
   - **5 lanes**: Quotation Processing (`B`), Order Processing (`C`), Delivery Processing (`J`), Invoicing (`M`), Accounting (`g`). Lanes with no documents are removed and the remaining ones are re-indexed.
   - Node states: `Positive`, `Critical`, `Negative`, `PlannedNeutral`, `Neutral`; the anchor document node is focused.
   - Toolbar: Zoom In / Zoom Out / Fit View / Reload, plus **Copy Flow Summary**.
   - Pressing a node opens `DocDetailsPopover.fragment.xml` with the node's details.
   - Data comes from OData V4 `/DocRelations`; if the request does not answer within **600 ms** (or returns empty / fails), a local fallback generator renders the flow instead.

---

## 📂 Project Structure

```
reportdocumentflowapp/
├── package.json                    # npm scripts + ui5-middleware-simpleproxy dependency
├── package-lock.json
├── ui5.yaml                        # UI5 Tooling dev server + SAP proxy configuration
├── .env
├── screen_stitch.png               # UI reference screenshot
├── webapp/
│   ├── index.html                  # Bootstrap, sap_horizon theme, custom CSS & animations
│   ├── manifest.json               # dataSources (V2 + V4), models, libs
│   ├── Component.js                # UIComponent (manifest-driven, no routing)
│   ├── controller/
│   │   └── Main.controller.js      # Search, filters, value help, OData reads, KPI/issue
│   │                               # aggregation, P13n, process flow, CSV export
│   └── view/
│       ├── Main.view.xml           # ShellBar, DynamicPage, CSSGrid filters, Card, Table
│       └── fragment/
│           ├── ProcessFlowDialog.fragment.xml      # ProcessFlow diagram dialog
│           ├── DocDetailsPopover.fragment.xml      # Node detail popover
│           ├── AdaptFiltersDialog.fragment.xml     # Filter personalization
│           ├── TableSettingsDialog.fragment.xml    # Column / sort / group personalization
│           ├── SalesDocValueHelpDialog.fragment.xml    # Select-options value help
│           ├── SoldToPartyValueHelpDialog.fragment.xml # Customer value help
│           └── LegendPopover.fragment.xml          # Overall Fulfilment status legend
├── reference_sdtracker/            # Reference copy of standard SAP Fiori app F2577
│   └── localService/mockdata/      # Standard SAP mock datasets (incl.
│                                   # C_SlsDocFlfllmntAnalyzer.json)
└── *.md                            # 15 documentation files (see below)
```

> ℹ️ There is intentionally **no** `webapp/i18n/`, `webapp/model/`, `App.view.xml`, `App.controller.js`,
> `webapp/localService/`, or routing configuration. All texts are currently inline in the views.
> See the *Known Issues* section of `SESSION_SUMMARY_AND_BACKEND_INTEGRATION_GUIDE.md`.

### Documentation Map

| File | Content |
| :--- | :--- |
| `README.md` | This file — feature and structure overview |
| `PROJECT_CREATION_GUIDE.md` | Step-by-step build guide (architecture, manifest, views, controller) |
| `BACKEND_DATA_RETRIEVAL_LOGIC.md` | OData services, filter mapping, status mapping functions |
| `KPI_AND_ISSUES_CALCULATION_LOGIC.md` | KPI tile and Total Issue chart computation |
| `DUAL_BACKEND_ARCHITECTURE_EXPLANATION.md` | How the V2 and V4 backends coexist |
| `SESSION_SUMMARY_AND_BACKEND_INTEGRATION_GUIDE.md` | Change log, proxy setup, known issues |
| `DEPLOYMENT_AND_LIFECYCLE_GUIDE.md` | Build & deploy to SAP BSP / Fiori Launchpad |
| `document_flow_backend_design.md` | ABAP RAP backend design (`ZUI_SD_DOCFLOW`) |
| `AUDIT_DAN_REKOMENDASI_KODE_BACKEND_RAP.md` | Audit of the RAP backend vs SAP standard |
| `PANDUAN_BISNIS_STATUS_DOCUMENT_FLOW.md` | Business user guide to reading the statuses |
| `LAPORAN_VALIDASI_LOGIKA_DAN_DATA_SALES_ORDER.md` | CDS logic validation against raw data |
| `SAP_CDS_DDL_COMPUTATION_SPECIFICATION.md` | SAP standard CDS DDL reference |
| `SAP_SD_PROCESS_FLOW_CONDITIONS_GUIDE.md` | SAP standard process flow scenarios |
| `SAP_STANDARD_SD_PROCESS_FLOW_CONDITIONS_MASTER.md` | SAP standard condition master catalog |
| `SAP_SD_SPECIAL_BUSINESS_CONDITIONS_CATALOG.md` | SAP standard special business cases |

---

## 💻 How to Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure the SAP backend proxy in `ui5.yaml` (`ui5-middleware-simpleproxy`): `baseUri`, `username`, `password`.
   > ⚠️ `ui5.yaml` currently contains the SAP credentials in plain text. Move them out before sharing or committing this repository.
3. Start the UI5 development server:
   ```bash
   npm start
   ```
   *(equivalent to `npx @ui5/cli serve`)*
4. Open your browser at:
   ```
   http://localhost:8080/index.html
   ```

Without a reachable SAP backend the table stays empty and an error dialog is shown — the app has **no** local mock fallback for the header list.
