/*
 * Copyright (C) 2009-2025 SAP SE or an SAP affiliate company. All rights reserved.
 */
jQuery.sap.require("sap.ui.model.FilterOperator");

sap.ui.define([
	"cus/sd/lib/worklist/util/UtilityHelper",
	"sap/ui/comp/navpopover/NavigationPopoverHandler"
], function (UtilityHelper, NavigationPopoverHandler) {
	"use strict";

	return sap.ui.controller("cus.sd.sofulfil.trackstatuss1.ext.controller.ListReportExtension", {

		util: new UtilityHelper(),

		targetObj: [{
			semanticObject: "SalesOrder",
			createSemanticAction: "create"
		}, {
			semanticObject: "SalesOrder",
			manageSemanticAction: "manageSalesOrderV2"
		}],
		/*
			Here are the 4 method extensions needed to be implemented  for handling of custom 
			filter attributes
		*/

		onInitSmartFilterBarExtension: function (oEvent) {
			/*
				(1) The custom field in the filter bar might have to be bound to a custom data model.

				(2) If a value change in the field shall trigger a follow up action, this method is 
				the place to define and bind an event handler to the field.
			*/
			var oFilterItem = oEvent.getSource().determineFilterItemByName("Purchase_OrderByCustomer");
			oFilterItem.setLabelTooltip(oFilterItem.getLabel());

			// -> util lib -> i18n properties
			this._initi18nReuseLib.call(this);

		},
		onBeforeRebindTableExtension: function (oEvent) {
			/*
				The value of the custom field shall have an effect on the selected data in the table.
				So this is the place to push the selected filter value to the smartFilterBar.
			*/
			var oBindingParams = oEvent.getParameter("bindingParams");
			oBindingParams.parameters = oBindingParams.parameters || {};
			var oSmartTable = oEvent.getSource();
			var oSmartFilterBar = this.byId(oSmartTable.getSmartFilterId());

			var oCustomControl = oSmartFilterBar.getControlByKey("Purchase_OrderByCustomer");

			var oValue = oCustomControl.getValue();
			if (oValue !== "") {
				oBindingParams.filters.push(new sap.ui.model.Filter("PurchaseOrderByCustomer", "Contains", oValue));
			}

		},
		getCustomAppStateDataExtension: function (oCustomData) {
			/*
				The content of the custom field shall be stored in the app state, so that it can be restored
				later again e.g. after a back navigation. The developer has to ensure, that the content of 
				the field is stored in the object that is returned by this method.
			*/
			oCustomData.purchaseOrderByCustomer = this.byId("PurchaseOrderByCustomerValue").getValue();
		},
		restoreCustomAppStateDataExtension: function (oCustomData) {
			/*
				in order to restore the content of the custom field in the filter bar e.g. after a back 
				navigation, an object with the content is handed over to this method and the developer 
				has to ensure, that the content of the custom field is set accordingly. Also, empty 
				properties have to be set.
			*/
			if (oCustomData.purchaseOrderByCustomer !== undefined) {
				this.byId("PurchaseOrderByCustomerValue").setValue(oCustomData.purchaseOrderByCustomer);
			}
		},

		/*
			Handling of the navigation link on the column "Sales Document"
		*/
		onLinkSalesDocumentPressed: function (oEvent) {
			var sSemanticObject;
			var sSalesDocument;

			var oSource = oEvent.getSource();
			var oBindingContext = oSource.getBindingContext();
			var oPath = oBindingContext.getPath();
			var oModel = oBindingContext.getModel();

			// parameter of the selected table row
			var oProperties = oModel.getProperty(oPath);

			// Semantic object
			sSemanticObject = oProperties.SemanticObject;

			// Sales Document
			sSalesDocument = oProperties.SalesDocument;

			// -> coding for the smart link
			var oLinkHandler = new NavigationPopoverHandler({
				semanticObject: sSemanticObject,
				fieldName: sSalesDocument,
				control: oSource
			});

			// -> we don't want the default URL parameter, we ONLY want the SEMANTIC OBJECT KEY !!
			var oSemanticAttribute = {};
			oSemanticAttribute[sSemanticObject] = sSalesDocument;
			oLinkHandler.attachBeforePopoverOpens(undefined, function (oBeforePopoverOpensEvent) {
				var oParameters = oBeforePopoverOpensEvent.getParameters();
				var oDeferred = jQuery.Deferred();
				oParameters.setSemanticAttributes(oSemanticAttribute);
				oParameters.open();
				oDeferred.resolve();
				return oDeferred.promise();
			}, this);

			oLinkHandler.attachNavigationTargetsObtained(undefined, function (oLinkHandlerEvent) {
				var oLinkHandlerParameters = oLinkHandlerEvent.getParameters();
				var aActions = this._removeNavTarget(oLinkHandlerParameters.actions);
				oLinkHandlerParameters.show(undefined, undefined, aActions, undefined);
			}, this);
			oLinkHandler.openPopover();
		},

		_removeNavTarget: function (aActions) {
			var sHref;
			var iCount;
			for (iCount = 0; iCount < aActions.length; iCount++) {
				sHref = aActions[iCount].getHref();
				if ((sHref.search("SalesOrder") !== -1 && sHref.search("trackStatus") !== -1) ||
					(sHref.search("SalesOrderWithoutCharge") !== -1 && sHref.search("trackStatus") !== -1) ||
					(sHref.search("DebitMemoRequest") !== -1 && sHref.search("trackStatus") !== -1)) {
					aActions.splice(iCount, 1);
					iCount--;
				}
			}
			return aActions;
		},

		// ACTIONS
		onPressCreate: function () {
			return this.util.onPressCreateBase.call(this, this.targetObj[0]);
		},

		onPressNewCreate: function () {
			var params = {
				preferredMode: "create"
			};
			return this.util.onPressManageBase.call(this, this.targetObj[1], params);
		},

		onRejectAllItems: function (oEvent) {
			var that = this;

			var usecase = {
				idControl: "SalesDocumentRjcnReason"
			};

			var oTable = oEvent.getSource().getParent().getParent();

			var fnRemoveSelection = function () {
				oTable.removeSelections();
			};
			var aUpdateContext = that.util.getUpdateContextListReportTable(that.extensionAPI);

			return that.util.onActionWithInputMassChange(that, aUpdateContext, that.extensionAPI, usecase, fnRemoveSelection);
		},

		onSetDeliveryBlock: function (oEvent) {
			var that = this;

			var usecase = {
				idControl: "DeliveryBlockReason"
			};

			var oTable = oEvent.getSource().getParent().getParent();

			var fnRemoveSelection = function () {
				oTable.removeSelections();
			};
			var aUpdateContext = that.util.getUpdateContextListReportTable(that.extensionAPI);

			return that.util.onActionWithInputMassChange(that, aUpdateContext, that.extensionAPI, usecase, fnRemoveSelection);
		},

		onRemoveDeliveryBlock: function (oEvent) {
			var that = this;

			var usecase = {
				idControl: "DeliveryBlockReason"
			};
			var oTable = oEvent.getSource().getParent().getParent();

			var fnRemoveSelection = function () {
				oTable.removeSelections();
			};
			var aUpdateContext = that.util.getUpdateContextListReportTable(that.extensionAPI);

			return that.util.onActionWithoutInputMassChange(that, aUpdateContext, that.extensionAPI, usecase, fnRemoveSelection);
		},

		onSetBillingBlock: function (oEvent) {
			var that = this;

			var usecase = {
				idControl: "HeaderBillingBlockReason"
			};

			var oTable = oEvent.getSource().getParent().getParent();

			var fnRemoveSelection = function () {
				oTable.removeSelections();
			};
			var aUpdateContext = that.util.getUpdateContextListReportTable(that.extensionAPI);

			return that.util.onActionWithInputMassChange(that, aUpdateContext, that.extensionAPI, usecase, fnRemoveSelection);
		},

		onRemoveBillingBlock: function (oEvent) {
			var that = this;

			var usecase = {
				idControl: "HeaderBillingBlockReason"
			};

			var oTable = oEvent.getSource().getParent().getParent();

			var fnRemoveSelection = function () {
				oTable.removeSelections();
			};
			var aUpdateContext = that.util.getUpdateContextListReportTable(that.extensionAPI);

			return that.util.onActionWithoutInputMassChange(that, aUpdateContext, that.extensionAPI, usecase, fnRemoveSelection);
		},

		_initi18nReuseLib: function () {
			this.util.initi18nReuseLib.call(this);
		}

	});
});