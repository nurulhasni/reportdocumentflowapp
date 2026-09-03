sap.ui.define([
	"sap/ui/core/util/MockServer",
	"sap/base/util/UriParameters"
], function (MockServer, UriParameters) {
	"use strict";

	var oMockServer,
		_sAppModulePath = "cus/sd/sofulfil/trackstatuss1/",
		_sJsonFilesModulePath = _sAppModulePath + "localService/mockdata";

	return {
		/**
		 * Initializes the mock server.
		 * @public
		 */
		init: function () {
			var oUriParameters = UriParameters ? new UriParameters(window.location.href) : (jQuery.sap ? jQuery.sap.getUriParameters() : new URLSearchParams(window.location.search)),
				sJsonFilesUrl = (sap.ui.require.toUrl ? sap.ui.require.toUrl(_sJsonFilesModulePath) : jQuery.sap.getModulePath(_sJsonFilesModulePath)) + "/",
				sManifestUrl = sap.ui.require.toUrl ? sap.ui.require.toUrl(_sAppModulePath + "manifest.json") : jQuery.sap.getModulePath(_sAppModulePath + "manifest", ".json"),
				sEntity = "C_SlsDocFlfllmntAnalyzer",
				sErrorParam = oUriParameters.get("errorType"),
				iErrorCode = sErrorParam === "badRequest" ? 400 : 500;

			var oManifest;
			if (jQuery.sap && jQuery.sap.syncGetJSON) {
				oManifest = jQuery.sap.syncGetJSON(sManifestUrl).data;
			} else {
				var xhr = new XMLHttpRequest();
				xhr.open("GET", sManifestUrl, false);
				xhr.send();
				oManifest = JSON.parse(xhr.responseText);
			}

			var oDataSource = oManifest["sap.app"].dataSources,
				oMainDataSource = oDataSource.mainService,
				sMetadataRel = oMainDataSource.settings.localUri,
				sMetadataUrl = sap.ui.require.toUrl ? sap.ui.require.toUrl(_sAppModulePath + sMetadataRel) : jQuery.sap.getModulePath(_sAppModulePath + sMetadataRel.replace(".xml", ""), ".xml"),
				sMockServerUrl = /.*\/$/.test(oMainDataSource.uri) ? oMainDataSource.uri : oMainDataSource.uri + "/",
				aAnnotations = oMainDataSource.settings.annotations || [];

			oMockServer = new MockServer({
				rootUri: sMockServerUrl
			});

			MockServer.config({
				autoRespond: true,
				autoRespondAfter: parseInt(oUriParameters.get("serverDelay") || "300", 10)
			});

			oMockServer.simulate(sMetadataUrl, {
				sMockdataBaseUrl: sJsonFilesUrl,
				bGenerateMissingMockData: true
			});

			var aRequests = oMockServer.getRequests(),
				fnResponse = function (iErrCode, sMessage, aRequest) {
					aRequest.response = function (oXhr) {
						oXhr.respond(iErrCode, {
							"Content-Type": "text/plain;charset=utf-8"
						}, sMessage);
					};
				};

			if (oUriParameters.get("metadataError")) {
				aRequests.forEach(function (aEntry) {
					if (aEntry.path.toString().indexOf("$metadata") > -1) {
						fnResponse(500, "metadata Error", aEntry);
					}
				});
			}

			if (sErrorParam) {
				aRequests.forEach(function (aEntry) {
					if (aEntry.path.toString().indexOf(sEntity) > -1) {
						fnResponse(iErrorCode, sErrorParam, aEntry);
					}
				});
			}

			oMockServer.start();

			if (jQuery.sap && jQuery.sap.log) {
				jQuery.sap.log.info("Running the app with mock data");
			} else {
				console.log("Running the app with mock data");
			}

			aAnnotations.forEach(function (sAnnotationName) {
				var oAnnotation = oDataSource[sAnnotationName];
				if (!oAnnotation) {
					return;
				}
				var sUri = oAnnotation.uri,
					sAnnoRel = oAnnotation.settings ? oAnnotation.settings.localUri : sAnnotationName,
					sLocalUri = sap.ui.require.toUrl ? sap.ui.require.toUrl(_sAppModulePath + sAnnoRel) : jQuery.sap.getModulePath(_sAppModulePath + sAnnoRel.replace(".xml", ""), ".xml");

				new MockServer({
					rootUri: sUri,
					requests: [{
						method: "GET",
						path: new RegExp(".*"),
						response: function (oXhr) {
							var xmlText = "";
							if (window.jQuery && jQuery.sap && jQuery.sap.sjax) {
								jQuery.sap.require("jquery.sap.xml");
								var oAnnotations = jQuery.sap.sjax({
									url: sLocalUri,
									dataType: "xml"
								}).data;
								xmlText = jQuery.sap.serializeXML(oAnnotations);
							} else {
								var req = new XMLHttpRequest();
								req.open("GET", sLocalUri, false);
								req.send();
								xmlText = req.responseText;
							}

							oXhr.respondXML(200, { "Content-Type": "application/xml" }, xmlText);
							return true;
						}
					}]
				}).start();
			});
		},

		getMockServer: function () {
			return oMockServer;
		}
	};
});