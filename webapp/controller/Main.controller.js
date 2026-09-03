sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/format/NumberFormat",
    "sap/m/DynamicDateRange"
], function (Controller, MessageToast, MessageBox, JSONModel, Fragment, Filter, FilterOperator, Sorter, DateFormat, NumberFormat, DynamicDateRange) {
    "use strict";

    /**
     * Operator catalogue of the "Define Conditions" dialog (ABAP SELECT-OPTIONS / RANGES semantics).
     * The keys MUST stay in sync with the <core:Item> keys of SalesDocValueHelpDialog.fragment.xml.
     *
     * sign      : "I" = Include (OR-ed with the other includes), "E" = Exclude (AND-ed on top)
     * values    : number of value fields required (0 = empty/not empty, 1 = single, 2 = range)
     * filterOp  : sap.ui.model.FilterOperator used to build the OData filter
     * pattern   : token text template ({0} = value1, {1} = value2), Fiori select-options notation
     */
    var CONDITION_OPERATORS = [
        // ---------- Include ----------
        { key: "contains", group: "Include", sign: "I", values: 1, filterOp: FilterOperator.Contains, pattern: "*{0}*" },
        { key: "equal to", group: "Include", sign: "I", values: 1, filterOp: FilterOperator.EQ, pattern: "={0}" },
        { key: "between", group: "Include", sign: "I", values: 2, filterOp: FilterOperator.BT, pattern: "{0}...{1}" },
        { key: "starts with", group: "Include", sign: "I", values: 1, filterOp: FilterOperator.StartsWith, pattern: "{0}*" },
        { key: "ends with", group: "Include", sign: "I", values: 1, filterOp: FilterOperator.EndsWith, pattern: "*{0}" },
        { key: "less than", group: "Include", sign: "I", values: 1, filterOp: FilterOperator.LT, pattern: "<{0}" },
        { key: "less than or equal to", group: "Include", sign: "I", values: 1, filterOp: FilterOperator.LE, pattern: "<={0}" },
        { key: "greater than", group: "Include", sign: "I", values: 1, filterOp: FilterOperator.GT, pattern: ">{0}" },
        { key: "greater than or equal to", group: "Include", sign: "I", values: 1, filterOp: FilterOperator.GE, pattern: ">={0}" },
        { key: "empty", group: "Include", sign: "I", values: 0, filterOp: FilterOperator.EQ, fixedValue: "", pattern: "empty" },

        // ---------- Exclude ----------
        { key: "does not contain", group: "Exclude", sign: "E", values: 1, filterOp: FilterOperator.NotContains, pattern: "!(*{0}*)" },
        { key: "not equal to", group: "Exclude", sign: "E", values: 1, filterOp: FilterOperator.NE, pattern: "!(={0})" },
        { key: "not between", group: "Exclude", sign: "E", values: 2, filterOp: FilterOperator.NB, pattern: "!({0}...{1})" },
        { key: "does not start with", group: "Exclude", sign: "E", values: 1, filterOp: FilterOperator.NotStartsWith, pattern: "!({0}*)" },
        { key: "does not end with", group: "Exclude", sign: "E", values: 1, filterOp: FilterOperator.NotEndsWith, pattern: "!(*{0})" },
        // "not less than" === ">=" etc. -> mapped to the positive operator so the OData $filter stays simple
        { key: "not less than", group: "Exclude", sign: "E", values: 1, filterOp: FilterOperator.GE, pattern: "!(<{0})" },
        { key: "not less than or equal to", group: "Exclude", sign: "E", values: 1, filterOp: FilterOperator.GT, pattern: "!(<={0})" },
        { key: "not greater than", group: "Exclude", sign: "E", values: 1, filterOp: FilterOperator.LE, pattern: "!(>{0})" },
        { key: "not greater than or equal to", group: "Exclude", sign: "E", values: 1, filterOp: FilterOperator.LT, pattern: "!(>={0})" },
        { key: "not empty", group: "Exclude", sign: "E", values: 0, filterOp: FilterOperator.NE, fixedValue: "", pattern: "!(empty)" }
    ];

    var DEFAULT_CONDITION_OPERATOR = "equal to";

    /**
     * The 10 buckets of the "Total Issue" chart, in business order.
     * key  MUST match ZR_SD_DocFlowSummary-BucketKey (SummaryType 'ISSUE', SortOrder 10..100)
     * text is the fallback label, the backend BucketText wins when it is filled.
     */
    var ISSUE_BUCKETS = [
        { key: "OPEN_INQUIRY", text: "Open Inquiry Document" },
        { key: "REJECTED_INQUIRY", text: "Rejected Inquiry" },
        { key: "OPEN_QUOTATION", text: "Open Quotation Document" },
        { key: "REJECTED_QUOTATION", text: "Rejected Quotation" },
        { key: "OPEN_SALES_ORDER", text: "Open Sales Order" },
        { key: "REJECTED_SALES_ORDER", text: "Rejected Sales Order" },
        { key: "UNPICKED_DELIVERY", text: "Unpicked Delivery" },
        { key: "READY_TO_GOODS_ISSUE", text: "Ready to Goods Issue" },
        { key: "NO_JOURNAL_ENTRY", text: "No Journal Entry Created" },
        { key: "NOT_YET_PAYMENT", text: "Not Yet Payment" }
    ];

    /** ZR_SD_DocFlowSummary-BucketKey (SummaryType 'TOTAL') -> reportModel>/kpiData property. */
    var TOTAL_BUCKET_TO_KPI = {
        "TOTAL_INQUIRY": "inquiry",
        "TOTAL_QUOTATION": "quotation",
        "TOTAL_SALES_ORDER": "salesOrder",
        "TOTAL_DELIVERY": "delivery",
        "TOTAL_BILLING": "billing",
        "TOTAL_PAYMENT": "payment"
    };

    /**
     * Substring operators keep their meaning on the RAP summary query by being sent as
     * EQ / NE with a wildcard value. ZCL_SD_DOCFLOW_SUMMARY turns EQ + '*' into CP and
     * NE + '*' into NP, which is exactly ABAP select-options semantics.
     */
    var SUMMARY_WILDCARD_PATTERN = {
        "contains": "*{0}*",
        "starts with": "{0}*",
        "ends with": "*{0}",
        "does not contain": "*{0}*",
        "does not start with": "{0}*",
        "does not end with": "*{0}"
    };

    /** IsTruncated codes of ZR_SD_DocFlowSummary -> user message. */
    var SUMMARY_FLAG_TEXT = {
        "X": "Summary chart: cakupan dokumen dipotong pada batas backend, angka bisa lebih rendah dari kenyataan.",
        "A": "Summary chart: sebagian dokumen tidak dihitung karena otorisasi organisasi penjualan / shipping point / company code kurang.",
        "F": "Summary chart: filter ini tidak dapat diproses backend summary, seluruh angka ditampilkan 0."
    };

    /** The 10 issue buckets with count 0 - chart placeholder and error fallback. */
    function buildEmptyIssueData() {
        return ISSUE_BUCKETS.map(function (oBucket, i) {
            return {
                bucketKey: oBucket.key,
                issueType: oBucket.text,
                count: 0,
                sortOrder: (i + 1) * 10
            };
        });
    }

    /** The 6 KPI tiles with value 0. */
    function buildEmptyKpiData() {
        return {
            inquiry: 0,
            quotation: 0,
            salesOrder: 0,
            delivery: 0,
            billing: 0,
            payment: 0
        };
    }

    /** Include operator -> matching Exclude operator, used when parsing "!(...)" token notation. */
    var EXCLUDE_TWIN = {
        "contains": "does not contain",
        "equal to": "not equal to",
        "between": "not between",
        "starts with": "does not start with",
        "ends with": "does not end with",
        "less than": "not less than",
        "less than or equal to": "not less than or equal to",
        "greater than": "not greater than",
        "greater than or equal to": "not greater than or equal to",
        "empty": "not empty"
    };

    return Controller.extend("myapp.controller.Main", {

        onInit: function () {
            // Main report model (Live SAP First: Initialized empty with busy state)
            // kpiData + issueData berasal dari RAP /DocFlowSummary (bukan lagi dihitung
            // di client dari /C_SlsDocFlfllmntAnalyzer), lihat _loadDocFlowSummary.
            var oData = {
                results: [],
                tableTitle: "Sales Order Documents (0)",
                tableBusy: true,
                chartBusy: true,
                kpiData: buildEmptyKpiData(),
                issueData: buildEmptyIssueData()
            };
            var oModel = new JSONModel(oData);
            this.getView().setModel(oModel, "reportModel");

            // Adapt Filters Model (9 Core Verified Fields)
            var oAdaptFilterModel = new JSONModel({
                sdDocNumLabel: "Sales Order Number",
                sdDocNumPlaceholder: "e.g. 5000001 / 2110000176",
                showValues: false,
                selectedGroup: "ALL",
                fieldVisibility: {
                    sdDocType: true,
                    salesOrg: true,
                    sdDocNum: true,
                    soldToParty: true,
                    customerRef: true,
                    docDate: true,
                    salesEmployee: true,
                    distChannel: true,
                    division: true
                },
                fieldValues: {
                    sdDocType: "C",
                    salesOrg: "",
                    sdDocNum: "",
                    soldToParty: "",
                    customerRef: "",
                    docDate: "",
                    // sap.m.DynamicDateRange value object: { operator: "TODAY", values: [...] }
                    docDateRange: null,
                    salesEmployee: "",
                    distChannel: "",
                    division: ""
                },
                fields: [
                    { key: "sdDocType", label: "Sales Document Type", group: "BASIC", visible: true, value: "C", placeholder: "Choose SD Document Type" },
                    { key: "salesOrg", label: "Sales Organization", group: "ORG", visible: true, value: "", placeholder: "e.g. 1000" },
                    { key: "sdDocNum", label: "SD Document Number", group: "BASIC", visible: true, value: "", placeholder: "e.g. 2110000176" },
                    { key: "soldToParty", label: "Sold-to Party", group: "PARTNER", visible: true, value: "", placeholder: "e.g. 100001" },
                    { key: "customerRef", label: "Customer Reference", group: "BASIC", visible: true, value: "", placeholder: "e.g. PO-998877" },
                    { key: "docDate", label: "Document Date", group: "BASIC", visible: true, value: "", placeholder: "e.g. Today / Last 7 Days" },
                    { key: "salesEmployee", label: "Sales Employee", group: "PARTNER", visible: true, value: "", placeholder: "e.g. EMP-001" },
                    { key: "distChannel", label: "Distribution Channel", group: "ORG", visible: true, value: "", placeholder: "e.g. 10" },
                    { key: "division", label: "Division", group: "ORG", visible: true, value: "", placeholder: "e.g. 00" }
                ]
            });
            this.getView().setModel(oAdaptFilterModel, "adaptFilterModel");

            // Define Conditions Model (ABAP Select-Options)
            // operator/value1/value2 = the condition currently being typed in the dialog input row
            // conditions             = committed conditions ("Add" pressed)
            // tokens                 = token representation shared by the FilterBar MultiInput and the dialog Tokenizer
            var oConditionModel = new JSONModel({
                operator: DEFAULT_CONDITION_OPERATOR,
                value1: "",
                value2: "",
                valueCount: this._getOperatorConfig(DEFAULT_CONDITION_OPERATOR).values,
                conditions: [],
                tokens: []
            });
            this.getView().setModel(oConditionModel, "conditionModel");

            // Attach paste event listener to MultiInput
            this._bProcessingPaste = false;
            var that = this;
            this.getView().addEventDelegate({
                onAfterRendering: function () {
                    var oMultiInput = that.getView().byId("idSDDocNum");
                    if (oMultiInput && !oMultiInput._bPasteAttached) {
                        oMultiInput._bPasteAttached = true;
                        var oDom = oMultiInput.getDomRef("inner") || oMultiInput.getDomRef();
                        if (oDom) {
                            oDom.addEventListener("paste", function (e) {
                                var sClipboardData = (e.clipboardData || window.clipboardData).getData("text");
                                if (sClipboardData && sClipboardData.trim()) {
                                    e.preventDefault();
                                    e.stopImmediatePropagation();
                                    that._syncPasteToTokensAndConditions(sClipboardData.trim());
                                }
                            });
                        }
                    }
                }
            });

            // Table Settings / Personalization Model (Default 4 columns per Image 2)
            var oTableSettingsModel = new JSONModel({
                colVisibility: {
                    sdDocNum: true,
                    overallFulfilment: true,
                    processPhase: true,
                    orderProcessing: true,
                    salesOrder: false,
                    soldToParty: false,
                    customerRef: false,
                    docDate: false,
                    salesEmployee: false,
                    salesOrg: false,
                    netValue: false,
                    status: false,
                    rapFlow: false
                },
                columns: [
                    { key: "sdDocNum", label: "SD Document Number", description: "SD Document Identifier", visible: true },
                    { key: "overallFulfilment", label: "Overall Fulfilment", description: "Overall Fulfilment Status", visible: true },
                    { key: "processPhase", label: "Process Phase", description: "Current Business Process Phase", visible: true },
                    { key: "orderProcessing", label: "Order Processing", description: "Order Processing Execution Status", visible: true },
                    { key: "salesOrder", label: "Sales Order", description: "Sales Document Number", visible: false },
                    { key: "soldToParty", label: "Sold-to Party", description: "Customer / Sold to Party", visible: false },
                    { key: "customerRef", label: "Customer Ref", description: "Purchase Order Reference", visible: false },
                    { key: "docDate", label: "Doc Date", description: "Document Creation Date", visible: false },
                    { key: "salesEmployee", label: "Sales Employee", description: "Sales Representative", visible: false },
                    { key: "salesOrg", label: "Sales Org", description: "Sales Organization Code", visible: false },
                    { key: "netValue", label: "Net Value", description: "Total Document Net Amount", visible: false },
                    { key: "status", label: "Status", description: "Document Rejection / Release Status", visible: false },
                    { key: "rapFlow", label: "RAP Flow", description: "Visual Process Flow Action", visible: false }
                ],
                sortKey: "sdDocNum",
                sortDescending: 0, // 0 = Ascending, 1 = Descending
                sortOptions: [
                    { key: "sdDocNum", label: "SD Document Number" },
                    { key: "processPhase", label: "Process Phase" },
                    { key: "salesOrder", label: "Sales Order" },
                    { key: "netValueNum", label: "Net Value" },
                    { key: "docDate", label: "Document Date" }
                ],
                filterPhase: "ALL",
                phaseOptions: [
                    { key: "ALL", label: "All Process Phases" },
                    { key: "Accounting", label: "Accounting" },
                    { key: "Delivery Processing", label: "Delivery Processing" },
                    { key: "Already Payment", label: "Already Payment" },
                    { key: "Order Processing", label: "Order Processing" }
                ]
            });
            this.getView().setModel(oTableSettingsModel, "tableSettingsModel");

            // Process Flow Model for RAP Document Relations
            var oPFModel = new JSONModel({
                dialogTitle: "Document Flow",
                anchorDoc: "",
                anchorCategoryText: "Sales Order",
                overallStatusText: "In Process",
                overallStatusState: "Information",
                totalNodes: 0,
                plannedNodes: 0,
                busy: false,
                // false = 1 node per dokumen (tampilan standar F2577, cabang turun ke row berikutnya)
                // true  = node sejenis dalam 1 lane digabung (Aggregated) sehingga seluruh alur pasti 1 baris (Row 0)
                compactMode: false,
                lastLoadedAt: "",
                lanes: [],
                nodes: []
            });
            this.getView().setModel(oPFModel, "pfModel");

            // OData V2 model (SD_SOFA) is automatically loaded from manifest as unnamed model ""
            // OData V4 model (rapFlowService) is automatically loaded from manifest for Process Flow

            // Node Detail Model for popover
            var oNodeDetailModel = new JSONModel({});
            this.getView().setModel(oNodeDetailModel, "nodeDetailModel");

            // Configure VizFrame Horizontal Bar Chart properties
            var oVizFrame = this.getView().byId("idVizFrame");
            if (oVizFrame) {
                oVizFrame.setVizProperties({
                    plotArea: {
                        dataLabel: {
                            visible: true
                        },
                        colorPalette: ["#0b557b"],
                        primaryScale: {
                            fixedRange: true,
                            minValue: 0,
                            maxValue: 10
                        }
                    },
                    interaction: {
                        zoom: {
                            enablement: "disabled"
                        }
                    },
                    title: {
                        visible: true,
                        text: "Total Issue"
                    },
                    valueAxis: {
                        title: {
                            visible: false
                        }
                    },
                    categoryAxis: {
                        title: {
                            visible: false
                        },
                        label: {
                            maxWidth: 220
                        }
                    },
                    legend: {
                        visible: false
                    }
                });
            }

            var that = this;
            // Trigger Live SAP OData search immediately on init
            setTimeout(function () {
                that.onSearch();
            }, 100);
        },

        _getDocTypeLabel: function (sKey) {
            switch (sKey) {
                case "A": return "Inquiry";
                case "B": return "Quotation";
                case "C": return "Sales Order";
                case "J": return "Delivery";
                case "M": return "Billing";
                default: return "Sales Order";
            }
        },

        onSDDocTypeChange: function (oEvent) {
            var sKey = oEvent ? oEvent.getParameter("selectedItem").getKey() : (this.getView().byId("idSDDocType") ? this.getView().byId("idSDDocType").getSelectedKey() : "C");
            var oAdaptFilterModel = this.getView().getModel("adaptFilterModel");
            var sLabel = "Sales Order Number";
            var sPlaceholder = "e.g. 5000001 / 2110000176";

            switch (sKey) {
                case "A":
                    sLabel = "Inquiry Document Number";
                    sPlaceholder = "e.g. 10000001 / 2110000186";
                    break;
                case "B":
                    sLabel = "Quotation Document Number";
                    sPlaceholder = "e.g. 451010001 / 2110000187";
                    break;
                case "C":
                    sLabel = "Sales Order Number";
                    sPlaceholder = "e.g. 5000001 / 2110000176";
                    break;
                case "J":
                    sLabel = "Delivery Document Number";
                    sPlaceholder = "e.g. 80000192 / 520000245";
                    break;
                case "M":
                    sLabel = "Billing Document Number";
                    sPlaceholder = "e.g. 90000142 / 821000288";
                    break;
                default:
                    sLabel = "Sales Order Number";
                    sPlaceholder = "e.g. 5000001 / 2110000176";
                    break;
            }

            if (oAdaptFilterModel) {
                oAdaptFilterModel.setProperty("/sdDocNumLabel", sLabel);
                oAdaptFilterModel.setProperty("/sdDocNumPlaceholder", sPlaceholder);
                oAdaptFilterModel.setProperty("/fieldValues/sdDocType", sKey);
            }

            // Immediately trigger search to filter dataset according to selected document type
            this.onSearch();
        },

        // ==========================================
        // DOCUMENT DATE (sap.m.DynamicDateRange) HELPERS
        // ==========================================

        /**
         * Normalizes any date-ish value (JS Date / UniversalDate / ISO string) to a JS Date.
         */
        _toJSDate: function (vDate) {
            if (!vDate) return null;
            if (vDate instanceof Date) {
                return isNaN(vDate.getTime()) ? null : vDate;
            }
            if (typeof vDate.getJSDate === "function") {
                return this._toJSDate(vDate.getJSDate());
            }
            var oParsed = new Date(vDate);
            return isNaN(oParsed.getTime()) ? null : oParsed;
        },

        /**
         * OData V2 formats Edm.DateTime filter values in UTC. The calendar day picked by the user
         * is a *local* day, so it must be shifted to the matching UTC instant, otherwise a
         * timezone offset (e.g. UTC+7) moves the filter one day backwards.
         */
        _toUTCBoundary: function (vDate, bEndOfDay) {
            var oDate = this._toJSDate(vDate);
            if (!oDate) return null;
            return new Date(Date.UTC(
                oDate.getFullYear(),
                oDate.getMonth(),
                oDate.getDate(),
                bEndOfDay ? 23 : 0,
                bEndOfDay ? 59 : 0,
                bEndOfDay ? 59 : 0,
                bEndOfDay ? 999 : 0
            ));
        },

        /**
         * Returns the current DynamicDateRange value, preferring the live control over the model.
         */
        _getDocDateRangeValue: function () {
            var oView = this.getView();
            var oDDR = oView.byId("idDocDate");
            var oValue = (oDDR && typeof oDDR.getValue === "function") ? oDDR.getValue() : null;
            if (!oValue || !oValue.operator || oValue.operator === "PARSEERROR") {
                var oAdaptFilterModel = oView.getModel("adaptFilterModel");
                oValue = oAdaptFilterModel ? oAdaptFilterModel.getProperty("/fieldValues/docDateRange") : null;
            }
            return (oValue && oValue.operator && oValue.operator !== "PARSEERROR") ? oValue : null;
        },

        /**
         * Resolves a sap.m.DynamicDateRangeValue into concrete filter boundaries.
         * @returns {object|null} { operator, from, to, text } - from/to are UTC normalized JS Dates
         */
        _resolveDocDateRange: function (oValue) {
            if (!oValue || !oValue.operator || oValue.operator === "PARSEERROR") return null;

            var aDates;
            try {
                aDates = DynamicDateRange.toDates(oValue);
            } catch (oErr) {
                console.error("Unable to resolve Document Date range:", oErr);
                return null;
            }
            if (!aDates || aDates.length === 0) return null;

            var sOperator = oValue.operator;
            var oStart = this._toJSDate(aDates[0]);
            var oEnd = this._toJSDate(aDates.length > 1 ? aDates[1] : aDates[0]);

            var oFrom = null;
            var oTo = null;
            if (sOperator === "FROM" || sOperator === "FROMDATETIME") {
                oFrom = this._toUTCBoundary(oStart || oEnd, false);
            } else if (sOperator === "TO" || sOperator === "TODATETIME") {
                oTo = this._toUTCBoundary(oEnd || oStart, true);
            } else {
                oFrom = this._toUTCBoundary(oStart || oEnd, false);
                oTo = this._toUTCBoundary(oEnd || oStart, true);
            }

            if (!oFrom && !oTo) return null;

            var oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd", UTC: true });
            var sText;
            if (oFrom && oTo) {
                var sFrom = oDateFormat.format(oFrom);
                var sTo = oDateFormat.format(oTo);
                sText = (sFrom === sTo) ? sFrom : (sFrom + " - " + sTo);
            } else if (oFrom) {
                sText = ">= " + oDateFormat.format(oFrom);
            } else {
                sText = "<= " + oDateFormat.format(oTo);
            }

            return {
                operator: sOperator,
                from: oFrom,
                to: oTo,
                text: sText
            };
        },

        /**
         * All DynamicDateRange instances of the Document Date filter (filter bar + Adapt Filters dialog).
         */
        _getDocDateRangeControls: function () {
            var oView = this.getView();
            return ["idDocDate", "idDocDateAdapt"].map(function (sId) {
                return oView.byId(sId);
            }).filter(function (oCtrl) {
                return !!oCtrl && typeof oCtrl.setValue === "function";
            });
        },

        /**
         * Mirrors a DynamicDateRange value to every other Document Date control and to the model.
         * setValue() does not fire the change event, so no event loop can occur here.
         */
        _syncDocDateRangeControls: function (oValue, oSourceControl) {
            this._getDocDateRangeControls().forEach(function (oDDR) {
                if (oSourceControl && oDDR === oSourceControl) return;
                // Note: setValue(undefined) is required to also clear the inner input,
                // setValue(null) keeps the previously displayed text.
                oDDR.setValue(oValue ? oValue : undefined);
                if (typeof oDDR.setValueState === "function") {
                    oDDR.setValueState("None");
                }
            });
        },

        /**
         * Writes the current DynamicDateRange value plus its readable text into adaptFilterModel.
         */
        _storeDocDateRangeValue: function (oValue) {
            var oAdaptFilterModel = this.getView().getModel("adaptFilterModel");
            if (!oAdaptFilterModel) return "";

            var oResolved = oValue ? this._resolveDocDateRange(oValue) : null;
            var sText = oResolved ? oResolved.text : "";

            oAdaptFilterModel.setProperty("/fieldValues/docDateRange", oValue || null);
            oAdaptFilterModel.setProperty("/fieldValues/docDate", sText);

            var aFields = oAdaptFilterModel.getProperty("/fields") || [];
            aFields.forEach(function (f) {
                if (f.key === "docDate") f.value = sText;
            });
            oAdaptFilterModel.setProperty("/fields", aFields);

            return sText;
        },

        /**
         * Clears the Document Date filter (controls + model), used by Clear / Reset.
         */
        _resetDocDateRangeControls: function () {
            this._getDocDateRangeControls().forEach(function (oDDR) {
                oDDR.setValue(undefined);
                if (typeof oDDR.setValueState === "function") {
                    oDDR.setValueState("None");
                }
            });
            this._storeDocDateRangeValue(null);
        },

        /**
         * Keeps the adaptFilterModel in sync (value object + readable text) and re-runs the search
         * when the change originates from the filter bar.
         */
        onDocDateChange: function (oEvent) {
            var oSource = oEvent ? oEvent.getSource() : null;
            var bValid = oEvent ? oEvent.getParameter("valid") !== false : true;
            var oValue = oEvent ? oEvent.getParameter("value") : null;

            if (!bValid) {
                if (oSource && typeof oSource.setValueState === "function") {
                    oSource.setValueState("Error");
                    oSource.setValueStateText("Please enter a valid date or date range.");
                }
                return;
            }
            if (oSource && typeof oSource.setValueState === "function") {
                oSource.setValueState("None");
            }

            if (!oValue || !oValue.operator) {
                oValue = null;
            }

            this._storeDocDateRangeValue(oValue);
            this._syncDocDateRangeControls(oValue, oSource);

            // Inside the Adapt Filters dialog the search is triggered by the OK button only
            var bFromAdaptDialog = !!(oSource && oSource.getId && oSource.getId().indexOf("idDocDateAdapt") !== -1);
            if (!bFromAdaptDialog) {
                this.onSearch();
            }
        },

        onSearch: function () {
            var oView = this.getView();
            var that = this;
            var oAdaptFilterModel = oView.getModel("adaptFilterModel");
            var oFieldValues = oAdaptFilterModel ? (oAdaptFilterModel.getProperty("/fieldValues") || {}) : {};
            var oVisibility = oAdaptFilterModel ? (oAdaptFilterModel.getProperty("/fieldVisibility") || {}) : {};

            var sDocType = (oView.byId("idSDDocType") && oVisibility.sdDocType !== false) ? oView.byId("idSDDocType").getSelectedKey() : (oFieldValues.sdDocType || "C");

            var getVal = function (sId, sKey) {
                if (oVisibility[sKey] === false) {
                    return ""; // If hidden, do not filter by this field
                }
                // For sdDocNum: ALWAYS read from the conditionModel (Define Conditions dialog / tokens).
                // NEVER use MultiInput.getValue() — it returns raw text that causes race conditions.
                if (sKey === "sdDocNum") {
                    return that._getConditionsDisplayText();
                }
                var oCtrl = oView.byId(sId);
                if (oCtrl && typeof oCtrl.getValue === "function") {
                    var sVal = oCtrl.getValue();
                    if (typeof sVal === "string" && sVal.trim() !== "") {
                        return sVal.trim();
                    }
                }
                return (oFieldValues[sKey] || "").trim();
            };

            // Document Date is handled by sap.m.DynamicDateRange (object value, not a string)
            var oDocDateRange = (oVisibility.docDate === false) ? null : this._resolveDocDateRange(this._getDocDateRangeValue());

            var oFilterData = {
                sdDocType: sDocType,
                sdDocNum: getVal("idSDDocNum", "sdDocNum"),
                // Full select-options payload for SalesDocument (operator aware, see _buildConditionFilters)
                sdDocNumConditions: (oVisibility.sdDocNum === false) ? [] : this._getActiveConditions(),
                soldToParty: getVal("idSoldToParty", "soldToParty"),
                customerRef: getVal("idCustomerRef", "customerRef"),
                docDate: oDocDateRange ? oDocDateRange.text : "",
                docDateFrom: oDocDateRange ? oDocDateRange.from : null,
                docDateTo: oDocDateRange ? oDocDateRange.to : null,
                salesEmployee: getVal("idSalesEmployee", "salesEmployee"),
                salesOrg: getVal("idSalesOrg", "salesOrg"),
                distChannel: getVal("idDistChannel", "distChannel"),
                division: getVal("idDivision", "division")
            };

            // Update snapped filter summary text
            var aActiveFilters = [];
            var sDocTypeLabel = this._getDocTypeLabel(oFilterData.sdDocType);
            aActiveFilters.push("Type: " + sDocTypeLabel);
            if (oFilterData.sdDocNum) aActiveFilters.push("Doc Num: " + oFilterData.sdDocNum);
            if (oFilterData.soldToParty) aActiveFilters.push("Sold to Party: " + oFilterData.soldToParty);
            if (oFilterData.customerRef) aActiveFilters.push("Customer Ref: " + oFilterData.customerRef);
            if (oFilterData.docDate) aActiveFilters.push("Date: " + oFilterData.docDate);
            if (oFilterData.salesEmployee) aActiveFilters.push("Employee: " + oFilterData.salesEmployee);
            if (oFilterData.salesOrg) aActiveFilters.push("Sales Org: " + oFilterData.salesOrg);
            if (oFilterData.distChannel) aActiveFilters.push("Dist. Channel: " + oFilterData.distChannel);
            if (oFilterData.division) aActiveFilters.push("Division: " + oFilterData.division);

            var sSummary = "Filters (" + aActiveFilters.length + "): " + aActiveFilters.join(" | ");
            var oSummaryText = oView.byId("idFilterSummary");
            if (oSummaryText) {
                oSummaryText.setText(sSummary);
            }

            // Live SAP First: Directly trigger live SAP query with busy indicators.
            // Tabel (OData V2) dan summary (RAP OData V4) adalah dua request independen:
            // kegagalan salah satu tidak boleh menggagalkan yang lain.
            this._loadDynamicHeaderData(oFilterData);
            this._loadDocFlowSummary(oFilterData);
        },

        _parseODataError: function (oError) {
            var sMsg = "Gagal terhubung ke SAP Backend.";
            var iCode = (oError && (oError.statusCode || oError.status)) || "";
            if (oError && oError.responseText) {
                try {
                    var oParsed = JSON.parse(oError.responseText);
                    if (oParsed && oParsed.error && oParsed.error.message && oParsed.error.message.value) {
                        sMsg = oParsed.error.message.value;
                    }
                } catch (e) {
                    var match = oError.responseText.match(/<message[^>]*>([^<]+)<\/message>/i);
                    if (match && match[1]) {
                        sMsg = match[1];
                    } else if (oError.statusText) {
                        sMsg = oError.statusText;
                    } else {
                        sMsg = oError.responseText.substring(0, 300);
                    }
                }
            } else if (oError && oError.message) {
                sMsg = oError.message;
            } else if (oError && oError.statusText) {
                sMsg = oError.statusText;
            }
            return {
                statusCode: iCode,
                message: sMsg
            };
        },

        _loadDynamicHeaderData: function (oFilterData) {
            var oView = this.getView();
            var oODataModel = oView.getModel(); // unnamed model = SD_SOFA OData V2
            var oReportModel = oView.getModel("reportModel");
            var that = this;
            var sDocTypeTitle = that._getDocTypeLabel(oFilterData ? oFilterData.sdDocType : "C");

            // Busy indicator tabel. /chartBusy sengaja TIDAK disentuh di sini:
            // kartu summary punya siklus request sendiri (_loadDocFlowSummary).
            if (oReportModel) {
                oReportModel.setProperty("/tableBusy", true);
            }

            if (oODataModel && typeof oODataModel.read === "function") {
                var aFilters = [];
                if (oFilterData) {
                    if (oFilterData.sdDocType) {
                        aFilters.push(new Filter("SDDocumentCategory", FilterOperator.EQ, oFilterData.sdDocType));
                    }
                    if (oFilterData.sdDocNum) {
                        // Select-options semantics: includes are OR-ed, excludes are AND-ed on top
                        var aDocFilters = that._buildConditionFilters(
                            oFilterData.sdDocNumConditions && oFilterData.sdDocNumConditions.length
                                ? oFilterData.sdDocNumConditions
                                : that._parseRawDocNumInput(oFilterData.sdDocNum),
                            "SalesDocument"
                        );
                        aDocFilters.forEach(function (oF) {
                            aFilters.push(oF);
                        });
                    }
                    if (oFilterData.soldToParty) {
                        aFilters.push(new Filter("SoldToParty", FilterOperator.Contains, oFilterData.soldToParty));
                    }
                    if (oFilterData.customerRef) {
                        aFilters.push(new Filter("PurchaseOrderByCustomer", FilterOperator.Contains, oFilterData.customerRef));
                    }
                    if (oFilterData.docDateFrom && oFilterData.docDateTo) {
                        aFilters.push(new Filter("SalesDocumentDate", FilterOperator.BT, oFilterData.docDateFrom, oFilterData.docDateTo));
                    } else if (oFilterData.docDateFrom) {
                        aFilters.push(new Filter("SalesDocumentDate", FilterOperator.GE, oFilterData.docDateFrom));
                    } else if (oFilterData.docDateTo) {
                        aFilters.push(new Filter("SalesDocumentDate", FilterOperator.LE, oFilterData.docDateTo));
                    }
                    if (oFilterData.salesEmployee) {
                        aFilters.push(new Filter("CreatedByUser", FilterOperator.Contains, oFilterData.salesEmployee));
                    }
                    if (oFilterData.salesOrg) {
                        aFilters.push(new Filter("SalesOrganization", FilterOperator.EQ, oFilterData.salesOrg));
                    }
                    if (oFilterData.distChannel) {
                        aFilters.push(new Filter("DistributionChannel", FilterOperator.EQ, oFilterData.distChannel));
                    }
                    if (oFilterData.division) {
                        aFilters.push(new Filter("OrganizationDivision", FilterOperator.EQ, oFilterData.division));
                    }
                }

                try {
                    oODataModel.read("/C_SlsDocFlfllmntAnalyzer", {
                        filters: aFilters,
                        urlParameters: {
                            "$top": "5000"
                        },
                        success: function (oData) {
                            var aResults = oData.results || [];

                            if (aResults.length > 0) {
                                var aDynamicRows = aResults.map(function (o) {
                                    var sDocNum = o.SalesDocument || "-";
                                    var sPhase = that._mapProcessPhase(o);
                                    var oFulfilment = that._mapOverallFulfilment(Object.assign({}, o, { processPhase: sPhase }));
                                    var oOrderProc = that._mapOrderProcessingStatus(o);

                                    return {
                                        sdDocNum: sDocNum,
                                        salesOrder: sDocNum,
                                        overallFulfilmentType: oFulfilment.overallFulfilmentType,
                                        overallFulfilmentIcon: oFulfilment.overallFulfilmentIcon,
                                        overallFulfilmentColor: oFulfilment.overallFulfilmentColor,
                                        overallFulfilmentText: oFulfilment.overallFulfilmentText,
                                        orderProcessingIcon: oOrderProc.icon,
                                        orderProcessingColor: oOrderProc.color,
                                        orderProcessingText: oOrderProc.text,
                                        processPhase: sPhase,
                                        soldToParty: o.SoldToPartyFullName || o.SoldToParty || "-",
                                        customerRef: o.PurchaseOrderByCustomer || "-",
                                        docDate: o.SalesDocumentDate || o.CreationDate || "-",
                                        salesEmployee: o.CreatedByUser || "-",
                                        salesOrg: o.SalesOrganization || "-",
                                        distChannel: o.DistributionChannel || "-",
                                        division: o.OrganizationDivision || "-",
                                        netValue: o.TotalNetAmount ? (Number(o.TotalNetAmount).toLocaleString() + " " + (o.TransactionCurrency || "IDR")) : "-",
                                        netValueNum: Number(o.TotalNetAmount || 0),
                                        status: oFulfilment.overallFulfilmentText,
                                        statusState: oFulfilment.statusState,
                                        documentCategory: o.SDDocumentCategory || (oFilterData ? oFilterData.sdDocType : "C"),
                                        rejectionStatus: o.OverallSDDocumentRejectionSts || "",
                                        rejectionStatusText: oFulfilment.overallFulfilmentText,
                                        rawRap: o
                                    };
                                });

                                if (oReportModel) {
                                    oReportModel.setProperty("/results", aDynamicRows);
                                    oReportModel.setProperty("/tableTitle", sDocTypeTitle + " Documents (" + aDynamicRows.length + ")");
                                    oReportModel.setProperty("/tableBusy", false);
                                }

                                MessageToast.show("Live SAP: Loaded " + aDynamicRows.length + " " + sDocTypeTitle + " records directly from SAP backend.");
                            } else {
                                // 0 Records returned by SAP
                                if (oReportModel) {
                                    oReportModel.setProperty("/results", []);
                                    oReportModel.setProperty("/tableTitle", sDocTypeTitle + " Documents (0)");
                                    oReportModel.setProperty("/tableBusy", false);
                                }
                                MessageToast.show("Live SAP: 0 records found matching the filter criteria.");
                            }
                        },
                        error: function (oError) {
                            if (oReportModel) {
                                oReportModel.setProperty("/tableBusy", false);
                                oReportModel.setProperty("/results", []);
                                oReportModel.setProperty("/tableTitle", sDocTypeTitle + " Documents (0 - Error)");
                            }

                            var oErr = that._parseODataError(oError);
                            MessageBox.error(
                                "Gagal memuat data dari SAP Backend:\n\n" +
                                (oErr.statusCode ? "HTTP Status: " + oErr.statusCode + "\n" : "") +
                                "Pesan: " + oErr.message + "\n\n" +
                                "Silakan periksa koneksi SAP Gateway, VPN, atau otorisasi user di ui5.yaml.",
                                { title: "SAP Backend Query Error" }
                            );
                        }
                    });
                } catch (e) {
                    if (oReportModel) {
                        oReportModel.setProperty("/tableBusy", false);
                        oReportModel.setProperty("/results", []);
                    }
                    MessageBox.error("Exception saat memanggil OData SAP: " + (e.message || e), { title: "SAP Exception Error" });
                }
            } else {
                if (oReportModel) {
                    oReportModel.setProperty("/tableBusy", false);
                    oReportModel.setProperty("/results", []);
                }
                MessageBox.error("Model OData SAP ('mainService') tidak ditemukan di manifest.json.", { title: "OData Model Error" });
            }
        },

        // ==========================================
        // DOCUMENT FLOW SUMMARY (RAP OData V4 /DocFlowSummary)
        // ==========================================

        /**
         * Loads the 6 "Total" tiles and the 10 "Total Issue" buckets from the RAP summary
         * query ZR_SD_DocFlowSummary / ZCL_SD_DOCFLOW_SUMMARY.
         *
         * The backend always answers with 16 rows (10 ISSUE + 6 TOTAL), including the ones
         * with Counter = 0, so the chart never changes shape.
         *
         * Deliberately independent from the table request:
         *  - the chart covers the whole document flow (inquiry -> quotation -> order ->
         *    delivery -> billing -> payment), computed on VBAK/VBFA/LIKP/VBRK/BKPF/BSEG
         *  - the table only lists documents of the selected SD document type
         *  - SDDocumentCategory is therefore NOT forwarded to this query
         *  - a failing summary must never break the table (and vice versa)
         */
        _loadDocFlowSummary: function (oFilterData) {
            var oReportModel = this.getView().getModel("reportModel");
            var that = this;

            if (oReportModel) {
                oReportModel.setProperty("/chartBusy", true);
            }

            // onSearch is also wired to liveChange of several filter inputs. This query
            // aggregates VBAK/VBFA/LIKP/VBRK/BKPF/BSEG, so a burst of keystrokes must
            // collapse into ONE backend request instead of one request per character.
            if (this._iSummaryTimer) {
                clearTimeout(this._iSummaryTimer);
            }
            this._iSummaryTimer = setTimeout(function () {
                that._iSummaryTimer = null;
                that._requestDocFlowSummary(oFilterData);
            }, 400);
        },

        /** Actual /DocFlowSummary request, debounced by _loadDocFlowSummary. */
        _requestDocFlowSummary: function (oFilterData) {
            var oView = this.getView();
            var oRapModel = oView.getModel("rapFlowService");
            var that = this;

            if (!oRapModel || typeof oRapModel.bindList !== "function") {
                this._resetDocFlowSummary();
                MessageToast.show("Summary chart: model OData V4 ('rapFlowService') tidak ditemukan di manifest.json.");
                return;
            }

            var aFilters;
            try {
                aFilters = this._buildSummaryFilters(oFilterData);
            } catch (oFilterErr) {
                console.error("Unable to build /DocFlowSummary filters:", oFilterErr);
                this._resetDocFlowSummary();
                MessageToast.show("Summary chart: filter tidak dapat dibentuk (" + (oFilterErr.message || oFilterErr) + ").");
                return;
            }

            // Sequence guard: a slow answer of an older search must never overwrite
            // the result of the search the user is actually looking at.
            this._iSummaryRequest = (this._iSummaryRequest || 0) + 1;
            var iRequest = this._iSummaryRequest;

            try {
                // Binding baru setiap pencarian: cache OData V4 melekat pada binding,
                // jadi ini memaksa request segar ke backend (pola sama _fetchDocRelations).
                var oListBinding = oRapModel.bindList("/DocFlowSummary", null, null, aFilters, {
                    "$$groupId": "$direct"
                });

                oListBinding.requestContexts(0, 20).then(function (aContexts) {
                    if (iRequest !== that._iSummaryRequest) {
                        return; // stale response
                    }
                    that._applyDocFlowSummary((aContexts || []).map(function (oCtx) {
                        return oCtx.getObject();
                    }).filter(Boolean));
                }).catch(function (oErr) {
                    if (iRequest !== that._iSummaryRequest) {
                        return; // stale failure
                    }
                    console.error("Error fetching live /DocFlowSummary from SAP RAP OData V4:", oErr);
                    that._resetDocFlowSummary();
                    var sErrMsg = (oErr && (oErr.message || (oErr.error && oErr.error.message))) || "Gagal menghubungi layanan RAP OData V4.";
                    MessageToast.show("Summary chart gagal dimuat: " + sErrMsg);
                });
            } catch (e) {
                console.error("Exception requesting /DocFlowSummary:", e);
                this._resetDocFlowSummary();
                MessageToast.show("Summary chart gagal dimuat: " + (e.message || e));
            }
        },

        /**
         * Filter payload of the summary query. Mirrors the table filters except
         * SDDocumentCategory, which must stay out (see _loadDocFlowSummary).
         *
         * Substring semantics are expressed as EQ/NE with wildcards, because
         * ZCL_SD_DOCFLOW_SUMMARY converts EQ + '*' to the ABAP option CP.
         */
        _buildSummaryFilters: function (oFilterData) {
            var aFilters = [];
            if (!oFilterData) {
                return aFilters;
            }

            var oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd", UTC: true });

            if (oFilterData.salesOrg) {
                aFilters.push(new Filter("SalesOrganization", FilterOperator.EQ, oFilterData.salesOrg));
            }
            if (oFilterData.distChannel) {
                aFilters.push(new Filter("DistributionChannel", FilterOperator.EQ, oFilterData.distChannel));
            }
            if (oFilterData.division) {
                aFilters.push(new Filter("OrganizationDivision", FilterOperator.EQ, oFilterData.division));
            }
            if (oFilterData.soldToParty) {
                aFilters.push(new Filter("SoldToParty", FilterOperator.EQ, "*" + oFilterData.soldToParty + "*"));
            }
            if (oFilterData.customerRef) {
                aFilters.push(new Filter("PurchaseOrderByCustomer", FilterOperator.EQ, "*" + oFilterData.customerRef + "*"));
            }
            if (oFilterData.salesEmployee) {
                aFilters.push(new Filter("CreatedByUser", FilterOperator.EQ, "*" + oFilterData.salesEmployee + "*"));
            }

            // Edm.Date expects an ISO string ("yyyy-MM-dd"), never a JS Date object
            if (oFilterData.docDateFrom && oFilterData.docDateTo) {
                aFilters.push(new Filter("SalesDocumentDate", FilterOperator.BT,
                    oDateFormat.format(oFilterData.docDateFrom), oDateFormat.format(oFilterData.docDateTo)));
            } else if (oFilterData.docDateFrom) {
                aFilters.push(new Filter("SalesDocumentDate", FilterOperator.GE, oDateFormat.format(oFilterData.docDateFrom)));
            } else if (oFilterData.docDateTo) {
                aFilters.push(new Filter("SalesDocumentDate", FilterOperator.LE, oDateFormat.format(oFilterData.docDateTo)));
            }

            var aConditions = (oFilterData.sdDocNumConditions && oFilterData.sdDocNumConditions.length)
                ? oFilterData.sdDocNumConditions
                : (oFilterData.sdDocNum ? this._parseRawDocNumInput(oFilterData.sdDocNum) : []);

            this._buildSummaryConditionFilters(aConditions, "SalesDocument").forEach(function (oF) {
                aFilters.push(oF);
            });

            return aFilters;
        },

        /**
         * Select-options conditions -> OData V4 filters for the RAP summary query.
         *
         * Difference to _buildConditionFilters (OData V2 / C_SlsDocFlfllmntAnalyzer):
         * substring operators are NOT downgraded to an exact match. They are sent as
         * EQ/NE with wildcards, which the ABAP query provider maps to CP/NP - so
         * "contains", "starts with" and "ends with" really work on the summary.
         *
         * Include conditions are OR-ed, exclude conditions are AND-ed on top.
         */
        _buildSummaryConditionFilters: function (aConditions, sFieldName) {
            var that = this;
            var aInclude = [];
            var aExclude = [];

            (aConditions || []).forEach(function (c) {
                if (!c) {
                    return;
                }
                var oCfg = that._getOperatorConfig(c.operator);
                var sV1 = oCfg.values === 0 ? (oCfg.fixedValue || "") : String(c.value1 || "").trim();
                var sV2 = String(c.value2 || "").trim();

                // Strip any residual UI token notation (=, *, <, >, !(..)) first
                sV1 = that._sanitizeDocNumber(sV1);
                sV2 = that._sanitizeDocNumber(sV2);

                if (oCfg.values >= 1 && sV1 === "") {
                    return;
                }
                if (oCfg.values === 2 && sV2 === "") {
                    return;
                }

                var sFilterOp = oCfg.filterOp;
                var sPattern = SUMMARY_WILDCARD_PATTERN[oCfg.key];
                if (sPattern) {
                    sV1 = sPattern.replace("{0}", function () { return sV1; });
                    sFilterOp = (oCfg.sign === "E") ? FilterOperator.NE : FilterOperator.EQ;
                }

                var oFilter = (oCfg.values === 2)
                    ? new Filter(sFieldName, sFilterOp, sV1, sV2)
                    : new Filter(sFieldName, sFilterOp, sV1);

                if (oCfg.sign === "E") {
                    aExclude.push(oFilter);
                } else {
                    aInclude.push(oFilter);
                }
            });

            var aResult = [];
            if (aInclude.length === 1) {
                aResult.push(aInclude[0]);
            } else if (aInclude.length > 1) {
                aResult.push(new Filter({ filters: aInclude, and: false }));
            }
            aExclude.forEach(function (oFilter) {
                aResult.push(oFilter);
            });
            return aResult;
        },

        /**
         * Maps the 16 summary rows onto reportModel>/issueData (chart) and
         * reportModel>/kpiData (tiles) and surfaces the IsTruncated warning.
         */
        _applyDocFlowSummary: function (aRows) {
            var oReportModel = this.getView().getModel("reportModel");
            if (!oReportModel) {
                return;
            }

            var oKpiData = buildEmptyKpiData();
            var aIssueData = [];
            var sFlag = "";

            (aRows || []).forEach(function (o) {
                var sType = String(o.SummaryType || "").toUpperCase().trim();
                var sKey = String(o.BucketKey || "").toUpperCase().trim();
                var iCount = Number(o.Counter || 0);
                var sRowFlag = String(o.IsTruncated || "").toUpperCase().trim();

                if (sRowFlag && !sFlag) {
                    sFlag = sRowFlag;
                }

                if (sType === "ISSUE") {
                    aIssueData.push({
                        bucketKey: sKey,
                        issueType: o.BucketText || sKey,
                        count: isNaN(iCount) ? 0 : iCount,
                        sortOrder: Number(o.SortOrder || 0)
                    });
                } else if (sType === "TOTAL") {
                    var sKpiProperty = TOTAL_BUCKET_TO_KPI[sKey];
                    if (sKpiProperty) {
                        oKpiData[sKpiProperty] = isNaN(iCount) ? 0 : iCount;
                    }
                }
            });

            aIssueData.sort(function (a, b) {
                return a.sortOrder - b.sortOrder;
            });

            if (aIssueData.length === 0) {
                // Backend tidak mengirim baris ISSUE -> pertahankan bentuk chart
                aIssueData = buildEmptyIssueData();
            }

            oReportModel.setProperty("/kpiData", oKpiData);
            oReportModel.setProperty("/issueData", aIssueData);
            oReportModel.setProperty("/chartBusy", false);

            this._updateVizFrameDynamicScale(aIssueData);

            if (sFlag) {
                MessageToast.show(SUMMARY_FLAG_TEXT[sFlag] || ("Summary chart: hasil ditandai '" + sFlag + "' oleh backend."));
            }
        },

        /** Summary failure must not block the table: fall back to 10 empty buckets. */
        _resetDocFlowSummary: function () {
            var oReportModel = this.getView().getModel("reportModel");
            if (!oReportModel) {
                return;
            }
            oReportModel.setProperty("/kpiData", buildEmptyKpiData());
            oReportModel.setProperty("/issueData", buildEmptyIssueData());
            oReportModel.setProperty("/chartBusy", false);

            this._updateVizFrameDynamicScale([]);
        },

        /**
         * Dynamically adjusts the valueAxis max scale with ~15% headroom and clean rounding,
         * ensuring the longest bar never touches the right boundary and labels are never crowded.
         */
        _updateVizFrameDynamicScale: function (aIssueData) {
            var oVizFrame = this.getView().byId("idVizFrame");
            if (!oVizFrame) {
                return;
            }
            var iMaxCount = 0;
            (aIssueData || []).forEach(function (d) {
                var iVal = Number(d.count || 0);
                if (iVal > iMaxCount) {
                    iMaxCount = iVal;
                }
            });

            var iDynamicMax = 10;
            if (iMaxCount > 0) {
                if (iMaxCount <= 10) {
                    iDynamicMax = 10;
                } else if (iMaxCount <= 50) {
                    iDynamicMax = Math.ceil((iMaxCount * 1.15) / 5) * 5;
                } else if (iMaxCount <= 100) {
                    iDynamicMax = Math.ceil((iMaxCount * 1.15) / 10) * 10;
                } else if (iMaxCount <= 500) {
                    // e.g. 450 -> 450 * 1.15 = 517.5 -> 550 (clean 50s)
                    iDynamicMax = Math.ceil((iMaxCount * 1.15) / 50) * 50;
                } else {
                    iDynamicMax = Math.ceil((iMaxCount * 1.15) / 100) * 100;
                }
            }

            oVizFrame.setVizProperties({
                plotArea: {
                    primaryScale: {
                        fixedRange: true,
                        minValue: 0,
                        maxValue: iDynamicMax
                    }
                }
            });
        },

        _mapOverallFulfilment: function (o) {
            if (!o) {
                return {
                    overallFulfilmentType: "icon",
                    overallFulfilmentIcon: "sap-icon://future",
                    overallFulfilmentColor: "#475467",
                    overallFulfilmentText: "Not Yet Processed",
                    statusState: "Information"
                };
            }

            // Direct mapping from standard SAP OverallFulfillmentStatus ('1', '2', '3', '4', '5')
            if (o.OverallFulfillmentStatus) {
                var sCode = String(o.OverallFulfillmentStatus).trim();
                var sText = (o.to_OverallFulfillmentStatus && o.to_OverallFulfillmentStatus.FulfillmentStatus_Text) || "";
                switch (sCode) {
                    case "1":
                        return {
                            overallFulfilmentType: "icon",
                            overallFulfilmentIcon: "sap-icon://future",
                            overallFulfilmentColor: "#475467",
                            overallFulfilmentText: sText || "Not Yet Processed",
                            statusState: "Information"
                        };
                    case "2":
                        return {
                            overallFulfilmentType: "chevron",
                            overallFulfilmentIcon: "sap-icon://process",
                            overallFulfilmentColor: "#475467",
                            overallFulfilmentText: sText || "Partially Processed",
                            statusState: "Warning"
                        };
                    case "3":
                        return {
                            overallFulfilmentType: "icon",
                            overallFulfilmentIcon: "sap-icon://sys-enter-2",
                            overallFulfilmentColor: "#2e7d32",
                            overallFulfilmentText: sText || "Completely Processed",
                            statusState: "Success"
                        };
                    case "4":
                        return {
                            overallFulfilmentType: "icon",
                            overallFulfilmentIcon: "sap-icon://error",
                            overallFulfilmentColor: "#d32f2f",
                            overallFulfilmentText: sText || "Issue : Action Overdue",
                            statusState: "Error"
                        };
                    case "5":
                        return {
                            overallFulfilmentType: "icon",
                            overallFulfilmentIcon: "sap-icon://warning2",
                            overallFulfilmentColor: "#f39c12",
                            overallFulfilmentText: sText || "Due Next Issue",
                            statusState: "Warning"
                        };
                }
            }

            // If overallFulfilmentType is already explicitly defined (e.g. mock header)
            if (o.overallFulfilmentType === "chevron" || o.overallFulfilmentType === "icon") {
                if (o.overallFulfilmentIcon) {
                    return {
                        overallFulfilmentType: "icon",
                        overallFulfilmentIcon: o.overallFulfilmentIcon,
                        overallFulfilmentColor: o.overallFulfilmentColor || "#475467",
                        overallFulfilmentText: o.overallFulfilmentText || "Partially Processed",
                        statusState: o.statusState || "Warning"
                    };
                }
            }

            var sRejection = (o.RejectionStatus || o.OverallSDDocumentRejectionSts || "").trim();
            var sOverallStatus = (o.OverallProcessingStatus || o.OverallSDProcessStatus || o.GBSTK || o.LFSTK || "").trim();
            var sDeliveryStatus = (o.DeliveryStatus || o.OverallDeliveryStatus || o.OverallTotalDeliveryStatus || "").trim();
            var sBillingStatus = (o.BillingStatus || o.OverallBillingStatus || o.OverallOrdReltdBillgStatus || "").trim();
            var sStatus = (o.status || o.Status || o.RejectionStatusText || "").trim();
            var sPhase = (o.ProcessPhase || o.processPhase || "").trim();

            // 1. Issue : Action Overdue (Red Error Circle with X: sap-icon://error)
            if (sRejection === "C" || sStatus === "Blocked" || sStatus === "Delivery Blocked" || sStatus === "Issue : Action Overdue" || o.DeliveryBlocked === true || o.BillingBlocked === true) {
                return {
                    overallFulfilmentType: "icon",
                    overallFulfilmentIcon: "sap-icon://error",
                    overallFulfilmentColor: "#d32f2f",
                    overallFulfilmentText: "Issue : Action Overdue",
                    statusState: "Error"
                };
            }

            // 2. Completely Processed (Green Check Circle: sap-icon://sys-enter-2)
            if (sStatus === "Completely Processed" || sStatus === "Completed / Paid" || sPhase === "Already Payment" || (sOverallStatus === "C" && (sBillingStatus === "C" || sBillingStatus === ""))) {
                return {
                    overallFulfilmentType: "icon",
                    overallFulfilmentIcon: "sap-icon://sys-enter-2",
                    overallFulfilmentColor: "#2e7d32",
                    overallFulfilmentText: "Completely Processed",
                    statusState: "Success"
                };
            }

            // 3. Partially Processed (Process Icon: sap-icon://process in #475467)
            if (sOverallStatus === "B" || sDeliveryStatus === "B" || sDeliveryStatus === "C" || sBillingStatus === "B" || sStatus === "In Process" || sStatus === "Partially Processed" || sStatus === "Partially Blocked" || sPhase === "Accounting" || sStatus === "Accounting" || sStatus === "Release") {
                return {
                    overallFulfilmentType: "icon",
                    overallFulfilmentIcon: "sap-icon://process",
                    overallFulfilmentColor: "#475467",
                    overallFulfilmentText: "Partially Processed",
                    statusState: "Warning"
                };
            }

            // 4. Not Yet Processed (Counter-clockwise History/Clock: sap-icon://future in #475467)
            return {
                overallFulfilmentType: "icon",
                overallFulfilmentIcon: "sap-icon://future",
                overallFulfilmentColor: "#475467",
                overallFulfilmentText: "Not Yet Processed",
                statusState: "Information"
            };
        },

        _mapProcessPhase: function (o) {
            if (!o) return "Order Processing";
            if (o.processPhase && o.processPhase !== "Already Payment") return o.processPhase;

            var sCat = (o.DocumentCategory || o.SDDocumentCategory || o.vbtyp || "C").trim();
            var sDocType = (o.salesDocumentType || o.SalesDocumentType || "").trim();
            var sLFSTK = (o.DeliveryStatus || o.OverallDeliveryStatus || o.OverallTotalDeliveryStatus || o.lfstk || "").trim();
            var sFKSTK = (o.BillingStatus || o.OverallBillingStatus || o.OverallOrdReltdBillgStatus || o.fkstk || "").trim();
            var sGBSTK = (o.OverallProcessingStatus || o.OverallSDProcessStatus || o.gbstk || "").trim();
            var sStatus = (o.RejectionStatusText || o.status || "").trim();
            var sRejection = (o.RejectionStatus || o.OverallSDDocumentRejectionSts || "").trim();
            var sOrderSts = (o.FulfillmentStatusInOrder || "").trim();
            var sDelivSts = (o.FulfillmentStatusInDelivery || "").trim();
            var sAcctSts = (o.FulfillmentStatusInAccounting || "").trim();
            var sInvSts = (o.FulfillmentStatusInInvoice || "").trim();
            var sPhaseCode = String(o.FulfillmentProcessPhase || "").trim();

            // 1. Inquiry (A), Quotation (B), and Returns (H) Special Categories
            if (sCat === "A") return "Inquiry";
            if (sCat === "B") return "Quotation";
            if (sCat === "H") return "Returns";

            // 2. Issue / Blocking at Specific Process Phase (Priority)
            if (sOrderSts === "4" || sRejection === "C" || sStatus === "Blocked" || o.OrderBlocked === true) {
                return "Order Processing";
            }
            if (sInvSts === "4" || sStatus === "No Journal Entry" || (o.HeaderBillingBlockReason && o.HeaderBillingBlockReason !== "00" && o.HeaderBillingBlockReason !== "")) {
                return "Invoicing";
            }
            if (sDelivSts === "4" || sStatus === "Delivery Blocked" || o.DeliveryBlocked === true || sCat === "J" || sCat === "R") {
                return "Delivery Processing";
            }
            if (sAcctSts === "4") {
                return "Accounting";
            }

            // 3. Standard SAP S/4HANA Track Sales Orders (F2577) Classification:
            // Evaluated progressively from furthest active business phase (Accounting -> Invoicing -> Delivery -> Order)

            // Stage 4: Accounting (Invoiced and in Financial Accounting / Open Item / Cleared)
            if (sAcctSts === "2" || sAcctSts === "3" || (sFKSTK === "C" && sGBSTK !== "A") || (sInvSts === "3" && (sLFSTK === "C" || sGBSTK === "C" || sGBSTK === "B")) || (sPhaseCode === "3" && sLFSTK === "C")) {
                return "Accounting";
            }

            // Stage 3: Invoicing (Delivery completed/in progress, Billing active or pending invoice release)
            if (sInvSts === "2" || sFKSTK === "B" || (sLFSTK === "C" && sFKSTK === "A" && sInvSts === "3")) {
                return "Invoicing";
            }

            // Stage 2: Delivery Processing (Warehouse picking / shipping active and not yet fully invoiced/accounting)
            if (sLFSTK === "B" || sLFSTK === "C" || sDelivSts === "2" || sDelivSts === "3" || sPhaseCode === "2") {
                return "Delivery Processing";
            }

            // Stage 1: Order Processing (Initial sales order entry stage)
            if (sPhaseCode === "1" || sOrderSts === "1" || sOrderSts === "2" || sLFSTK === "A" || sGBSTK === "A") {
                return "Order Processing";
            }

            // 4. Default: Order Processing
            return "Order Processing";
        },

        _mapOrderProcessingStatus: function (o) {
            if (!o) {
                return {
                    icon: "sap-icon://sys-enter-2",
                    color: "#2e7d32",
                    text: "Completed"
                };
            }
            if (o.FulfillmentStatusInOrder) {
                var sCode = String(o.FulfillmentStatusInOrder).trim();
                switch (sCode) {
                    case "1": return { icon: "sap-icon://future", color: "#475467", text: "Not Yet Processed" };
                    case "2": return { icon: "sap-icon://process", color: "#475467", text: "Partially Processed" };
                    case "3": return { icon: "sap-icon://sys-enter-2", color: "#2e7d32", text: "Completed" };
                    case "4": return { icon: "sap-icon://error", color: "#d32f2f", text: "Issue : Action Overdue" };
                    case "5": return { icon: "sap-icon://warning2", color: "#f39c12", text: "Due Next Issue" };
                }
            }

            var sStatus = (o.status || o.rejectionStatusText || o.overallFulfilmentText || "").toLowerCase();
            var sPhase = o.processPhase || "";
            var sRejection = (o.rejectionStatus || "").trim();

            // 1. Blocked / Overdue Issue in Order phase
            if (sRejection === "C" || sStatus.indexOf("blocked") !== -1 || sStatus.indexOf("overdue") !== -1) {
                return {
                    icon: "sap-icon://error",
                    color: "#d32f2f",
                    text: "Issue : Action Overdue"
                };
            }

            // 2. Open / Not Yet Processed in Order phase
            if (sStatus.indexOf("open") !== -1 || sStatus === "not yet processed" || (sPhase === "Order Processing" && sStatus.indexOf("not blocked") !== -1)) {
                return {
                    icon: "sap-icon://future",
                    color: "#475467",
                    text: "Not Yet Processed"
                };
            }

            // 3. In Process in Order / Invoicing phase (e.g. 2100000098)
            if (sStatus === "in process" && (sPhase === "Order Processing" || sPhase === "Invoicing")) {
                return {
                    icon: "sap-icon://process",
                    color: "#475467",
                    text: "Partially Processed"
                };
            }

            // 4. Completed / Released
            return {
                icon: "sap-icon://sys-enter-2",
                color: "#2e7d32",
                text: "Completed"
            };
        },

        onLegendPress: function (oEvent) {
            var oButton = oEvent.getSource();
            var oView = this.getView();

            if (!this._pLegendPopover) {
                this._pLegendPopover = Fragment.load({
                    id: oView.getId(),
                    name: "myapp.view.fragment.LegendPopover",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }

            this._pLegendPopover.then(function (oPopover) {
                oPopover.openBy(oButton);
            });
        },

        onClear: function () {
            var oView = this.getView();
            var oAdaptFilterModel = oView.getModel("adaptFilterModel");

            if (oAdaptFilterModel) {
                oAdaptFilterModel.setProperty("/sdDocNumLabel", "Sales Order Number");
                oAdaptFilterModel.setProperty("/sdDocNumPlaceholder", "e.g. 5000001 / 2110000176");
                oAdaptFilterModel.setProperty("/fieldValues", {
                    sdDocType: "C",
                    sdDocNum: "",
                    soldToParty: "",
                    customerRef: "",
                    docDate: "",
                    docDateRange: null,
                    salesEmployee: "",
                    salesOrg: "",
                    distChannel: "",
                    division: ""
                });
                var aFields = oAdaptFilterModel.getProperty("/fields") || [];
                aFields.forEach(function (f) {
                    if (f.key === "sdDocType") f.value = "C";
                    else f.value = "";
                });
                oAdaptFilterModel.setProperty("/fields", aFields);
            }

            if (oView.byId("idSDDocType")) oView.byId("idSDDocType").setSelectedKey("C");
            var oSDDocNum = oView.byId("idSDDocNum");
            if (oSDDocNum) {
                oSDDocNum.setValue("");
                if (typeof oSDDocNum.removeAllTokens === "function") {
                    oSDDocNum.removeAllTokens();
                }
            }
            if (oView.byId("idSoldToParty")) oView.byId("idSoldToParty").setValue("");
            if (oView.byId("idCustomerRef")) oView.byId("idCustomerRef").setValue("");
            this._resetDocDateRangeControls();
            if (oView.byId("idSalesEmployee")) oView.byId("idSalesEmployee").setValue("");
            if (oView.byId("idSalesOrg")) oView.byId("idSalesOrg").setValue("");
            if (oView.byId("idDistChannel")) oView.byId("idDistChannel").setValue("");
            if (oView.byId("idDivision")) oView.byId("idDivision").setValue("");

            // Clear conditionModel (input row + committed conditions + tokens)
            this._resetConditionModel();

            var oTable = oView.byId("idDocFlowTable");
            if (oTable) {
                oTable.removeSelections(true);
            }

            this.onSearch();
            MessageToast.show("Filters reset to default (Sales Order).");
        },

        // ==========================================
        // ADAPT FILTERS DIALOG HANDLERS (STANDARD FIORI)
        // ==========================================

        _getFilterControlById: function (sKey) {
            var oView = this.getView();
            if (sKey === "sdDocType") return oView.byId("idSDDocType");
            if (sKey === "sdDocNum") return oView.byId("idSDDocNum");
            return oView.byId("id" + sKey.charAt(0).toUpperCase() + sKey.slice(1));
        },

        onAdaptFilters: function () {
            var oView = this.getView();
            var that = this;

            if (!this._pAdaptFiltersDialog) {
                this._pAdaptFiltersDialog = Fragment.load({
                    id: oView.getId(),
                    name: "myapp.view.fragment.AdaptFiltersDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pAdaptFiltersDialog.then(function (oDialog) {
                if (!oDialog) return;
                // Sync current values from inputs to adapt filter fields
                var oModel = oView.getModel("adaptFilterModel");
                var oValues = oModel.getProperty("/fieldValues") || {};
                var aFields = oModel.getProperty("/fields") || [];

                aFields.forEach(function (f) {
                    var oInput = that._getFilterControlById(f.key);
                    if (f.key === "sdDocType" && oInput && typeof oInput.getSelectedKey === "function") {
                        f.value = oInput.getSelectedKey() || "C";
                    } else if (f.key === "docDate") {
                        // DynamicDateRange: keep the readable text, the real value lives in /fieldValues/docDateRange
                        var oResolved = that._resolveDocDateRange(that._getDocDateRangeValue());
                        f.value = oResolved ? oResolved.text : "";
                    } else if (f.key === "sdDocNum") {
                        // Sales Document is driven by the Define Conditions dialog -> show the token notation
                        f.value = that._getConditionsDisplayText();
                    } else if (oInput && typeof oInput.getValue === "function") {
                        f.value = oInput.getValue() || "";
                    } else if (oValues[f.key] !== undefined) {
                        f.value = oValues[f.key];
                    } else {
                        f.value = f.key === "sdDocType" ? "C" : "";
                    }
                });
                oModel.setProperty("/fields", aFields);

                // Push the current Document Date value into the dialog's DynamicDateRange
                that._syncDocDateRangeControls(that._getDocDateRangeValue(), oView.byId("idDocDate"));

                // Reset search and filter group in dialog
                oModel.setProperty("/selectedGroup", "ALL");
                var oSearchField = oView.byId("idFilterSearchField");
                if (oSearchField) {
                    oSearchField.setValue("");
                }
                var oList = oView.byId("idAdaptFiltersList");
                if (oList && oList.getBinding("items")) {
                    oList.getBinding("items").filter([]);
                }

                oDialog.open();
            }).catch(function (oErr) {
                console.error("Error opening AdaptFiltersDialog:", oErr);
                that._pAdaptFiltersDialog = null;
            });
        },

        onToggleShowValues: function () {
            var oModel = this.getView().getModel("adaptFilterModel");
            var bCurrent = !!oModel.getProperty("/showValues");
            oModel.setProperty("/showValues", !bCurrent);
        },

        onAdaptViewModeChange: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oModel = this.getView().getModel("adaptFilterModel");
            oModel.setProperty("/showValues", sKey === "values");
        },

        onFilterGroupChange: function (oEvent) {
            var sGroup = oEvent.getParameter("selectedItem").getKey();
            var oList = this.getView().byId("idAdaptFiltersList");
            if (!oList) return;
            var oBinding = oList.getBinding("items");
            if (!oBinding) return;

            var aFilters = [];
            if (sGroup && sGroup !== "ALL") {
                aFilters.push(new Filter("group", FilterOperator.EQ, sGroup));
            }
            var oSearch = this.getView().byId("idFilterSearchField");
            var sQuery = oSearch ? oSearch.getValue() : "";
            if (sQuery && sQuery.trim() !== "") {
                aFilters.push(new Filter("label", FilterOperator.Contains, sQuery.trim()));
            }
            oBinding.filter(aFilters);
        },

        onAdaptFilterSearch: function (oEvent) {
            var sQuery = (oEvent.getParameter("newValue") || "").trim();
            var oList = this.getView().byId("idAdaptFiltersList");
            if (!oList) return;
            var oBinding = oList.getBinding("items");
            if (!oBinding) return;

            var aFilters = [];
            if (sQuery !== "") {
                aFilters.push(new Filter("label", FilterOperator.Contains, sQuery));
            }
            var oSelect = this.getView().byId("idFilterGroupSelect");
            var sGroup = oSelect ? oSelect.getSelectedKey() : "ALL";
            if (sGroup && sGroup !== "ALL") {
                aFilters.push(new Filter("group", FilterOperator.EQ, sGroup));
            }
            oBinding.filter(aFilters);
        },

        onSelectAllFiltersToggle: function () {
            var oModel = this.getView().getModel("adaptFilterModel");
            var aFields = oModel.getProperty("/fields") || [];
            var bAnyUnselected = aFields.some(function (f) { return !f.visible; });
            aFields.forEach(function (f) { f.visible = bAnyUnselected; });
            oModel.setProperty("/fields", aFields);
            MessageToast.show(bAnyUnselected ? "Selected all filter fields." : "Deselected all filter fields.");
        },

        onFilterCheckboxSelect: function () {
            // Checkbox selection automatically binds two-way to adaptFilterModel>visible
        },

        onApplyAdaptFilters: function () {
            var oView = this.getView();
            var oModel = oView.getModel("adaptFilterModel");
            var aFields = oModel.getProperty("/fields") || [];

            var oNewVisibility = {};
            var oNewValues = {};
            var that = this;
            var oDocDateRangeValue = this._getDocDateRangeValue();

            aFields.forEach(function (f) {
                oNewVisibility[f.key] = !!f.visible;
                oNewValues[f.key] = f.value || (f.key === "sdDocType" ? "C" : "");

                // Also update the input control in the view if present
                var oInput = that._getFilterControlById(f.key);
                if (oInput) {
                    if (f.key === "sdDocType" && typeof oInput.setSelectedKey === "function") {
                        oInput.setSelectedKey(f.value || "C");
                    } else if (f.key === "docDate") {
                        // DynamicDateRange takes an object value, never the display text
                        oInput.setValue(oDocDateRangeValue ? oDocDateRangeValue : undefined);
                    } else if (f.key === "sdDocNum") {
                        // Never push raw text into the MultiInput: the conditions stay the single source of truth
                        that._applyDocNumTextFromAdaptFilters(f.value);
                        oNewValues.sdDocNum = that._getConditionsDisplayText();
                    } else if (typeof oInput.setValue === "function") {
                        oInput.setValue(f.value || "");
                    }
                }
            });

            oNewValues.docDateRange = oDocDateRangeValue || null;

            oModel.setProperty("/fieldVisibility", oNewVisibility);
            oModel.setProperty("/fieldValues", oNewValues);

            if (this._pAdaptFiltersDialog) {
                this._pAdaptFiltersDialog.then(function (oDialog) {
                    if (oDialog) oDialog.close();
                });
            }

            MessageToast.show("Filter configuration applied.");
            this.onSearch();
        },

        onRestoreDefaultFilters: function () {
            var oModel = this.getView().getModel("adaptFilterModel");
            var aDefaultVisKeys = ["sdDocType", "sdDocNum", "soldToParty", "customerRef", "docDate", "salesEmployee", "salesOrg", "distChannel", "division"];
            var aFields = oModel.getProperty("/fields") || [];
            aFields.forEach(function (f) {
                f.visible = aDefaultVisKeys.indexOf(f.key) !== -1;
                f.value = f.key === "sdDocType" ? "C" : "";
            });
            oModel.setProperty("/fields", aFields);
            oModel.setProperty("/selectedGroup", "ALL");
            oModel.setProperty("/showValues", false);

            // Clear the Document Date DynamicDateRange (filter bar + dialog)
            this._resetDocDateRangeControls();

            var oList = this.getView().byId("idAdaptFiltersList");
            if (oList && oList.getBinding("items")) {
                oList.getBinding("items").filter([]);
            }
            if (this.getView().byId("idFilterSearchField")) {
                this.getView().byId("idFilterSearchField").setValue("");
            }
            MessageToast.show("Filter settings reset to standard defaults.");
        },

        onCancelAdaptFilters: function () {
            if (this._pAdaptFiltersDialog) {
                this._pAdaptFiltersDialog.then(function (oDialog) {
                    if (oDialog) oDialog.close();
                });
            }
        },

        // ==========================================
        // VALUE HELP & DEFINE CONDITIONS (ABAP SELECT-OPTIONS)
        // ==========================================

        /**
         * Centralized sanitization for document number values before they reach OData.
         * Strips UI token notation symbols (=, *, <, >, !(..)) that Fiori condition
         * rendering adds but that must NEVER be sent to SAP S/4HANA (ALPHA conversion exit).
         */
        _sanitizeDocNumber: function (vValue) {
            if (!vValue) return "";
            var s = String(vValue).trim();
            // 1. Strip Exclude wrapper: !(xxx) → xxx
            s = s.replace(/^!\((.*)\)$/, "$1");
            // 2. Strip comparison operator prefixes: =, >=, <=, <, >
            s = s.replace(/^[=<>]+/, "");
            // 3. Strip wildcard markers: leading/trailing *
            s = s.replace(/^\*|\*$/g, "");
            return s.trim();
        },

        /**
         * Returns the operator metadata for the given operator key.
         * Falls back to the default operator so an unknown key can never break the dialog.
         */
        _getOperatorConfig: function (sKey) {
            for (var i = 0; i < CONDITION_OPERATORS.length; i++) {
                if (CONDITION_OPERATORS[i].key === sKey) {
                    return CONDITION_OPERATORS[i];
                }
            }
            for (var j = 0; j < CONDITION_OPERATORS.length; j++) {
                if (CONDITION_OPERATORS[j].key === DEFAULT_CONDITION_OPERATOR) {
                    return CONDITION_OPERATORS[j];
                }
            }
            return CONDITION_OPERATORS[0];
        },

        /**
         * Builds a fully qualified condition entry:
         *   { operator, value1, value2, sign, tokenText, tokenKey }
         * Returns null when the mandatory values for the operator are missing.
         */
        _createCondition: function (sOperator, sValue1, sValue2) {
            var oCfg = this._getOperatorConfig(sOperator);
            var sV1 = (sValue1 === undefined || sValue1 === null) ? "" : String(sValue1).trim();
            var sV2 = (sValue2 === undefined || sValue2 === null) ? "" : String(sValue2).trim();

            if (oCfg.values === 0) {
                sV1 = "";
                sV2 = "";
            } else {
                if (sV1 === "") {
                    return null;
                }
                if (oCfg.values < 2) {
                    sV2 = "";
                } else if (sV2 === "") {
                    return null;
                }
            }

            // Function replacements keep "$" characters inside the value literal
            var sTokenText = oCfg.pattern
                .replace("{0}", function () { return sV1; })
                .replace("{1}", function () { return sV2; });

            return {
                operator: oCfg.key,
                value1: sV1,
                value2: sV2,
                sign: oCfg.sign,
                tokenText: sTokenText,
                tokenKey: oCfg.key + "|" + sV1 + "|" + sV2
            };
        },

        /** Committed conditions of the conditionModel (defensive copy-safe read). */
        _getActiveConditions: function () {
            var oCondModel = this.getView().getModel("conditionModel");
            return (oCondModel && oCondModel.getProperty("/conditions")) || [];
        },

        /**
         * Writes the committed conditions into the model, regenerates the tokens
         * (FilterBar MultiInput + dialog Tokenizer) and keeps the adaptFilterModel in sync.
         */
        _setConditions: function (aConditions) {
            var oView = this.getView();
            var oCondModel = oView.getModel("conditionModel");
            if (!oCondModel) {
                return;
            }

            var aConds = (aConditions || []).filter(Boolean);
            var aTokens = aConds.map(function (c) {
                return { key: c.tokenKey, text: c.tokenText };
            });

            oCondModel.setProperty("/conditions", aConds);
            oCondModel.setProperty("/tokens", aTokens);

            // The Adapt Filters dialog works on plain strings -> keep a readable representation
            var sDisplay = this._getConditionsDisplayText();
            var oAdaptModel = oView.getModel("adaptFilterModel");
            if (oAdaptModel) {
                oAdaptModel.setProperty("/fieldValues/sdDocNum", sDisplay);
                var aFields = oAdaptModel.getProperty("/fields") || [];
                aFields.forEach(function (f) {
                    if (f.key === "sdDocNum") {
                        f.value = sDisplay;
                    }
                });
                oAdaptModel.setProperty("/fields", aFields);
            }
        },

        /** Readable representation of all committed conditions, e.g. "*5000*, =2110000176". */
        _getConditionsDisplayText: function () {
            return this._getActiveConditions().map(function (c) {
                return c.tokenText;
            }).join(", ");
        },

        /** Resets input row, committed conditions and tokens back to the initial state. */
        _resetConditionModel: function () {
            var oCondModel = this.getView().getModel("conditionModel");
            if (oCondModel) {
                oCondModel.setProperty("/operator", DEFAULT_CONDITION_OPERATOR);
                oCondModel.setProperty("/value1", "");
                oCondModel.setProperty("/value2", "");
                oCondModel.setProperty("/valueCount", this._getOperatorConfig(DEFAULT_CONDITION_OPERATOR).values);
            }
            this._setConditions([]);
            this._clearConditionValueStates();
        },

        /**
         * Parses one token in Fiori select-options notation back into a condition, e.g.
         * "*5000*", "=2110000176", "5000...5099", "!(=5000)", "empty" or a plain "5000".
         */
        _parseConditionFragment: function (sFragment) {
            var s = (sFragment || "").trim();
            if (s === "") {
                return null;
            }

            var bExclude = false;
            var aExcl = /^!\((.*)\)$/.exec(s);
            if (aExcl) {
                bExclude = true;
                s = (aExcl[1] || "").trim();
            }

            var sOperator = "equal to";
            var sV1 = s;
            var sV2 = "";

            if (s.toLowerCase() === "empty") {
                sOperator = "empty";
                sV1 = "";
            } else if (s.indexOf("...") > 0) {
                var aParts = s.split("...");
                sOperator = "between";
                sV1 = (aParts[0] || "").trim();
                sV2 = (aParts[1] || "").trim();
            } else if (s.length > 2 && s.charAt(0) === "*" && s.charAt(s.length - 1) === "*") {
                sOperator = "contains";
                sV1 = s.substring(1, s.length - 1);
            } else if (s.length > 1 && s.charAt(0) === "*") {
                sOperator = "ends with";
                sV1 = s.substring(1);
            } else if (s.length > 1 && s.charAt(s.length - 1) === "*") {
                sOperator = "starts with";
                sV1 = s.substring(0, s.length - 1);
            } else if (s.indexOf("<=") === 0) {
                sOperator = "less than or equal to";
                sV1 = s.substring(2);
            } else if (s.indexOf(">=") === 0) {
                sOperator = "greater than or equal to";
                sV1 = s.substring(2);
            } else if (s.charAt(0) === "<") {
                sOperator = "less than";
                sV1 = s.substring(1);
            } else if (s.charAt(0) === ">") {
                sOperator = "greater than";
                sV1 = s.substring(1);
            } else if (s.charAt(0) === "=") {
                sOperator = "equal to";
                sV1 = s.substring(1);
            }

            if (bExclude) {
                sOperator = EXCLUDE_TWIN[sOperator] || sOperator;
            }

            return this._createCondition(sOperator, sV1, sV2);
        },

        /**
         * Turns free text into conditions. Plain values become "equal to", while values written in
         * select-options notation keep their operator ("*5000*", "5000...5099", "!(=5000)", ...).
         */
        _parseRawDocNumInput: function (sText) {
            if (!sText || typeof sText !== "string") {
                return [];
            }
            var that = this;
            var aConds = [];
            sText.split(/[\s,;\n\r\t]+/).filter(Boolean).forEach(function (sFragment) {
                var oCond = that._parseConditionFragment(sFragment);
                if (oCond && !aConds.some(function (c) { return c.tokenKey === oCond.tokenKey; })) {
                    aConds.push(oCond);
                }
            });
            return aConds;
        },

        /**
         * The Adapt Filters dialog edits the Sales Document filter as plain text.
         * Only re-parse it when the user actually changed the text, so existing conditions
         * (including their operators) survive an untouched OK.
         */
        _applyDocNumTextFromAdaptFilters: function (sText) {
            var sNew = (sText || "").trim();
            if (sNew === this._getConditionsDisplayText()) {
                return;
            }
            this._setConditions(sNew === "" ? [] : this._parseRawDocNumInput(sNew));
        },

        /**
         * Translates select-options conditions into OData filters.
         * Include conditions are OR-ed, exclude conditions are AND-ed on top (ABAP RANGES semantics).
         *
         * ALPHA-field safety:
         *   SalesDocument (VBELN) has an ALPHA conversion exit. SAP S/4HANA OData V2 does NOT
         *   support substringof / startswith / endswith on such fields — sending them causes
         *   HTTP 500 ("In the context of Data Services an unknown internal server error occurred").
         *   This function detects ALPHA fields and:
         *     1. Sanitizes values via _sanitizeDocNumber (strips =, *, <, >, !(..)).
         *     2. Remaps Contains/StartsWith/EndsWith → EQ, and their negations → NE.
         *
         * @param {object[]} aConditions  Array of condition objects from the conditionModel
         * @param {string}   sFieldName   OData property name (e.g. "SalesDocument")
         * @returns {sap.ui.model.Filter[]} filters to append to the top-level AND filter array
         */
        _buildConditionFilters: function (aConditions, sFieldName) {
            var that = this;
            // Fields with ALPHA conversion exit — substring operators are unsupported
            var bAlphaField = (sFieldName === "SalesDocument");
            var aInclude = [];
            var aExclude = [];

            (aConditions || []).forEach(function (c) {
                if (!c) {
                    return;
                }
                var oCfg = that._getOperatorConfig(c.operator);
                var sV1 = oCfg.values === 0 ? (oCfg.fixedValue || "") : String(c.value1 || "").trim();
                var sV2 = String(c.value2 || "").trim();

                // Sanitize values for ALPHA fields: strip any residual UI token symbols
                if (bAlphaField) {
                    sV1 = that._sanitizeDocNumber(sV1);
                    sV2 = that._sanitizeDocNumber(sV2);
                }

                if (oCfg.values >= 1 && sV1 === "") {
                    return;
                }
                if (oCfg.values === 2 && sV2 === "") {
                    return;
                }

                // Determine the OData filter operator, remapping unsupported ones for ALPHA fields
                var sFilterOp = oCfg.filterOp;
                if (bAlphaField) {
                    // Include substring operators → EQ (exact match)
                    if (sFilterOp === FilterOperator.Contains ||
                        sFilterOp === FilterOperator.StartsWith ||
                        sFilterOp === FilterOperator.EndsWith) {
                        sFilterOp = FilterOperator.EQ;
                    }
                    // Exclude substring operators → NE
                    if (sFilterOp === FilterOperator.NotContains ||
                        sFilterOp === FilterOperator.NotStartsWith ||
                        sFilterOp === FilterOperator.NotEndsWith) {
                        sFilterOp = FilterOperator.NE;
                    }
                }

                var oFilter = (oCfg.values === 2)
                    ? new Filter(sFieldName, sFilterOp, sV1, sV2)
                    : new Filter(sFieldName, sFilterOp, sV1);

                if (oCfg.sign === "E") {
                    aExclude.push(oFilter);
                } else {
                    aInclude.push(oFilter);
                }
            });

            var aResult = [];
            if (aInclude.length === 1) {
                aResult.push(aInclude[0]);
            } else if (aInclude.length > 1) {
                aResult.push(new Filter({ filters: aInclude, and: false }));
            }
            aExclude.forEach(function (oFilter) {
                aResult.push(oFilter);
            });
            return aResult;
        },

        /** Clears the value states of the condition input row. */
        _clearConditionValueStates: function () {
            var oView = this.getView();
            ["idConditionValue1", "idConditionValue2"].forEach(function (sId) {
                var oInput = oView.byId(sId);
                if (oInput && typeof oInput.setValueState === "function") {
                    oInput.setValueState("None");
                    oInput.setValueStateText("");
                }
            });
        },

        _setConditionValueState: function (sId, sText) {
            var oInput = this.getView().byId(sId);
            if (oInput && typeof oInput.setValueState === "function") {
                oInput.setValueState("Error");
                oInput.setValueStateText(sText);
                oInput.focus();
            }
        },

        _syncPasteToTokensAndConditions: function (sText) {
            if (!sText || typeof sText !== "string") return;
            if (this._bProcessingPaste) return; // Prevent re-entrant calls

            this._bProcessingPaste = true;
            var that = this;

            var aConds = this._parseRawDocNumInput(sText);
            if (aConds.length === 0) {
                this._bProcessingPaste = false;
                return;
            }

            // Merge with the already committed conditions, skipping duplicates
            var aMerged = this._getActiveConditions().slice();
            aConds.forEach(function (oCond) {
                var bExists = aMerged.some(function (c) { return c.tokenKey === oCond.tokenKey; });
                if (!bExists) {
                    aMerged.push(oCond);
                }
            });
            this._setConditions(aMerged);

            var oMultiInput = this.getView().byId("idSDDocNum");
            if (oMultiInput) {
                oMultiInput.setValue("");
            }

            this.onSearch();

            // Keep the guard up long enough to block all cascading events
            // (change, tokenUpdate, submit all fire within ~200ms after paste)
            setTimeout(function () {
                that._bProcessingPaste = false;
            }, 500);
        },

        onSDDocNumChange: function (oEvent) {
            // Guard: skip if paste is being processed (prevents race condition)
            if (this._bProcessingPaste) return;

            var sVal = (oEvent.getParameter("value") || "").trim();
            if (sVal) {
                this._syncPasteToTokensAndConditions(sVal);
            }
        },

        onSDDocNumTokenUpdate: function (oEvent) {
            // Guard: skip if paste is being processed (prevents race condition)
            if (this._bProcessingPaste) return;

            var sType = oEvent.getParameter("type");
            var aRemoved = oEvent.getParameter("removedTokens") || [];

            // Only handle user-initiated token removal (clicking x on a token)
            if (sType === "removed" && aRemoved.length > 0) {
                var aRemovedKeys = aRemoved.map(function (t) { return t.getKey(); });
                this._removeConditionsByTokenKeys(aRemovedKeys);
                this.onSearch();
            }
            // Do NOT handle "added" here — tokens are added by model binding from the conditionModel
            // Handling "added" would create duplicates
        },

        /** Removes committed conditions by token key (FilterBar MultiInput + dialog Tokenizer). */
        _removeConditionsByTokenKeys: function (aTokenKeys) {
            var aKeys = aTokenKeys || [];
            var aConds = this._getActiveConditions().filter(function (c) {
                return aKeys.indexOf(c.tokenKey) === -1;
            });
            this._setConditions(aConds);
        },

        /** sap.m.Tokenizer#tokenDelete inside the Define Conditions dialog (staged, applied on OK). */
        onConditionTokenDelete: function (oEvent) {
            var aTokens = oEvent.getParameter("tokens") || [];
            this._removeConditionsByTokenKeys(aTokens.map(function (t) { return t.getKey(); }));
        },

        /** "Remove All" link / clear (x) button of the Selected Conditions area. */
        onRemoveAllConditions: function () {
            this._setConditions([]);

            var oInput = this.getView().byId("idSDDocNum");
            if (oInput) {
                oInput.setValue("");
            }
        },

        /** Clears the error state while the user is typing a condition value. */
        onConditionValueLiveChange: function () {
            this._clearConditionValueStates();
        },

        /**
         * Operator changed in the input row: recalculate how many value fields are needed
         * and drop the values that are no longer relevant.
         */
        onConditionOperatorChange: function (oEvent) {
            var oCondModel = this.getView().getModel("conditionModel");
            if (!oCondModel) return;

            // Prefer the event payload, the two-way binding may not have been flushed yet
            var sKey = "";
            if (oEvent && typeof oEvent.getParameter === "function") {
                var oItem = oEvent.getParameter("selectedItem");
                if (oItem && typeof oItem.getKey === "function") {
                    sKey = oItem.getKey();
                }
            }
            if (!sKey) {
                sKey = oCondModel.getProperty("/operator") || DEFAULT_CONDITION_OPERATOR;
            }

            var oCfg = this._getOperatorConfig(sKey);
            oCondModel.setProperty("/operator", oCfg.key);
            oCondModel.setProperty("/valueCount", oCfg.values);

            if (oCfg.values === 0) {
                oCondModel.setProperty("/value1", "");
                oCondModel.setProperty("/value2", "");
            } else if (oCfg.values === 1) {
                oCondModel.setProperty("/value2", "");
            }

            this._clearConditionValueStates();
        },

        /** Reads what is currently typed in a condition value field (control wins over the model). */
        _readConditionValue: function (sId, sModelPath) {
            var oInput = this.getView().byId(sId);
            if (oInput && typeof oInput.getValue === "function") {
                return (oInput.getValue() || "").trim();
            }
            var oCondModel = this.getView().getModel("conditionModel");
            var vValue = oCondModel ? oCondModel.getProperty(sModelPath) : "";
            return (vValue === undefined || vValue === null) ? "" : String(vValue).trim();
        },

        /**
         * "Add" button / Enter in a value field: validates the input row and appends the
         * condition to the Selected Conditions area.
         * @param {boolean} [bSilent] true = called from OK, do not toast when the row is empty
         * @returns {boolean} true when the row was committed or was legitimately empty
         */
        onAddCondition: function (bSilent) {
            var oCondModel = this.getView().getModel("conditionModel");
            if (!oCondModel) return false;

            var sOperator = oCondModel.getProperty("/operator") || DEFAULT_CONDITION_OPERATOR;
            var oCfg = this._getOperatorConfig(sOperator);
            var sValue1 = oCfg.values > 0 ? this._readConditionValue("idConditionValue1", "/value1") : "";
            var sValue2 = oCfg.values > 1 ? this._readConditionValue("idConditionValue2", "/value2") : "";

            // Keep the model aligned with what is really typed in the input row
            oCondModel.setProperty("/value1", sValue1);
            oCondModel.setProperty("/value2", sValue2);

            this._clearConditionValueStates();

            // Nothing typed: OK may continue, the Add button complains
            if (oCfg.values > 0 && sValue1 === "" && sValue2 === "") {
                if (bSilent === true) {
                    return true;
                }
                this._setConditionValueState("idConditionValue1", "Enter a value for this condition.");
                return false;
            }

            if (oCfg.values > 0 && sValue1 === "") {
                this._setConditionValueState("idConditionValue1", "Enter a value for this condition.");
                return false;
            }
            if (oCfg.values === 2 && sValue2 === "") {
                this._setConditionValueState("idConditionValue2", "Enter the upper boundary of the range.");
                return false;
            }
            if (oCfg.values === 2 && this._isRangeInverted(sValue1, sValue2)) {
                this._setConditionValueState("idConditionValue2", "The upper boundary must not be lower than the lower boundary.");
                return false;
            }

            var oCond = this._createCondition(sOperator, sValue1, sValue2);
            if (!oCond) {
                this._setConditionValueState("idConditionValue1", "Enter a valid value for this condition.");
                return false;
            }

            var aConds = this._getActiveConditions().slice();
            var bDuplicate = aConds.some(function (c) { return c.tokenKey === oCond.tokenKey; });
            if (bDuplicate) {
                MessageToast.show("Condition " + oCond.tokenText + " has already been added.");
                return true;
            }

            aConds.push(oCond);
            this._setConditions(aConds);

            // Reset the input row but keep the operator (standard Fiori behaviour)
            oCondModel.setProperty("/value1", "");
            oCondModel.setProperty("/value2", "");

            var oInput1 = this.getView().byId("idConditionValue1");
            if (oInput1 && oCfg.values > 0) {
                oInput1.focus();
            }
            return true;
        },

        /** true when both boundaries are comparable and from > to. */
        _isRangeInverted: function (sFrom, sTo) {
            var fFrom = Number(sFrom);
            var fTo = Number(sTo);
            if (!isNaN(fFrom) && !isNaN(fTo) && sFrom !== "" && sTo !== "") {
                return fFrom > fTo;
            }
            return String(sFrom) > String(sTo);
        },

        onSDDocNumValueHelp: function () {
            var oView = this.getView();
            var that = this;

            if (!this._pSDDocNumValueHelpDialog) {
                this._pSDDocNumValueHelpDialog = Fragment.load({
                    id: oView.getId(),
                    name: "myapp.view.fragment.SalesDocValueHelpDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pSDDocNumValueHelpDialog.then(function (oDialog) {
                if (!oDialog) return;
                var oCondModel = oView.getModel("conditionModel");
                if (!oCondModel) return;

                // Raw text typed into the FilterBar MultiInput without pressing Enter counts as a condition
                var oMultiInput = oView.byId("idSDDocNum");
                var sPending = oMultiInput && typeof oMultiInput.getValue === "function" ? (oMultiInput.getValue() || "").trim() : "";
                if (sPending) {
                    var aMerged = that._getActiveConditions().slice();
                    that._parseRawDocNumInput(sPending).forEach(function (oCond) {
                        if (!aMerged.some(function (c) { return c.tokenKey === oCond.tokenKey; })) {
                            aMerged.push(oCond);
                        }
                    });
                    that._setConditions(aMerged);
                    oMultiInput.setValue("");
                }

                // Snapshot for Cancel
                that._aConditionSnapshot = JSON.parse(JSON.stringify(that._getActiveConditions()));

                // Reset the input row
                oCondModel.setProperty("/operator", DEFAULT_CONDITION_OPERATOR);
                oCondModel.setProperty("/value1", "");
                oCondModel.setProperty("/value2", "");
                oCondModel.setProperty("/valueCount", that._getOperatorConfig(DEFAULT_CONDITION_OPERATOR).values);
                that._clearConditionValueStates();

                oDialog.open();
            }).catch(function (oErr) {
                console.error("Error opening SalesDocValueHelpDialog:", oErr);
                that._pSDDocNumValueHelpDialog = null;
            });
        },

        onSDDocNumValueHelpOK: function () {
            // Commit a value that was typed but never added (standard Fiori behaviour)
            if (this.onAddCondition(true) === false) {
                return;
            }

            var oView = this.getView();
            var oInput = oView.byId("idSDDocNum");
            if (oInput) {
                oInput.setValue("");
            }

            this._aConditionSnapshot = null;

            if (this._pSDDocNumValueHelpDialog) {
                this._pSDDocNumValueHelpDialog.then(function (oDialog) {
                    if (oDialog) oDialog.close();
                });
            }

            this.onSearch();
        },

        onSDDocNumValueHelpCancel: function () {
            // Restore the conditions as they were when the dialog was opened
            if (this._aConditionSnapshot) {
                this._setConditions(this._aConditionSnapshot);
                this._aConditionSnapshot = null;
            }
            this._clearConditionValueStates();

            if (this._pSDDocNumValueHelpDialog) {
                this._pSDDocNumValueHelpDialog.then(function (oDialog) {
                    if (oDialog) oDialog.close();
                });
            }
        },

        onSoldToPartyValueHelp: function () {
            var oView = this.getView();

            if (!this._pSoldToPartyValueHelpDialog) {
                this._pSoldToPartyValueHelpDialog = Fragment.load({
                    id: oView.getId(),
                    name: "myapp.view.fragment.SoldToPartyValueHelpDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pSoldToPartyValueHelpDialog.then(function (oDialog) {
                oDialog.open();
                var oBinding = oDialog.getBinding("items");
                if (oBinding) {
                    oBinding.filter([]);
                }
            });
        },

        onSoldToPartyValueHelpSearch: function (oEvent) {
            var sValue = (oEvent.getParameter("value") || "").trim();
            var oBinding = oEvent.getSource().getBinding("items");
            if (!oBinding) return;

            var aFilters = [];
            if (sValue) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("soldToParty", FilterOperator.Contains, sValue),
                        new Filter("salesOrg", FilterOperator.Contains, sValue)
                    ],
                    and: false
                }));
            }
            oBinding.filter(aFilters);
        },

        onSoldToPartyValueHelpConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) return;

            var oContext = oSelectedItem.getBindingContext("reportModel");
            if (!oContext) return;

            var sSoldTo = oContext.getProperty("soldToParty") || "";
            var oView = this.getView();
            var oModel = oView.getModel("adaptFilterModel");

            if (oModel) {
                oModel.setProperty("/fieldValues/soldToParty", sSoldTo);
                var aFields = oModel.getProperty("/fields") || [];
                aFields.forEach(function (f) {
                    if (f.key === "soldToParty") {
                        f.value = sSoldTo;
                    }
                });
                oModel.setProperty("/fields", aFields);
            }

            var oInput = oView.byId("idSoldToParty");
            if (oInput) {
                oInput.setValue(sSoldTo);
            }

            this.onSearch();
        },

        onSoldToPartyValueHelpCancel: function () {
            // Dialog closes automatically
        },

        onAdaptFieldValueHelp: function (oEvent) {
            var oSource = oEvent.getSource();
            var oBindingContext = oSource.getBindingContext("adaptFilterModel");
            if (!oBindingContext) return;

            var sKey = oBindingContext.getProperty("key");
            if (sKey === "sdDocNum") {
                this.onSDDocNumValueHelp();
            } else if (sKey === "soldToParty") {
                this.onSoldToPartyValueHelp();
            }
        },

        // ==========================================
        // TABLE SETTINGS / PERSONALIZATION (P13N)
        // ==========================================

        onTableSettingsPress: function () {
            var oView = this.getView();

            if (!this._pTableSettingsDialog) {
                this._pTableSettingsDialog = Fragment.load({
                    id: oView.getId(),
                    name: "myapp.view.fragment.TableSettingsDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pTableSettingsDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onColumnSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue") || "";
            var oList = this.getView().byId("idColumnsList");
            if (oList) {
                var oBinding = oList.getBinding("items");
                if (oBinding) {
                    if (sQuery.trim() !== "") {
                        oBinding.filter([new Filter("label", FilterOperator.Contains, sQuery)]);
                    } else {
                        oBinding.filter([]);
                    }
                }
            }
        },

        onSelectAllColumns: function () {
            var oModel = this.getView().getModel("tableSettingsModel");
            var aColumns = oModel.getProperty("/columns") || [];
            aColumns.forEach(function (c) {
                c.visible = true;
            });
            oModel.setProperty("/columns", aColumns);
            MessageToast.show("All columns selected.");
        },

        onDeselectAllColumns: function () {
            var oModel = this.getView().getModel("tableSettingsModel");
            var aColumns = oModel.getProperty("/columns") || [];
            aColumns.forEach(function (c) {
                c.visible = c.key === "sdDocNum";
            });
            oModel.setProperty("/columns", aColumns);
            MessageToast.show("Columns deselected (SD Document Number retained).");
        },

        /**
         * Standard Fiori ViewSettingsDialog Confirm Event Handler
         */
        onConfirmTableSettings: function (oEvent) {
            var mParams = oEvent.getParameters();
            var oView = this.getView();
            var oModel = oView.getModel("tableSettingsModel");
            var aColumns = oModel.getProperty("/columns") || [];

            // 1. Sync column visibility from CustomTab
            var oColVisibility = {};
            aColumns.forEach(function (c) {
                oColVisibility[c.key] = !!c.visible;
            });
            oModel.setProperty("/colVisibility", oColVisibility);
            oModel.refresh(true);

            var oTable = oView.byId("idDocFlowTable");
            if (!oTable) {
                return;
            }
            var oBinding = oTable.getBinding("items");
            if (!oBinding) {
                return;
            }

            var aSorters = [];

            // 2. Apply Grouping if selected
            if (mParams.groupItem) {
                var sGroupPath = mParams.groupItem.getKey();
                var bGroupDesc = mParams.groupDescending;
                var vGroup = function (oContext) {
                    var sVal = oContext.getProperty(sGroupPath) || "Unknown";
                    return {
                        key: sVal,
                        text: sVal
                    };
                };
                aSorters.push(new Sorter(sGroupPath, bGroupDesc, vGroup));
            }

            // 3. Apply Sorting
            if (mParams.sortItem) {
                var sSortPath = mParams.sortItem.getKey();
                var bSortDesc = mParams.sortDescending;
                aSorters.push(new Sorter(sSortPath, bSortDesc));
            }

            oBinding.sort(aSorters);

            // 4. Apply Multi-category Filters
            var aFilters = [];
            if (mParams.filterItems && mParams.filterItems.length > 0) {
                var aPhaseFilters = [];
                var aStatusFilters = [];

                mParams.filterItems.forEach(function (oItem) {
                    var sKey = oItem.getKey();
                    var oParent = oItem.getParent();
                    var sParentKey = oParent && oParent.getKey ? oParent.getKey() : "";

                    if (sParentKey === "processPhaseFilter") {
                        aPhaseFilters.push(new Filter("processPhase", FilterOperator.EQ, sKey));
                    } else if (sParentKey === "statusFilter") {
                        aStatusFilters.push(new Filter("status", FilterOperator.Contains, sKey));
                    }
                });

                if (aPhaseFilters.length > 0) {
                    aFilters.push(new Filter({ filters: aPhaseFilters, and: false }));
                }
                if (aStatusFilters.length > 0) {
                    aFilters.push(new Filter({ filters: aStatusFilters, and: false }));
                }
            }

            oBinding.filter(aFilters);

            var sMsg = "View settings applied.";
            if (mParams.filterString) {
                sMsg += " (" + mParams.filterString + ")";
            }
            MessageToast.show(sMsg);
        },

        onResetTableSettings: function () {
            var oView = this.getView();
            var oModel = oView.getModel("tableSettingsModel");
            var aColumns = oModel.getProperty("/columns") || [];

            // Reset to default 4 columns
            aColumns.forEach(function (c) {
                if (c.key === "sdDocNum" || c.key === "overallFulfilment" || c.key === "processPhase" || c.key === "orderProcessing") {
                    c.visible = true;
                } else {
                    c.visible = false;
                }
            });
            oModel.setProperty("/columns", aColumns);

            var oColVisibility = {};
            aColumns.forEach(function (c) {
                oColVisibility[c.key] = !!c.visible;
            });
            oModel.setProperty("/colVisibility", oColVisibility);
            oModel.refresh(true);

            // Reset table sorting & filtering to default
            var oTable = oView.byId("idDocFlowTable");
            if (oTable) {
                var oBinding = oTable.getBinding("items");
                if (oBinding) {
                    oBinding.sort([new Sorter("sdDocNum", false)]);
                    oBinding.filter([]);
                }
            }

            MessageToast.show("View settings reset to default (4 standard columns).");
        },

        // ==========================================
        // ROW SELECTION & PROCESS FLOW TRIGGER
        // ==========================================

        onTableSelectionChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("listItem");
            var oBtn = this.getView().byId("idBtnViewFlow");
            if (oBtn) {
                oBtn.setEnabled(!!oSelectedItem);
            }
            if (oSelectedItem && typeof oSelectedItem.getBindingContext === "function") {
                var oContext = oSelectedItem.getBindingContext("reportModel");
                if (oContext) {
                    var oData = oContext.getObject();
                    this._openDocumentFlow(oData.sdDocNum || oData.salesOrder, oData);
                }
            }
        },

        onDocLinkPress: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource && typeof oSource.getBindingContext === "function" ? oSource.getBindingContext("reportModel") : null;
            if (oContext) {
                var oData = oContext.getObject();
                this._openDocumentFlow(oData.sdDocNum || oData.salesOrder, oData);
            }
        },

        onRowPress: function (oEvent) {
            var oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            var oContext = oItem && typeof oItem.getBindingContext === "function" ? oItem.getBindingContext("reportModel") : null;
            if (oContext) {
                var oData = oContext.getObject();
                this._openDocumentFlow(oData.sdDocNum || oData.salesOrder, oData);
            }
        },

        onOpenDocFlowPress: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton && typeof oButton.getBindingContext === "function" ? oButton.getBindingContext("reportModel") : null;
            if (oContext) {
                var oData = oContext.getObject();
                this._openDocumentFlow(oData.sdDocNum || oData.salesOrder, oData);
            }
        },

        onViewFlowSelectedPress: function () {
            var oTable = this.getView().byId("idDocFlowTable");
            var oSelectedItem = oTable.getSelectedItem();
            if (!oSelectedItem) {
                MessageToast.show("Please select a document row first.");
                return;
            }
            var oContext = oSelectedItem.getBindingContext("reportModel");
            if (oContext) {
                var oData = oContext.getObject();
                this._openDocumentFlow(oData.sdDocNum || oData.salesOrder, oData);
            }
        },

        /**
         * Open Process Flow Dialog and load relations from RAP backend
         */
        _openDocumentFlow: function (sSalesDocument, oHeaderData) {
            var oView = this.getView();
            var that = this;

            sap.ui.core.BusyIndicator.show(0);

            if (!this._pProcessFlowDialog) {
                this._pProcessFlowDialog = Fragment.load({
                    id: oView.getId(),
                    name: "myapp.view.fragment.ProcessFlowDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pProcessFlowDialog.then(function (oDialog) {
                sap.ui.core.BusyIndicator.hide();
                oDialog.open();

                var oPFModel = oView.getModel("pfModel");
                // Immediately reset previous flow data so user never sees stale document data
                oPFModel.setProperty("/lanes", []);
                oPFModel.setProperty("/nodes", []);
                oPFModel.setProperty("/totalNodes", 0);
                oPFModel.setProperty("/busy", true);

                var sDocTitle = oHeaderData && oHeaderData.sdDocNum ? oHeaderData.sdDocNum : sSalesDocument;
                var sCustomerTitle = oHeaderData && oHeaderData.soldToParty ? oHeaderData.soldToParty : ("Sales Order " + sSalesDocument);
                
                oPFModel.setProperty("/dialogTitle", "Process Flow: " + sDocTitle);
                oPFModel.setProperty("/anchorDoc", sSalesDocument);
                oPFModel.setProperty("/anchorCategoryText", sCustomerTitle);

                that._fetchDocRelations(sSalesDocument, oHeaderData, function (aRelations) {
                    try {
                        that._transformAndBindProcessFlow(sSalesDocument, aRelations, oHeaderData);
                    } catch (err) {
                        console.error("ProcessFlow render error:", err);
                        MessageToast.show("Process Flow render error: " + (err && err.message ? err.message : err));
                    } finally {
                        oPFModel.setProperty("/busy", false);
                    }

                    that._pfRefreshDiagram();
                });
            });
        },

        /**
         * Fetch live Process Flow document relations directly from SAP RAP OData V4 (/DocRelations).
         * 100% live SAP data - tidak ada mock/fallback lokal.
         *
         * Anti-cache:
         *  - binding baru dibuat setiap kali dialog dibuka (V4 cache melekat pada binding)
         *  - $$groupId "$direct" -> request langsung, tidak digabung ke batch berikutnya
         *  - bParaRefresh = true -> model.refresh() dulu supaya cache response lama dibuang
         */
        _fetchDocRelations: function (sAnchorDoc, oHeaderData, fnCallback, bForceRefresh) {
            var that = this;
            var oODataModel = this.getView().getModel("rapFlowService");

            this._aLastRelations = [];

            if (!oODataModel || typeof oODataModel.bindList !== "function") {
                MessageBox.error("Model OData V4 ('rapFlowService') tidak ditemukan di manifest.json.", { title: "OData Model Error" });
                fnCallback([]);
                return;
            }

            if (bForceRefresh === true) {
                try {
                    oODataModel.refresh();
                } catch (eRefresh) {
                    console.warn("RAP model refresh skipped:", eRefresh);
                }
            }

            try {
                var oListBinding = oODataModel.bindList("/DocRelations", null, null, [
                    new Filter("AnchorSalesDocument", FilterOperator.EQ, String(sAnchorDoc))
                ], {
                    "$$groupId": "$direct"
                });

                oListBinding.requestContexts(0, 500).then(function (aContexts) {
                    var aData = (aContexts || []).map(function (oCtx) {
                        return oCtx.getObject();
                    }).filter(function (o) {
                        return !!o;
                    });

                    that._aLastRelations = aData;

                    if (aData.length > 0) {
                        MessageToast.show("Live SAP: Alur dokumen (" + aData.length + " node) berhasil dimuat.");
                    } else {
                        MessageToast.show("Live SAP: Tidak ditemukan relasi dokumen (0 node) untuk dokumen " + sAnchorDoc);
                    }
                    fnCallback(aData);
                }).catch(function (err) {
                    console.error("Error fetching live /DocRelations from SAP RAP OData V4:", err);
                    var sErrMsg = (err && (err.message || (err.error && err.error.message))) || "Gagal menghubungi layanan RAP OData V4.";
                    MessageBox.error(
                        "Gagal memuat Process Flow dari SAP Backend:\n\n" + sErrMsg + "\n\n" +
                        "Pastikan Service Binding ZUI_SD_DOCFLOW (OData V4) aktif di SAP Gateway.",
                        { title: "SAP Process Flow Error" }
                    );
                    fnCallback([]);
                });
            } catch (e) {
                console.error("Exception requesting SAP RAP OData V4:", e);
                MessageBox.error("Exception saat memanggil OData V4 RAP: " + (e.message || e), { title: "SAP Exception Error" });
                fnCallback([]);
            }
        },

        /**
         * Transform live RAP /DocRelations rows -> sap.suite.ui.commons.ProcessFlow model.
         *
         * Kontrak backend (ZR_SD_DocRelation):
         *   DocNumber      : nomor dokumen / key phantom (PLDEL_*, PLINV_*, PLJE_*)
         *   DocCategory    : VBTYP (A B C E F G H I K L J T h M N O P S U, 'g'/'+' = Journal Entry)
         *   LaneKey        : lane_inquiry | lane_quotation | lane_order | lane_delivery |
         *                    lane_invoicing | lane_customer_return | lane_accounting
         *                    (opsional, fallback dari DocCategory)
         *   Status         : Positive | Critical | Negative | Neutral | Planned | PlannedNegative
         *                    (nilai legacy 'Warning'/'Error' tetap diterima)
         *   NodeType       : 'Single' | 'Planned'
         *   SortOrder      : urutan render (lane * 1000 + n)
         *   SubsequentDocs : 'node_x,node_y'  (anak)
         *   PrecedingDocs  : 'node_x,node_y'  (induk -> dipakai untuk wiring node phantom)
         */
        _transformAndBindProcessFlow: function (sAnchorDoc, aRelations, oHeaderData) {
            var oPFModel = this.getView().getModel("pfModel");
            var that = this;

            if (!aRelations || aRelations.length === 0) {
                oPFModel.setProperty("/lanes", []);
                oPFModel.setProperty("/nodes", []);
                oPFModel.setProperty("/totalNodes", 0);
                oPFModel.setProperty("/plannedNodes", 0);
                oPFModel.setProperty("/overallStatusText", "No Flow Data");
                oPFModel.setProperty("/overallStatusState", "None");
                oPFModel.refresh(true);
                return;
            }

            var aNodes = this._pfBuildNodes(sAnchorDoc, aRelations);
            this._pfWireRelations(aNodes, sAnchorDoc);

            // Turunkan 'Invoicing Issue' dari konteks graf. Wajib dilakukan di sisi
            // UI karena sap.suite.ui.commons.ProcessFlowNode SENGAJA menyembunyikan
            // ikon dan teks status untuk state 'Planned' (lihat ProcessFlowNode.js:
            // _getStateIcon -> sSrc = null, _getStateTextControl -> sText = ""),
            // sehingga node bermasalah harus benar-benar berstate 'PlannedNegative'
            // agar tampil silang merah + ring lane MERAH seperti standar F2577.
            this._pfApplyInvoicingIssues(aNodes);

            if (oPFModel.getProperty("/compactMode") === true) {
                aNodes = this._pfCompactLanes(aNodes);
            }

            // 1. Buang relasi pintas (Order -> Invoice saat Order -> Delivery -> Invoice ada)
            //    supaya tiap lane hanya punya satu edge masuk pada rantai utama.
            this._pfPruneShortcutEdges(aNodes);

            // 2. Topological sort: induk SELALU mendahului anak, dengan tie-break
            //    lane -> sortOrder. ProcessFlow menempatkan node pada Row 0 selama
            //    urutan array mengikuti urutan rantai, sehingga alur sequential
            //    (Order -> Delivery -> Invoice -> Journal Entry) rata di baris 0.
            aNodes = this._pfTopologicalSort(aNodes);

            var aLanes = this._pfBuildLanes(aNodes);

            var iPlanned = aNodes.filter(function (n) { return n.__planned === true; }).length;
            var bHasError = aNodes.some(function (n) {
                return that._pfNodeHasState(n, ["Negative", "PlannedNegative"]);
            });
            var bHasWarning = aNodes.some(function (n) {
                return that._pfNodeHasState(n, ["Critical"]);
            });
            var sOverallStatus;
            var sOverallState;

            if (bHasError) {
                sOverallStatus = "Error / Blocked";
                sOverallState = "Error";
            } else if (bHasWarning) {
                sOverallStatus = "Warning / In Process";
                sOverallState = "Warning";
            } else if (iPlanned > 0) {
                sOverallStatus = "Open / Planned Steps";
                sOverallState = "Information";
            } else {
                sOverallStatus = "Completed / Normal";
                sOverallState = "Success";
            }

            oPFModel.setProperty("/lanes", aLanes);
            oPFModel.setProperty("/nodes", aNodes);
            oPFModel.setProperty("/totalNodes", aNodes.length);
            oPFModel.setProperty("/plannedNodes", iPlanned);
            oPFModel.setProperty("/overallStatusText", sOverallStatus);
            oPFModel.setProperty("/overallStatusState", sOverallState);
            oPFModel.setProperty("/lastLoadedAt", new Date().toLocaleTimeString());
            oPFModel.refresh(true);
        },

        /**
         * 7 lane standar proses SD S/4HANA (F2577 Track Sales Orders).
         * Urutan kolom identik standar:
         * Order -> Delivery -> Invoicing -> Accounting -> Customer Return Processing.
         */
        _pfLaneCatalog: function () {
            return [
                { laneId: "lane_inquiry", iconSrc: "sap-icon://request", text: "Inquiry", position: 0 },
                { laneId: "lane_quotation", iconSrc: "sap-icon://sales-quote", text: "Quotation Processing", position: 1 },
                { laneId: "lane_order", iconSrc: "sap-icon://sales-order", text: "Order Processing", position: 2 },
                { laneId: "lane_delivery", iconSrc: "sap-icon://shipping-status", text: "Delivery Processing", position: 3 },
                { laneId: "lane_invoicing", iconSrc: "sap-icon://sales-order-item", text: "Invoicing", position: 4 },
                { laneId: "lane_accounting", iconSrc: "sap-icon://customer-financial-fact-sheet", text: "Accounting", position: 5 },
                { laneId: "lane_customer_return", iconSrc: "sap-icon://undo", text: "Customer Return Processing", position: 6 }
            ];
        },

        /**
         * Tandai node Planned Invoice yang penagihannya bermasalah sebagai
         * 'PlannedNegative' + 'Invoicing Issue' (standar F2577 Gambar 2).
         *
         * Aturan (identik logika backend HAS_INVOICING_ISSUE):
         *   - induk berupa Part Delivery nyata yang sudah PGI (state Positive =
         *     'Shipped') tetapi faktur belum pernah dibuat  -> Invoicing Issue
         *   - induk berupa Sales Part nyata yang sudah bertuliskan 'Not Invoiced'
         *     (order-related billing terblokir)              -> Invoicing Issue
         *
         * Node Planned Invoice yang induknya juga masih planned (mis. Planned
         * Delivery pada dokumen 2110000172) TIDAK ditandai: pada standar node itu
         * memang abu-abu karena langkah sebelumnya belum terjadi.
         */
        _pfApplyInvoicingIssues: function (aNodes) {
            var oById = {};
            var oParents = {};

            (aNodes || []).forEach(function (n) {
                oById[n.nodeId] = n;
                oParents[n.nodeId] = [];
            });
            (aNodes || []).forEach(function (n) {
                (n.children || []).forEach(function (sId) {
                    if (oParents[sId]) {
                        oParents[sId].push(n.nodeId);
                    }
                });
            });

            (aNodes || []).forEach(function (oNode) {
                if (oNode.laneId !== "lane_invoicing" || oNode.__planned !== true) {
                    return;
                }
                if (oNode.state === "PlannedNegative") {
                    return; // backend sudah menandainya
                }

                var bIssue = oParents[oNode.nodeId].some(function (sParentId) {
                    var oParent = oById[sParentId];
                    if (!oParent || oParent.__planned === true) {
                        return false;
                    }
                    if (oParent.laneId === "lane_delivery") {
                        return oParent.state === "Positive";
                    }
                    if (oParent.laneId === "lane_order") {
                        return (oParent.texts || []).some(function (sText) {
                            return /not invoiced/i.test(String(sText));
                        });
                    }
                    return false;
                });

                if (!bIssue) {
                    return;
                }

                oNode.state = "PlannedNegative";
                if (!oNode.stateText || /^not yet invoiced$/i.test(oNode.stateText)) {
                    oNode.stateText = "Invoicing Issue";
                }
                // Standar F2577 tidak mengulang teks status pada baris teks kartu.
                oNode.texts = (oNode.texts || []).filter(function (sText) {
                    return !/^not yet invoiced$/i.test(String(sText));
                });
            });

            return aNodes;
        },

        /**
         * Prioritas node pada rantai utama (Row 0). Standar F2577 meneruskan
         * rantai utama ke Customer Return Processing dan menurunkan Journal Entry
         * (lane Accounting) ke baris berikutnya, jadi lane Accounting selalu
         * diurutkan paling akhir walau posisi kolomnya di sebelah kiri.
         */
        _pfChainRankOf: function (oNode) {
            if (!oNode) {
                return 99;
            }
            return oNode.laneId === "lane_accounting" ? 98 : oNode.__lanePos;
        },

        /**
         * Kategori dokumen (VBTYP) yang TIDAK pernah dirender sebagai kartu sendiri
         * pada standar F2577:
         *   'R'/'Q' : material document / pergerakan barang (mis. 4900001563)
         *   'T'/'h' : returns delivery (mis. 8420000011) -> dilipat ke Return Part
         * Backend sudah melipatnya; ini pengaman lapis kedua di sisi UI.
         */
        _pfIsFoldedCategory: function (sCategory) {
            return sCategory === "R" || sCategory === "Q" ||
                sCategory === "T" || sCategory === "h";
        },

        _pfLaneIdOf: function (sCategory) {
            switch (sCategory) {
                case "A": return "lane_inquiry";
                case "B": return "lane_quotation";
                case "C":
                case "E":
                case "F":
                case "G":
                case "I":
                case "K":
                case "L": return "lane_order";
                case "J":
                case "R":
                case "Q": return "lane_delivery";
                case "M":
                case "N":
                case "O":
                case "P":
                case "S":
                case "U": return "lane_invoicing";
                // Retur pelanggan: order retur ('H') + pengiriman retur ('T'/'h')
                case "H":
                case "T":
                case "h": return "lane_customer_return";
                case "g":
                case "r":
                case "+": return "lane_accounting";
                default: return "lane_order";
            }
        },

        /**
         * Key node backend dapat memakai sufiks pembeda ('90000002#JE') bila nomor
         * dokumen FI identik dengan nomor faktur. Sufiks itu hanya key internal,
         * jadi tampilan kartu / popover memakai nomor bersihnya.
         */
        _pfDisplayDocNumber: function (sDocNum) {
            return String(sDocNum || "").split("#")[0];
        },

        _pfAbbrOf: function (sCategory) {
            switch (sCategory) {
                case "A": return "INQ";
                case "B": return "QT";
                case "C":
                case "E":
                case "F":
                case "G": return "SO";
                case "H": return "RE";
                case "I": return "FOC";
                case "K": return "CR";
                case "L": return "DR";
                case "J": return "OD";
                case "T":
                case "h": return "RD";
                case "R":
                case "Q": return "GI";
                case "M": return "INV";
                case "N": return "CAN";
                case "O": return "CM";
                case "P": return "DM";
                case "U": return "PF";
                case "g":
                case "r":
                case "+": return "JE";
                default: return "DOC";
            }
        },

        _pfSubtitleOf: function (sCategory) {
            switch (sCategory) {
                case "A": return "Inquiry Document";
                case "B": return "Quotation Document";
                case "C":
                case "E":
                case "F":
                case "G": return "Sales Document";
                case "H": return "Customer Return";
                case "I": return "Free of Charge Order";
                case "K":
                case "L": return "Memo Request";
                case "J": return "Outbound Delivery";
                case "T":
                case "h": return "Returns Delivery";
                case "R":
                case "Q": return "Goods Movement";
                case "M":
                case "N":
                case "U": return "Billing Document";
                case "O":
                case "P": return "Credit / Debit Memo";
                case "g":
                case "r":
                case "+": return "Journal Entry / Accounting";
                default: return "SD Document";
            }
        },

        _pfIconOf: function (sCategory) {
            switch (sCategory) {
                case "A": return "sap-icon://request";
                case "B": return "sap-icon://sales-quote";
                case "H":
                case "T":
                case "h": return "sap-icon://undo";
                case "J":
                case "R":
                case "Q": return "sap-icon://shipping-status";
                case "M":
                case "N":
                case "O":
                case "P":
                case "U": return "sap-icon://sales-order-item";
                case "g":
                case "r":
                case "+": return "sap-icon://customer-financial-fact-sheet";
                default: return "sap-icon://sales-order";
            }
        },

        /**
         * Backend Status -> sap.suite.ui.commons.ProcessFlowNodeState
         * (Positive | Critical | Negative | Neutral | Planned | PlannedNegative)
         */
        _pfStateOf: function (sStatus) {
            switch (String(sStatus || "").trim()) {
                case "Positive":
                case "Success": return "Positive";
                case "Critical":
                case "Warning": return "Critical";
                case "Negative":
                case "Error": return "Negative";
                case "Planned":
                case "PlannedNeutral": return "Planned";
                case "PlannedNegative": return "PlannedNegative";
                case "Neutral":
                case "None":
                case "Information": return "Neutral";
                default: return "Neutral";
            }
        },

        _pfObjectStatusState: function (vState) {
            var sState = Array.isArray(vState) ? "" : String(vState || "");
            switch (sState) {
                case "Positive": return "Success";
                case "Critical": return "Warning";
                case "Negative":
                case "PlannedNegative": return "Error";
                case "Planned": return "Information";
                default: return "None";
            }
        },

        /**
         * Kumpulkan state sebuah node sebagai array string.
         * ProcessFlowNode Aggregated (compact mode) memakai array [{state,value}],
         * node Single memakai string -> keduanya harus terdeteksi sama.
         */
        _pfNodeStates: function (oNode) {
            if (!oNode) {
                return [];
            }
            if (Array.isArray(oNode.state)) {
                return oNode.state.map(function (oSt) {
                    return String((oSt && oSt.state) || "");
                });
            }
            return [String(oNode.state || "")];
        },

        _pfNodeHasState: function (oNode, aWanted) {
            var aStates = this._pfNodeStates(oNode);
            return aStates.some(function (sState) {
                return aWanted.indexOf(sState) !== -1;
            });
        },

        /**
         * Prioritas render segmen donut lane header: error paling dulu supaya
         * lane yang mengandung node Negative tampil sebagai ring MERAH (standar F2577).
         */
        _pfLaneStatePriority: function (sState) {
            switch (sState) {
                case "Negative": return 0;
                case "Critical": return 1;
                case "Positive": return 2;
                default: return 3;
            }
        },

        /**
         * 'node_a,node_b' -> ["node_a","node_b"] (unik, tanpa spasi, selalu berprefiks node_)
         */
        _pfSplitDocs: function (vValue) {
            if (!vValue || typeof vValue !== "string") {
                return [];
            }
            var oSeen = {};
            var aOut = [];
            vValue.split(",").forEach(function (s) {
                var sClean = String(s).trim();
                if (!sClean) {
                    return;
                }
                if (sClean.indexOf("node_") !== 0) {
                    sClean = "node_" + sClean;
                }
                if (!oSeen[sClean]) {
                    oSeen[sClean] = true;
                    aOut.push(sClean);
                }
            });
            return aOut;
        },

        _pfPlainDocList: function (vValue) {
            var that = this;
            var aDocs = this._pfSplitDocs(vValue).map(function (s) {
                return that._pfDisplayDocNumber(s.replace(/^node_/, ""));
            });
            return aDocs.length ? aDocs.join(", ") : "-";
        },

        /**
         * Edm.Date ("2026-03-12") / DATS ("20260312") / Date -> tanggal lokal user
         */
        _pfFormatDate: function (vValue) {
            if (!vValue) {
                return "-";
            }
            if (!this._oPFDateFormat) {
                this._oPFDateFormat = DateFormat.getDateInstance({ style: "medium" });
            }
            if (vValue instanceof Date) {
                return this._oPFDateFormat.format(vValue);
            }
            var sVal = String(vValue).trim();
            if (!sVal || sVal === "0000-00-00" || sVal === "00000000" || sVal === "-") {
                return "-";
            }
            var aMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(sVal);
            if (!aMatch) {
                aMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(sVal);
            }
            if (aMatch) {
                var oDate = new Date(parseInt(aMatch[1], 10), parseInt(aMatch[2], 10) - 1, parseInt(aMatch[3], 10));
                if (!isNaN(oDate.getTime())) {
                    return this._oPFDateFormat.format(oDate);
                }
            }
            return sVal;
        },

        _pfFormatAmount: function (vValue, sCurrency) {
            if (vValue === undefined || vValue === null || vValue === "") {
                return "-";
            }
            var fValue = parseFloat(vValue);
            if (isNaN(fValue)) {
                return String(vValue);
            }
            if (!this._oPFAmountFormat) {
                this._oPFAmountFormat = NumberFormat.getCurrencyInstance({ showMeasure: false });
            }
            var sAmount = this._oPFAmountFormat.format(fValue, sCurrency || undefined);
            return sCurrency ? (sAmount + " " + sCurrency) : sAmount;
        },

        /**
         * Bangun array ProcessFlowNode dari baris OData V4
         */
        _pfBuildNodes: function (sAnchorDoc, aRelations) {
            var that = this;
            var oLanePos = {};
            this._pfLaneCatalog().forEach(function (l) {
                oLanePos[l.laneId] = l.position;
            });

            var sAnchor = String(sAnchorDoc || "").trim();
            var sAnchorExt = sAnchor.replace(/^0+/, "");
            var oSeen = {};
            var aNodes = [];

            aRelations.forEach(function (item) {
                if (!item) {
                    return;
                }
                var sDocNum = String(item.DocNumber || "").trim();
                if (!sDocNum) {
                    return;
                }
                var sNodeId = sDocNum.indexOf("node_") === 0 ? sDocNum : ("node_" + sDocNum);
                if (oSeen[sNodeId]) {
                    return;
                }
                oSeen[sNodeId] = true;

                var sCategory = String(item.DocCategory || "").trim();

                // Dokumen pergerakan barang / material document tidak pernah menjadi
                // kartu sendiri di F2577 (mis. 'Returns Delivery 4900001563').
                // Backend sudah melipatnya, ini hanya pengaman lapis kedua.
                if (that._pfIsFoldedCategory(sCategory)) {
                    return;
                }

                var sLaneId = String(item.LaneKey || "").trim();
                if (!sLaneId || oLanePos[sLaneId] === undefined) {
                    sLaneId = that._pfLaneIdOf(sCategory);
                }

                var sState = that._pfStateOf(item.Status);
                var bPlanned = String(item.NodeType || item.type || "").trim() === "Planned" ||
                    sState === "Planned" ||
                    sState === "PlannedNegative" ||
                    /^(PLDEL_|PLINV_|PLJE_|planned_)/i.test(sDocNum);

                if (bPlanned && sState !== "PlannedNegative") {
                    sState = "Planned";
                }

                // Node planned yang membawa masalah (Invoicing Issue / Billing Blocked /
                // Delivery Blocked) harus PlannedNegative: silang merah pada kartu dan
                // ring donat lane (mis. lane Invoicing) berubah MERAH seperti F2577.
                if (bPlanned && /issue|blocked|rejected/i.test(String(item.StatusText || ""))) {
                    sState = "PlannedNegative";
                }

                var aTexts = [];
                if (item.ExtraLine1) {
                    aTexts.push(String(item.ExtraLine1));
                }
                if (item.ExtraLine2) {
                    aTexts.push(String(item.ExtraLine2));
                }
                if (aTexts.length === 0) {
                    aTexts.push("Created On " + that._pfFormatDate(item.CreatedOnDate));
                    if (item.StatusText) {
                        aTexts.push(String(item.StatusText));
                    }
                }

                var sDocTitle = String(item.DocTitle || "").trim();
                var sDocDisplay = that._pfDisplayDocNumber(sDocNum);
                var sTitle;
                if (bPlanned) {
                    sTitle = sDocTitle || "Planned Document";
                } else if (sDocTitle) {
                    sTitle = sDocTitle + " " + sDocDisplay;
                } else {
                    sTitle = sDocDisplay;
                }

                var iSortOrder = parseInt(item.SortOrder, 10);
                if (isNaN(iSortOrder)) {
                    iSortOrder = (oLanePos[sLaneId] + 1) * 1000;
                }

                aNodes.push({
                    nodeId: sNodeId,
                    laneId: sLaneId,
                    title: sTitle,
                    titleAbbreviation: that._pfAbbrOf(sCategory),
                    type: "Single",
                    children: that._pfSplitDocs(item.SubsequentDocs),
                    state: sState,
                    stateText: String(item.StatusText || ""),
                    texts: aTexts,
                    focused: !bPlanned && (sDocDisplay === sAnchor || sDocDisplay === sAnchorExt),
                    __parents: that._pfSplitDocs(item.PrecedingDocs),
                    __lanePos: oLanePos[sLaneId] !== undefined ? oLanePos[sLaneId] : 99,
                    __sortOrder: iSortOrder,
                    __planned: bPlanned,
                    __docNumber: sDocDisplay,
                    raw: item
                });
            });

            return aNodes;
        },

        /**
         * Bereskan relasi antar node:
         *  1. Buang referensi anak yang tidak valid / mundur (anti-cycle -> ProcessFlow tidak crash)
         *  2. Terapkan PrecedingDocs (sumber utama wiring node phantom dari backend)
         *  3. Auto-wire node orphan (tanpa induk) ke lane terdekat sebelumnya,
         *     dengan pasangan 1:1 agar multi-delivery -> multi-planned-invoice tidak menumpuk
         */
        _pfWireRelations: function (aNodes, sAnchorDoc) {
            var oById = {};
            aNodes.forEach(function (n) {
                oById[n.nodeId] = n;
            });

            var fnAllowed = function (oParent, oChild) {
                if (!oParent || !oChild || oParent.nodeId === oChild.nodeId) {
                    return false;
                }
                if (oChild.__lanePos > oParent.__lanePos) {
                    return true;
                }
                // Dalam lane yang sama hanya boleh maju (mencegah cycle)
                return oChild.__lanePos === oParent.__lanePos && oChild.__sortOrder > oParent.__sortOrder;
            };

            // 1. sanitasi children
            aNodes.forEach(function (n) {
                n.children = (n.children || []).filter(function (sId) {
                    return fnAllowed(n, oById[sId]);
                });
            });

            // 2. PrecedingDocs -> children pada node induk
            aNodes.forEach(function (n) {
                (n.__parents || []).forEach(function (sParentId) {
                    var oParent = oById[sParentId];
                    if (!fnAllowed(oParent, n)) {
                        return;
                    }
                    if (oParent.children.indexOf(n.nodeId) === -1) {
                        oParent.children.push(n.nodeId);
                    }
                });
            });

            // 3. auto-wire orphan
            var oHasParent = {};
            aNodes.forEach(function (n) {
                n.children.forEach(function (sId) {
                    oHasParent[sId] = true;
                });
            });

            var sAnchorNodeId = "node_" + String(sAnchorDoc || "").trim();
            var aOrphans = aNodes.filter(function (n) {
                return !oHasParent[n.nodeId] && n.nodeId !== sAnchorNodeId;
            }).sort(function (a, b) {
                return (a.__lanePos - b.__lanePos) || (a.__sortOrder - b.__sortOrder);
            });

            aOrphans.forEach(function (oOrphan) {
                if (oHasParent[oOrphan.nodeId]) {
                    return;
                }
                var aCandidates = aNodes.filter(function (c) {
                    return c.nodeId !== oOrphan.nodeId && c.__lanePos < oOrphan.__lanePos;
                }).sort(function (a, b) {
                    return (b.__lanePos - a.__lanePos) || (a.__sortOrder - b.__sortOrder);
                });

                if (aCandidates.length === 0) {
                    return; // benar-benar root (mis. anchor tanpa pendahulu)
                }

                var iNearestLane = aCandidates[0].__lanePos;
                var aNearest = aCandidates.filter(function (c) {
                    return c.__lanePos === iNearestLane;
                });

                var oParent = null;
                for (var i = 0; i < aNearest.length; i++) {
                    var bLaneTaken = aNearest[i].children.some(function (sId) {
                        var oChild = oById[sId];
                        return oChild && oChild.__lanePos === oOrphan.__lanePos;
                    });
                    if (!bLaneTaken) {
                        oParent = aNearest[i];
                        break;
                    }
                }
                if (!oParent) {
                    oParent = aNearest[0];
                }

                if (oParent.children.indexOf(oOrphan.nodeId) === -1) {
                    oParent.children.push(oOrphan.nodeId);
                    oHasParent[oOrphan.nodeId] = true;
                }
            });

            // 4. dedupe
            aNodes.forEach(function (n) {
                n.children = n.children.filter(function (sId, iIdx, aAll) {
                    return aAll.indexOf(sId) === iIdx;
                });
            });

            // 5. Urutkan anak menurut rantai utama. ProcessFlow melanjutkan Row 0
            //    ke anak PERTAMA, jadi urutannya menentukan node mana yang tetap
            //    sebaris. Standar F2577 meneruskan rantai utama ke Customer Return
            //    Processing dan menurunkan Journal Entry (Accounting) ke baris
            //    berikutnya, sehingga lane Accounting selalu diurutkan terakhir.
            var that = this;
            aNodes.forEach(function (n) {
                n.children.sort(function (sA, sB) {
                    var oA = oById[sA];
                    var oB = oById[sB];
                    if (!oA || !oB) {
                        return 0;
                    }
                    return (that._pfChainRankOf(oA) - that._pfChainRankOf(oB)) ||
                        (oA.__sortOrder - oB.__sortOrder);
                });
            });

            return aNodes;
        },

        /**
         * Transitive reduction: buang edge langsung parent -> child bila child juga
         * dapat dicapai dari parent melalui anak lain (jalur >= 2 hop).
         *
         * Contoh nyata: VBFA menyimpan Order -> Delivery, Delivery -> Invoice DAN
         * Order -> Invoice. Edge Order -> Invoice adalah pintas; bila dibiarkan,
         * ProcessFlow menganggap Order bercabang dua dan mendorong node Delivery
         * ke Row 1. Standar F2577 selalu satu rantai lurus di Row 0.
         */
        _pfPruneShortcutEdges: function (aNodes) {
            var oById = {};
            (aNodes || []).forEach(function (n) {
                oById[n.nodeId] = n;
            });

            var fnReachable = function (sStartId, sTargetId) {
                var aStack = [sStartId];
                var oVisited = {};
                while (aStack.length > 0) {
                    var sId = aStack.pop();
                    if (sId === sTargetId) {
                        return true;
                    }
                    if (oVisited[sId]) {
                        continue;
                    }
                    oVisited[sId] = true;
                    var oNode = oById[sId];
                    var aKids = (oNode && oNode.children) || [];
                    for (var i = 0; i < aKids.length; i++) {
                        if (!oVisited[aKids[i]]) {
                            aStack.push(aKids[i]);
                        }
                    }
                }
                return false;
            };

            (aNodes || []).forEach(function (oNode) {
                var aChildren = (oNode.children || []).slice();
                if (aChildren.length < 2) {
                    return;
                }
                oNode.children = aChildren.filter(function (sChildId) {
                    var bShortcut = aChildren.some(function (sOtherId) {
                        return sOtherId !== sChildId && fnReachable(sOtherId, sChildId);
                    });
                    return !bShortcut;
                });
            });

            return aNodes;
        },

        /**
         * Kahn topological sort dengan prioritas (lane, sortOrder, nodeId).
         * Menjamin setiap induk muncul sebelum anaknya di array node; ProcessFlow
         * memakai urutan array untuk menghitung baris, sehingga seluruh node
         * sequential diratakan ke Row 0 dan hanya cabang paralel yang turun baris.
         */
        _pfTopologicalSort: function (aNodes) {
            var that = this;
            var oById = {};
            var oIndegree = {};

            (aNodes || []).forEach(function (n) {
                oById[n.nodeId] = n;
                oIndegree[n.nodeId] = 0;
            });

            (aNodes || []).forEach(function (n) {
                (n.children || []).forEach(function (sId) {
                    if (oById[sId]) {
                        oIndegree[sId] = (oIndegree[sId] || 0) + 1;
                    }
                });
            });

            var fnRank = function (a, b) {
                var iA = that._pfChainRankOf(a);
                var iB = that._pfChainRankOf(b);
                if (iA !== iB) {
                    return iA - iB;
                }
                if (a.__sortOrder !== b.__sortOrder) {
                    return a.__sortOrder - b.__sortOrder;
                }
                return String(a.nodeId).localeCompare(String(b.nodeId));
            };

            var aReady = (aNodes || []).filter(function (n) {
                return oIndegree[n.nodeId] === 0;
            }).sort(fnRank);

            var aSorted = [];
            var oDone = {};

            while (aReady.length > 0) {
                var oNext = aReady.shift();
                if (oDone[oNext.nodeId]) {
                    continue;
                }
                oDone[oNext.nodeId] = true;
                aSorted.push(oNext);

                (oNext.children || []).forEach(function (sId) {
                    var oChild = oById[sId];
                    if (!oChild || oDone[sId]) {
                        return;
                    }
                    oIndegree[sId] = (oIndegree[sId] || 0) - 1;
                    if (oIndegree[sId] <= 0) {
                        aReady.push(oChild);
                    }
                });

                aReady.sort(fnRank);
            }

            // Sisa node (mis. relasi siklik dari data VBFA) tetap disertakan
            // supaya tidak ada dokumen yang hilang dari diagram.
            (aNodes || []).filter(function (n) {
                return !oDone[n.nodeId];
            }).sort(fnRank).forEach(function (n) {
                aSorted.push(n);
            });

            return aSorted;
        },

        /**
         * Compact mode: gabungkan node sejenis dalam satu lane menjadi 1 node Aggregated.
         * Dipakai agar alur multi-delivery / collective invoice tetap satu baris (Row 0).
         */
        _pfCompactLanes: function (aNodes) {
            var oLaneText = {};
            this._pfLaneCatalog().forEach(function (l) {
                oLaneText[l.laneId] = l.text;
            });

            var oGroups = {};
            var aOrder = [];
            aNodes.forEach(function (n) {
                if (!oGroups[n.laneId]) {
                    oGroups[n.laneId] = [];
                    aOrder.push(n.laneId);
                }
                oGroups[n.laneId].push(n);
            });

            var oRepresentative = {};
            var aResult = [];

            aOrder.forEach(function (sLaneId) {
                var aGroup = oGroups[sLaneId];

                if (aGroup.length === 1) {
                    oRepresentative[aGroup[0].nodeId] = aGroup[0].nodeId;
                    aResult.push(aGroup[0]);
                    return;
                }

                var sAggId = "node_agg_" + sLaneId;
                var oCounts = {};
                var aDocs = [];
                var bFocused = false;
                var bPlanned = true;
                var iSortOrder = Number.MAX_VALUE;

                aGroup.forEach(function (n) {
                    oRepresentative[n.nodeId] = sAggId;
                    var sState = (n.state === "PlannedNegative") ? "Negative" : (n.state === "Planned" ? "Neutral" : (n.state || "Neutral"));
                    oCounts[sState] = (oCounts[sState] || 0) + 1;
                    aDocs.push(n.__docNumber);
                    bFocused = bFocused || n.focused === true;
                    bPlanned = bPlanned && n.__planned === true;
                    iSortOrder = Math.min(iSortOrder, n.__sortOrder);
                });

                var aStates = [];
                var aStateTexts = [];
                Object.keys(oCounts).forEach(function (sKey) {
                    aStates.push({ state: sKey, value: oCounts[sKey] });
                    aStateTexts.push({ state: sKey, text: oCounts[sKey] + " " + sKey });
                });

                var sDocList = aDocs.join(", ");
                aResult.push({
                    nodeId: sAggId,
                    laneId: sLaneId,
                    title: aGroup.length + " " + (oLaneText[sLaneId] || "Documents"),
                    titleAbbreviation: aGroup[0].titleAbbreviation,
                    type: "Aggregated",
                    children: [],
                    state: aStates,
                    stateText: aStateTexts,
                    texts: [aDocs.slice(0, 3).join(", ") + (aDocs.length > 3 ? " (+" + (aDocs.length - 3) + ")" : "")],
                    focused: bFocused,
                    __parents: [],
                    __lanePos: aGroup[0].__lanePos,
                    __sortOrder: iSortOrder,
                    __planned: bPlanned,
                    __docNumber: sDocList,
                    __group: aGroup,
                    raw: {
                        DocNumber: sDocList,
                        DocCategory: aGroup[0].raw ? aGroup[0].raw.DocCategory : "",
                        DocTitle: (oLaneText[sLaneId] || "Documents") + " (" + aGroup.length + ")",
                        StatusText: aStateTexts.map(function (s) { return s.text; }).join(" / "),
                        Status: "Neutral",
                        AdditionalInfo: "Aggregated node: " + sDocList
                    }
                });
            });

            // Petakan ulang children lewat representative masing-masing node
            aResult.forEach(function (oNode) {
                var aSource = oNode.__group || [oNode];
                var aChildren = [];
                aSource.forEach(function (oOrig) {
                    (oOrig.children || []).forEach(function (sChildId) {
                        var sMapped = oRepresentative[sChildId];
                        if (sMapped && sMapped !== oNode.nodeId && aChildren.indexOf(sMapped) === -1) {
                            aChildren.push(sMapped);
                        }
                    });
                });
                oNode.children = aChildren;
            });

            return aResult;
        },

        _pfBuildLanes: function (aNodes) {
            var that = this;
            var oUsed = {};
            aNodes.forEach(function (n) {
                oUsed[n.laneId] = true;
            });

            return this._pfLaneCatalog().filter(function (l) {
                return oUsed[l.laneId] === true;
            }).map(function (l, iIdx) {
                var oCounts = {};
                aNodes.filter(function (n) {
                    return n.laneId === l.laneId;
                }).forEach(function (n) {
                    var aStates = Array.isArray(n.state) ? n.state : [{ state: n.state, value: 1 }];
                    aStates.forEach(function (oSt) {
                        // Donut lane header hanya mengenal state non-planned:
                        // Planned -> Neutral (ring abu-abu), PlannedNegative -> Negative (ring merah)
                        var sKey = oSt.state;
                        if (sKey === "Planned") {
                            sKey = "Neutral";
                        } else if (sKey === "PlannedNegative") {
                            sKey = "Negative";
                        }
                        sKey = sKey || "Neutral";
                        oCounts[sKey] = (oCounts[sKey] || 0) + (oSt.value || 1);
                    });
                });

                var aLaneStates = Object.keys(oCounts).map(function (sKey) {
                    return { state: sKey, value: oCounts[sKey] };
                }).sort(function (a, b) {
                    return that._pfLaneStatePriority(a.state) - that._pfLaneStatePriority(b.state);
                });
                if (aLaneStates.length === 0) {
                    aLaneStates.push({ state: "Neutral", value: 1 });
                }

                return {
                    laneId: l.laneId,
                    iconSrc: l.iconSrc,
                    text: l.text,
                    position: iIdx,
                    state: aLaneStates
                };
            });
        },

        onPFToggleCompact: function (oEvent) {
            var oPFModel = this.getView().getModel("pfModel");
            var bPressed = oEvent && oEvent.getParameter ? oEvent.getParameter("pressed") : !oPFModel.getProperty("/compactMode");
            oPFModel.setProperty("/compactMode", bPressed === true);

            var sAnchor = oPFModel.getProperty("/anchorDoc");
            if (!sAnchor) {
                return;
            }
            if (this._aLastRelations && this._aLastRelations.length > 0) {
                this._transformAndBindProcessFlow(sAnchor, this._aLastRelations, null);
                this._pfRefreshDiagram();
                MessageToast.show(bPressed ? "Compact mode: node sejenis digabung dalam satu baris." : "Detail mode: satu node per dokumen.");
            } else {
                this._openDocumentFlow(sAnchor, null);
            }
        },

        _pfRefreshDiagram: function () {
            var oView = this.getView();
            setTimeout(function () {
                var oPF = oView.byId("idProcessFlow");
                if (!oPF) {
                    return;
                }
                if (typeof oPF.updateModel === "function") {
                    oPF.updateModel();
                }
                if (typeof oPF.zoomToFit === "function") {
                    oPF.zoomToFit();
                }
            }, 300);
        },

        onNodePress: function (oEvent) {
            var oParams = oEvent.getParameters();
            var oNodeCtrl = null;

            // ProcessFlow mengirim instance ProcessFlowNode sebagai parameter event
            if (oParams && typeof oParams.getBindingContext === "function") {
                oNodeCtrl = oParams;
            } else if (oParams && oParams.node && typeof oParams.node.getBindingContext === "function") {
                oNodeCtrl = oParams.node;
            } else if (typeof oEvent.getSource === "function") {
                oNodeCtrl = oEvent.getSource();
            }

            if (!oNodeCtrl || typeof oNodeCtrl.getBindingContext !== "function") {
                return;
            }

            var oCtx = oNodeCtrl.getBindingContext("pfModel");
            var oNodeData = oCtx ? oCtx.getObject() : null;
            if (!oNodeData) {
                return;
            }

            var oRaw = oNodeData.raw || {};
            var oView = this.getView();
            var sCategory = String(oRaw.DocCategory || "").trim();
            var sDocNum = this._pfDisplayDocNumber(oRaw.DocNumber || oNodeData.__docNumber || "-") || "-";
            var bPlanned = oNodeData.__planned === true;

            var oNodeDetailModel = oView.getModel("nodeDetailModel");
            oNodeDetailModel.setData({
                docNumber: bPlanned ? "(not created yet)" : sDocNum,
                nodeKey: sDocNum,
                title: oRaw.DocTitle || oNodeData.title || "Document Details",
                subtitle: this._pfSubtitleOf(sCategory),
                categoryCode: sCategory || "-",
                statusText: oRaw.StatusText || (typeof oNodeData.stateText === "string" ? oNodeData.stateText : "") || "-",
                statusState: this._pfObjectStatusState(oNodeData.state),
                extraLine1: oRaw.ExtraLine1 || (oNodeData.texts && oNodeData.texts[0]) || "",
                extraLine2: oRaw.ExtraLine2 || (oNodeData.texts && oNodeData.texts[1]) || "",
                createdOn: this._pfFormatDate(oRaw.CreatedOnDate),
                createdBy: oRaw.CreatedBy || "-",
                requestedDelivery: this._pfFormatDate(oRaw.RequestedDelivDate),
                goodsIssueDate: this._pfFormatDate(oRaw.GoodsIssueDate),
                billingDate: this._pfFormatDate(oRaw.BillingDate),
                postingDate: this._pfFormatDate(oRaw.PostingDate),
                netValue: this._pfFormatAmount(oRaw.NetValue, oRaw.Currency),
                currency: oRaw.Currency || "",
                hasAmount: !!(oRaw.NetValue !== undefined && oRaw.NetValue !== null && parseFloat(oRaw.NetValue) !== 0),
                referenceDoc: oRaw.ReferenceDoc || "-",
                additionalInfo: oRaw.AdditionalInfo || "-",
                precedingDocs: this._pfPlainDocList(oRaw.PrecedingDocs),
                nextStageLink: this._pfPlainDocList(oRaw.SubsequentDocs),
                planned: bPlanned,
                icon: this._pfIconOf(sCategory),
                raw: oRaw
            });

            if (!this._pNodePopover) {
                this._pNodePopover = Fragment.load({
                    id: oView.getId(),
                    name: "myapp.view.fragment.DocDetailsPopover",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }

            this._pNodePopover.then(function (oPopover) {
                oPopover.openBy(oNodeCtrl);
            });
        },

        onCloseDocDetailsPopover: function () {
            if (this._pNodePopover) {
                this._pNodePopover.then(function (oPopover) {
                    oPopover.close();
                });
            }
        },

        onCopyDocNumberPress: function () {
            var oModel = this.getView().getModel("nodeDetailModel");
            var sDocNum = oModel.getProperty("/nodeKey") || oModel.getProperty("/docNumber");
            if (sDocNum) {
                if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(sDocNum);
                }
                MessageToast.show("Document number " + sDocNum + " copied to clipboard.");
            }
        },

        onCopyDocNumber: function () {
            var oModel = this.getView().getModel("nodeDetailModel");
            var sDocNum = oModel.getProperty("/nodeKey") || oModel.getProperty("/docNumber");
            if (sDocNum) {
                if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(sDocNum);
                }
                MessageToast.show("Copied Document No: " + sDocNum);
            }
        },

        onCloseProcessFlowDialog: function () {
            if (this._pProcessFlowDialog) {
                this._pProcessFlowDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        onPFZoomIn: function () {
            var oPF = this.getView().byId("idProcessFlow");
            if (oPF && oPF.zoomIn) {
                oPF.zoomIn();
            }
        },

        onPFZoomOut: function () {
            var oPF = this.getView().byId("idProcessFlow");
            if (oPF && oPF.zoomOut) {
                oPF.zoomOut();
            }
        },

        onPFZoomToFit: function () {
            var oPF = this.getView().byId("idProcessFlow");
            if (oPF && oPF.zoomToFit) {
                oPF.zoomToFit();
            }
        },

        onPFReload: function () {
            var that = this;
            var oPFModel = this.getView().getModel("pfModel");
            var sAnchor = oPFModel.getProperty("/anchorDoc");

            if (!sAnchor) {
                return;
            }

            // Reload = paksa buang cache response OData V4 lalu tarik ulang dari backend
            oPFModel.setProperty("/busy", true);
            this._fetchDocRelations(sAnchor, null, function (aRelations) {
                try {
                    that._transformAndBindProcessFlow(sAnchor, aRelations, null);
                } catch (err) {
                    console.error("ProcessFlow render error:", err);
                    MessageToast.show("Process Flow render error: " + (err && err.message ? err.message : err));
                } finally {
                    oPFModel.setProperty("/busy", false);
                }
                that._pfRefreshDiagram();
            }, true);
        },

        onCopyFlowSummary: function () {
            var oPFModel = this.getView().getModel("pfModel");
            var aNodes = oPFModel.getProperty("/nodes") || [];
            var sAnchor = oPFModel.getProperty("/anchorDoc");

            var aChain = aNodes.map(function (n) {
                var sState = Array.isArray(n.stateText)
                    ? n.stateText.map(function (s) { return s.text; }).join(" / ")
                    : (n.stateText || "-");
                return n.title + " [" + sState + "]";
            });

            var sSummary = "Document Flow (" + sAnchor + "):\n" + aChain.join(" -> ");
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(sSummary);
            }
            MessageToast.show("Document Flow chain copied to clipboard!");
        },

        onTableDensityChange: function (oEvent) {
            var sKey = oEvent.getParameter("key") || (oEvent.getParameter("item") && oEvent.getParameter("item").getKey()) || oEvent.getSource().getSelectedKey();
            var oTable = this.getView().byId("idDocFlowTable");
            if (oTable) {
                if (sKey === "compact") {
                    oTable.addStyleClass("sapUiSizeCompact");
                    oTable.removeStyleClass("sapUiSizeCozy");
                    MessageToast.show("Switched to Compact Table View.");
                } else {
                    oTable.addStyleClass("sapUiSizeCozy");
                    oTable.removeStyleClass("sapUiSizeCompact");
                    MessageToast.show("Switched to Detailed / Cozy Table View.");
                }
            }
        },

        onVariantPress: function () {
            MessageToast.show("Selection Screen view options clicked.");
        },

        onSharePress: function () {
            MessageToast.show("Share options opened.");
        },

        onExportPress: function () {
            var oModel = this.getView().getModel("reportModel");
            var aData = oModel ? oModel.getProperty("/results") : [];
            if (!aData || aData.length === 0) {
                MessageToast.show("No data to export. Please perform a search first.");
                return;
            }

            var sCsvContent = "data:text/csv;charset=utf-8,";
            sCsvContent += "SD Document Number,Overall Fulfilment,Process Phase,Sales Order,Sold-to Party,Customer Ref,Doc Date,Sales Employee,Sales Org,Net Value,Status\r\n";
            aData.forEach(function (row) {
                var sRow = [
                    '"' + (row.sdDocNum || '') + '"',
                    '"' + (row.overallFulfilmentText || '') + '"',
                    '"' + (row.processPhase || '') + '"',
                    '"' + (row.salesOrder || '') + '"',
                    '"' + (row.soldToParty || '') + '"',
                    '"' + (row.customerRef || '') + '"',
                    '"' + (row.docDate || '') + '"',
                    '"' + (row.salesEmployee || '') + '"',
                    '"' + (row.salesOrg || '') + '"',
                    '"' + (row.netValue || '') + '"',
                    '"' + (row.status || '') + '"'
                ].join(",");
                sCsvContent += sRow + "\r\n";
            });

            var encodedUri = encodeURI(sCsvContent);
            var link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "SD_Document_Flow_Report.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            MessageToast.show("Exported " + aData.length + " records to CSV.");
        },

        onDetailsPress: function () {
            MessageToast.show("Document Flow Details opened.");
        },

        onViewByPress: function () {
            MessageToast.show("View By Dimensions: Stage, Status, Org.");
        },

        onChartLegendPress: function () {
            var oVizFrame = this.getView().byId("idVizFrame");
            if (oVizFrame) {
                var bLegend = oVizFrame.getVizProperties().legend.visible;
                oVizFrame.setVizProperties({
                    legend: { visible: !bLegend }
                });
                MessageToast.show("Legend " + (!bLegend ? "shown" : "hidden"));
            }
        },

        onZoomInPress: function () {
            MessageToast.show("Zoom In triggered.");
        },

        onZoomOutPress: function () {
            MessageToast.show("Zoom Out triggered.");
        },

        onChartSettingsPress: function () {
            MessageToast.show("Chart Settings opened.");
        },

        onFullScreenPress: function () {
            var oChart = this.getView().byId("idChartContainer");
            if (oChart) {
                var oTable = this.getView().byId("idDocFlowTable");
                var bTableVis = oTable.getVisible();
                oTable.setVisible(!bTableVis);
                MessageToast.show(!bTableVis ? "Restored Normal View" : "Full Screen Chart Mode");
            }
        },

        onChartTypePress: function () {
            var oVizFrame = this.getView().byId("idVizFrame");
            if (oVizFrame) {
                var sCurrent = oVizFrame.getVizType();
                var sNext = sCurrent === "bar" ? "column" : (sCurrent === "column" ? "donut" : "bar");
                oVizFrame.setVizType(sNext);
                MessageToast.show("Switched chart type to: " + sNext.toUpperCase());
            }
        },

        onMoreActionsPress: function () {
            MessageToast.show("Additional chart options opened.");
        },

        onViewModeChange: function (oEvent) {
            var sKey = oEvent.getParameter("key") || (oEvent.getParameter("item") && oEvent.getParameter("item").getKey()) || oEvent.getSource().getSelectedKey();
            var oView = this.getView();
            var oChart = oView.byId("idChartContainer");
            var oTable = oView.byId("idDocFlowTable");

            if (sKey === "hybrid") {
                oChart.setVisible(true);
                oTable.setVisible(true);
            } else if (sKey === "chart") {
                oChart.setVisible(true);
                oTable.setVisible(false);
            } else if (sKey === "table") {
                oChart.setVisible(false);
                oTable.setVisible(true);
            }
        }

    });
});