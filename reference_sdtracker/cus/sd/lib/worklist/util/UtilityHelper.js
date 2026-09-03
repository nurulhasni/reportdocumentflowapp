sap.ui.define([
	"sap/ui/base/Object",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/Text",
	"sap/m/Input",
	"sap/m/Select",
	"sap/ui/core/Item",
	"sap/ui/layout/form/SimpleForm",
	"sap/m/Label"
], function (BaseObject, MessageToast, MessageBox, Dialog, Button, Text, Input, Select, Item, SimpleForm, Label) {
	"use strict";

	jQuery.sap.declare("cus.sd.lib.worklist.util.UtilityHelper");

	var UtilityHelper = BaseObject.extend("cus.sd.lib.worklist.util.UtilityHelper", {
		constructor: function () {
			BaseObject.apply(this, arguments);
		},

		initi18nReuseLib: function () {
			// Initialize reuse lib i18n if needed
		},

		onPressCreateBase: function (targetObj) {
			MessageToast.show("Create Sales Order action triggered (" + (targetObj && targetObj.semanticObject || "SalesOrder") + ")");
			if (sap.ushell && sap.ushell.Container) {
				var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
				if (oCrossAppNavigator) {
					oCrossAppNavigator.toExternal({
						target: {
							semanticObject: targetObj.semanticObject || "SalesOrder",
							action: targetObj.createSemanticAction || "create"
						}
					});
				}
			}
		},

		onPressManageBase: function (targetObj, params) {
			MessageToast.show("Manage / New Create Sales Order action triggered");
			if (sap.ushell && sap.ushell.Container) {
				var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
				if (oCrossAppNavigator) {
					oCrossAppNavigator.toExternal({
						target: {
							semanticObject: targetObj.semanticObject || "SalesOrder",
							action: targetObj.manageSemanticAction || "manageSalesOrderV2"
						},
						params: params
					});
				}
			}
		},

		getUpdateContextListReportTable: function (extensionAPI) {
			if (extensionAPI && typeof extensionAPI.getSelectedContexts === "function") {
				return extensionAPI.getSelectedContexts();
			}
			return [];
		},

		onActionWithInputMassChange: function (controller, aUpdateContext, extensionAPI, usecase, fnCallback) {
			if (!aUpdateContext || aUpdateContext.length === 0) {
				MessageBox.information("Please select at least one sales document.");
				return;
			}

			var sFieldId = usecase ? usecase.idControl : "Action";
			var sTitle = "Mass Change: " + sFieldId;
			var oInputControl = new Input({
				placeholder: "Enter value or reason..."
			});

			var oDialog = new Dialog({
				title: sTitle,
				type: "Message",
				content: [
					new SimpleForm({
						content: [
							new Label({ text: sFieldId }),
							oInputControl
						]
					})
				],
				beginButton: new Button({
					text: "Execute",
					type: "Emphasized",
					press: function () {
						var sVal = oInputControl.getValue();
						MessageToast.show("Updated " + aUpdateContext.length + " sales document(s) with " + sFieldId + ": " + sVal);
						oDialog.close();
						if (typeof fnCallback === "function") {
							fnCallback();
						}
						if (extensionAPI && typeof extensionAPI.rebindTable === "function") {
							extensionAPI.rebindTable();
						}
					}
				}),
				endButton: new Button({
					text: "Cancel",
					press: function () {
						oDialog.close();
					}
				}),
				afterClose: function () {
					oDialog.destroy();
				}
			});

			oDialog.open();
		},

		onActionWithoutInputMassChange: function (controller, aUpdateContext, extensionAPI, usecase, fnCallback) {
			if (!aUpdateContext || aUpdateContext.length === 0) {
				MessageBox.information("Please select at least one sales document.");
				return;
			}

			var sFieldId = usecase ? usecase.idControl : "Action";
			MessageBox.confirm("Are you sure you want to remove " + sFieldId + " for " + aUpdateContext.length + " document(s)?", {
				title: "Confirm Removal",
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						MessageToast.show("Removed " + sFieldId + " from " + aUpdateContext.length + " sales document(s)");
						if (typeof fnCallback === "function") {
							fnCallback();
						}
						if (extensionAPI && typeof extensionAPI.rebindTable === "function") {
							extensionAPI.rebindTable();
						}
					}
				}
			});
		}
	});

	return UtilityHelper;
});
