/*
 * grunt-include-replace-s2
 * https://github.com/pony5580/grunt-include-replace-if
 *
 * Copyright (c) 2013 Alan Shaw
 * Licensed under the MIT license.
 */

module.exports = function(grunt) {

	'use strict';

	var _ = grunt.util._;
	var path = require('path');

	grunt.registerMultiTask('includereplaces2', 'Include files and replace variables', function() {

		var options = this.options({
			prefix: '@@',
			suffix: '',
			startIf: '_IF_:',
			endIf: '_ENDIF_',
			globals: {},
			includesDir: '',
			docroot: '.'
		});

		grunt.log.debug('Options', options);

		// Variables available in ALL files
		var globalVars = options.globals;

		// Names of our variables
		var globalVarNames = Object.keys(globalVars);

		globalVarNames.forEach(function(globalVarName) {
			if (_.isString(globalVars[globalVarName])) {
				globalVars[globalVarName] = globalVars[globalVarName];
			} else {
				globalVars[globalVarName] = JSON.stringify(globalVars[globalVarName]);
			}
		});

		// Cached variable regular expressions
		var globalVarRegExps = {};
		var globalIFVarRegExps = {};

		var thisfilesrc = '';

		function ifBlocks(contents, localVars) {

			localVars = localVars || {};

			var varNames = Object.keys(localVars);
			var varRegExps = {};


			// Replace local vars
			varNames.forEach(function(varName) {

				var replaceWith;

				// Process lo-dash templates (for strings) in global variables and JSON.stringify the rest
				if (_.isString(localVars[varName])) {
					localVars[varName] = grunt.template.process(localVars[varName]);
				} else {
					localVars[varName] = JSON.stringify(localVars[varName]);
				}

				if (_.isEmpty(localVars[varName]) || localVars[varName] === false || localVars[varName] === 'false') {
					// remove completely
					replaceWith = '';
				} else {
					// replace with contents
					replaceWith = '$1';
				}

				varRegExps[varName] = varRegExps[varName] || new RegExp(options.prefix + options.startIf + varName + options.suffix + '([\\s\\S]*?)' + options.prefix + options.endIf + options.suffix, 'g');

				contents = contents.replace(varRegExps[varName], replaceWith);

			});

			// Replace global variables
			globalVarNames.forEach(function(globalVarName) {

				var replaceWith;

				if (_.isEmpty(globalVars[globalVarName]) || globalVars[globalVarName] === false || globalVars[globalVarName] === 'false') {
					// remove completely
					replaceWith = '';
				} else {
					// replace with contents
					replaceWith = '$1';
				}

				globalIFVarRegExps[globalVarName] = globalIFVarRegExps[globalVarName] || new RegExp(options.prefix + options.startIf + globalVarName + options.suffix + '[\\s\\S]*?' + options.prefix + options.endIf + options.suffix, 'g');

				contents = contents.replace(globalIFVarRegExps[globalVarName], replaceWith);
			});

			return contents;
		}

		function replace(contents, localVars) {

			localVars = localVars || {};

			var varNames = Object.keys(localVars);
			var varRegExps = {};

			// Replace local vars
			varNames.forEach(function(varName) {

				// Process lo-dash templates (for strings) in global variables and JSON.stringify the rest
				if (_.isString(localVars[varName])) {
					localVars[varName] = grunt.template.process(localVars[varName]);
				} else {
					localVars[varName] = JSON.stringify(localVars[varName]);
				}

				varRegExps[varName] = varRegExps[varName] || new RegExp(options.prefix + varName + options.suffix, 'g');

				contents = contents.replace(varRegExps[varName], localVars[varName]);
			});

			grunt.log.debug('globalVarNames', globalVarNames);

			// Replace global variables
			globalVarNames.forEach(function(globalVarName) {

				globalVarRegExps[globalVarName] = globalVarRegExps[globalVarName] || new RegExp(options.prefix + globalVarName + options.suffix, 'g');

				if(globalVarName == 'dir'){
					globalVars[globalVarName] = thisfilesrc.replace('/api/system/template/gen','');
				}

				contents = contents.replace(globalVarRegExps[globalVarName], globalVars[globalVarName]);
			});

			return contents;
		}

		var includeRegExp = new RegExp(options.prefix + 'include\\(\\s*["\'](.*?)["\'](,\\s*({[\\s\\S]*?})){0,1}\\s*\\)' + options.suffix);

		function include(contents, workingDir) {

			var matches = includeRegExp.exec(contents);

			// Create a function that can be passed to String.replace as the second arg
			function createReplaceFn (replacement) {
				return function () {
					return replacement;
				};
			}

			while (matches) {

				var match = matches[0];
				var includePath = matches[1];
				var localVars = matches[3] ? JSON.parse(matches[3]) : {};

				if (!grunt.file.isPathAbsolute(includePath)) {
					includePath = path.resolve(path.join((options.includesDir ? options.includesDir : workingDir), includePath));
				} else {
					if (options.includesDir) {
						grunt.log.error('includesDir works only with relative paths. Could not apply includesDir to ' + includePath);
					}
					includePath = path.resolve(includePath);
				}

				var docroot = path.relative(path.dirname(includePath), path.resolve(options.docroot)).replace(/\\/g, '/');

				// Set docroot as local var but don't overwrite if the user has specified
				if (localVars.docroot === undefined) {
					localVars.docroot = docroot ? docroot + '/' : '';
				}

				grunt.log.debug('Including', includePath);
				grunt.log.debug('Locals', localVars);

				var includeContents = grunt.file.read(includePath);

				// Remove ifBlocks
				includeContents = ifBlocks(includeContents, localVars);

				// Make replacements
				includeContents = replace(includeContents, localVars);

				// Process includes
				includeContents = include(includeContents, path.dirname(includePath));
				if (options.processIncludeContents && typeof options.processIncludeContents === 'function') {
					includeContents = options.processIncludeContents(includeContents, localVars);
				}

				contents = contents.replace(match, createReplaceFn(includeContents));

				matches = includeRegExp.exec(contents);
			}

			return contents;
		}

		this.files.forEach(function(config) {

			config.src.forEach(function(src) {

				thisfilesrc = src;

				grunt.log.debug('Processing glob ' + src);

				if (!grunt.file.isFile(src)) {
					return;
				}

				grunt.log.debug('Processing ' + src);

				// Read file
				var contents = grunt.file.read(src);

				var docroot = path.relative(path.dirname(src), path.resolve(options.docroot)).replace(/\\/g, '/');
				var localVars = {docroot: docroot ? docroot + '/' : ''};

				grunt.log.debug('Locals', localVars);

				// Remove ifBlocks
				contents = ifBlocks(contents, localVars);

				// Make replacements
				contents = replace(contents, localVars);

				// Process includes
				contents = include(contents, path.dirname(src));

				//grunt.log.debug(contents);

				var dest = config.dest;

				if (isDirectory(dest) && !config.orig.cwd) {
					dest = path.join(dest, src);
				}

				grunt.log.debug('Saving to', dest);

				grunt.file.write(dest, contents);

				grunt.log.ok('Processed ' + src);
			});
		});
	});

	// Detect if destination path is a directory
	function isDirectory (dest) {
		return grunt.util._.endsWith(dest, '/');
	}
};