sap.ui.define([
	"sap/ui/core/Core",
	"sap/ui/core/library"
], function (Core, library) {
	"use strict";

	sap.ui.getCore().initLibrary({
		name: "cus.sd.lib.worklist",
		version: "1.0.0",
		dependencies: ["sap.ui.core", "sap.m"],
		types: [],
		interfaces: [],
		controls: [],
		elements: []
	});

	return cus.sd.lib.worklist;
});
