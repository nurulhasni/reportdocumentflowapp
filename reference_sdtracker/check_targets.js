const fs = require('fs');
const path = require('path');

const meta = fs.readFileSync('d:/SAPUI5 Projects/sdtracker/localService/metadata.xml', 'utf8');
const annoMdl = fs.readFileSync('d:/SAPUI5 Projects/sdtracker/localService/SD_SOFA_ANNO_MDL.xml', 'utf8');
const localAnno = fs.readFileSync('d:/SAPUI5 Projects/sdtracker/annotations/annotations.xml', 'utf8');

// Extract EntityTypes and Properties from metadata
const entityTypes = {};
const entitySets = {};

const etRegex = /<EntityType Name="([^"]+)"/g;
let match;
while ((match = etRegex.exec(meta)) !== null) {
	entityTypes[match[1]] = [];
}

const esRegex = /<EntitySet EntityType="([^"]+)" Name="([^"]+)"/g;
while ((match = esRegex.exec(meta)) !== null) {
	entitySets[match[2]] = match[1];
}

console.log('Found EntityTypes in metadata:', Object.keys(entityTypes));
console.log('Found EntitySets in metadata:', Object.keys(entitySets));

// Check targets in SD_SOFA_ANNO_MDL.xml
const targetRegex = /Target="([^"]+)"/g;
const annoTargets = [];
while ((match = targetRegex.exec(annoMdl)) !== null) {
	annoTargets.push(match[1]);
}

console.log('\n--- Targets in SD_SOFA_ANNO_MDL.xml ---');
for (const target of annoTargets) {
	const parts = target.split('/');
	const base = parts[0];
	const [ns, typeOrSet] = base.split('.');
	const existsInET = entityTypes[typeOrSet] !== undefined;
	const existsInES = entitySets[typeOrSet] !== undefined;
	if (!existsInET && !existsInES) {
		console.log('UNKNOWN Target:', target, '-> Base:', base, 'typeOrSet:', typeOrSet);
	}
}

// Check targets in annotations.xml
console.log('\n--- Targets in annotations.xml ---');
while ((match = targetRegex.exec(localAnno)) !== null) {
	console.log('Local target:', match[1]);
}
