#!/usr/bin/env node

'use strict';
const {join, normalize, basename} = require('path');
const fs = require('fs');
const glob = require('glob');
const prompt = require('prompt-async');
const colors = require('colors');
const sass = require('node-sass');
const touch = require('touch');

const pattern = /\.scss$/i;

const watchDir = process.argv[2];
const outputFile = process.argv[3];
const cssOutputFile = process.argv[4];
let sourceFiles;

function isDir (dir) {
	try {
		return fs.statSync(dir).isDirectory();
	}
	catch (e) {
		return false;
	}
}

function isFile (path) {
	try {
		return fs.statSync(path).isFile();
	}
	catch (e) {
		return false;
	}
}

async function go () {
	if (!watchDir || !isDir(watchDir)) {
		console.log('Must specify a directory to watch.');
		return;
	}

	if (!outputFile) {
		console.log('Must specify an output filename.');
		return;
	}

	if (isFile(outputFile)) {
		prompt.message = '';
		prompt.start();
		const {overwrite} = await prompt.get([{
				name: 'overwrite',
				message: colors.red.bold(`Output file (${outputFile}) exists. Overwrite? [y/n]`),
				default: 'y'
			}
		]);
		if (overwrite.toLowerCase()[0] !== 'y') {
			return;
		}
	}

	sourceFiles = new Set(glob.sync('*.scss', {matchBase: true, cwd: watchDir, ignore: basename(outputFile)}));
	console.log(sourceFiles);

	writeFile();
	fs.watch(watchDir, {recursive: true}, onFileChange);
}

function onFileChange (eventType, filename) {
	if (pattern.test(filename)) {
		update(filename);
	};
}

function update (filename) {
	const filePath = normalize(join(watchDir, filename));
	const outputPath = normalize(outputFile);

	if (filePath === outputPath) {
		return; // ignore changes to the output file if it's in the watch directory.
	}

	console.log(`change: ${filename}`);
	const {size} = sourceFiles;
	const exists = isFile(filePath);

	// if file exists and it isn't in sourceFiles, add it.
	// if file doesn't exist and it's in sourceFiles, remove it.
	exists ? sourceFiles.add(filename) : sourceFiles.delete(filename);

	// sourceFiles changed ? rewrite file : touch file
	size !== sourceFiles.size ? writeFile() : touchFile();
}

function touchFile () {
	console.log('touching');
	touch(outputFile);
	compileSass();
	// console.warn('touchFile isn’t implemented. Rewriting file.');
	// writeFile();
}

function compileSass () {
	const {promises: fsp} = fs;

	if (cssOutputFile) {
		sass.render({file: outputFile, includePaths: [watchDir]}, (err, result) => {
			checkError(err);
			if (!err) {
				writeFile.promise = fsp.writeFile(cssOutputFile, result.css, checkError)
			}
		});
	}
}

const checkError = err => err ? console.error(err) : void 0;

async function writeFile () {
	const {promises: fsp} = fs;
	const previous = writeFile.promise || Promise.resolve();
	await previous;
	const string = [
		'// This is a generated file. Changes will get stomped.',
		`// source: ${watchDir}`,
		`// ${new Date()}`,
		...Array.from(sourceFiles).map(f => `@import "${f}";`),
		''
	].join('\n');

	writeFile.promise = fsp.writeFile(outputFile, string).then(compileSass);
}

return go(process.argv[2], process.argv[3]);
