'use strict';

const path = require('path');
const { readFileSync } = require('fs');

const template = readFileSync(path.join(__dirname, 'template.html'), 'utf8')

function formatIssues (issues, panelColor) {
  return issues.map(issue => {
    const extract = issue.code.split('<').join('&lt;');
    const message = issue.msg.split('<').join('&lt;').split('"').join('&quot;');
    const line = issue.line;
    const column = issue.column;
    const position = 'line: ' + line + ', column: ' + column;
    const positionAudio = '(at line ' + line + ' and column ' + column + ')';
    const entry =
        '<tr class="msg-danger">' + 
        '    <td class="location-col">' + line + ':' + column + '</td>' +
        '    <td class="message-col">' + message + '</td>' +
        '    <td class="rule-col">' + extract + '</td>' +
        '</tr>';

    return entry;
  }).join('') || '';
}

function formatFile (file) {
  const returnedErrors = formatIssues(file.errors, 'danger');
  
  const content =
      '<tr class="danger">' +
      '    <td>' +
      '        <a class="toggle-link" href="javascript:;" onclick="toggleDetails(this)">' + file.name + '</a>' +
      '    </td>' +
      '    <td>' + file.errors.length + '</td>' +
      '</tr>' +
      '<tr class="details-row hidden">' +
      '    <td colspan="2">' +
      '        <table class="details-table">' +
      '            <tbody>' + formatIssues(file.errors) +
      '            </tbody>' +
      '        </table>' +
      '    </td>' +
      '</tr>';
  return content;
}
function sortErrors(a,b) {
    return b.errors.length - a.errors.length;
}
function sortIssues(a,b) {
    return a.line - b.line;
}
function makeReport(result) {

  const messageFilter = 'Enter text to filter messages with';
  const firstOccurrence = 'Warn about the first occurrence only';
  result.files.sort(sortErrors);
  const content = Object.values(result.files)
    .map(formatFile)
    .join('\n');


  return template.replace('<!-- Content goes here -->', content);
}

module.exports = function (grunt) {
    grunt.registerMultiTask('htmllint', 'HTML5 linter and validator.', function () {
        var htmllint = require('htmllint'),
            Promise = require('promise');
        var done = this.async();

        // Merge task-specific and/or target-specific options with these defaults.
        var options = this.options({
            force: false,
            plugins: [],
            htmllintrc: false
        });

        var force = options.force;
        delete options.force;

        if (options.htmllintrc) {
            var htmllintrcPath = options.htmllintrc === true ? '.htmllintrc' : options.htmllintrc;
            options = grunt.file.readJSON(htmllintrcPath);
        }
        var hasmax = options.hasOwnProperty('maxerr') && options.maxerr;

        var plugins = options.plugins || [],
            errorFiles = 0,
            skippedFiles = 0,
            errorAmount = 0;

        htmllint.use(plugins);

        delete options.plugins;
        delete options.htmllintrc;

        let { outputFile } = options;
	delete options.outputFile;
	
        let result = {
            files: []
        };
        const destDir = path.dirname(outputFile);

        if (!grunt.file.exists(destDir)) {
            grunt.file.mkdir(destDir);
        }
        
        var lastPromise = Promise.resolve(null);
        this.filesSrc.forEach(function (filePath) {
            if (!grunt.file.exists(filePath)) {
                grunt.log.warn('Source file "' + filePath + '" not found.');
                return;
            }

            lastPromise = lastPromise.then(function (task) {
                if (hasmax && options.maxerr <= 0) {
                    // don't lint the file
                    return false;
                }

                var fileSrc = grunt.file.read(filePath);

                return htmllint(fileSrc, options);
            }).then(function (issues) {
                issues.sort(sortIssues);
                result.files.push({
                    name: filePath,
                    errors: issues                    
                });
                
                if (issues === false) {
                    // skipped the file
                    skippedFiles++;
                    grunt.log.verbose.warn('Skipped file "' + filePath + '" (maxerr).');
                    return;
                }
                issues.forEach(function (issue) {
                    issue.msg = issue.msg || htmllint.messages.renderIssue(issue);
                });
                
                if (issues.length <= 0) {
                    grunt.log.verbose.ok(filePath + ' is lint free');
                } else {
                    errorFiles++;
                }

                errorAmount += issues.length;
                if (hasmax) {
                    options.maxerr -= issues.length;
                }
            }).catch(function (err) {
                grunt.log.error('Could not lint file ' + filePath + '; It might be malformed.', err);
            });
        });

        lastPromise
            .then(function () {
                result.errorCount = this.errorAmount;
                grunt.file.write(outputFile, makeReport(result));
        
                var resultMsg = [
                    'encountered ', errorAmount, ' errors in total\n',
                    errorFiles,
                    ' file(s) had lint error out of ',
                    this.filesSrc.length, ' file(s). ',
                    '(skipped ', skippedFiles, ' files)'
                ].join('');

                if (this.errorCount) {
                    grunt.log.error(resultMsg);
                } else {
                    grunt.log.ok(resultMsg);
                }
            }.bind(this))
            .done(function () {
                done(this.errorCount === 0 || force);
            }.bind(this));
    });
};
