'use strict';
var phantom = require('phantom');
var Q = require('q');
var _ = require('lodash-node');
var request = require('request');
var fs = require('fs');
module.exports = function(options) {
    var renderTime = 1000;
    var Analyzer = function(ph, page, renderTime) {
        return {
            ph: ph,
            page: page,
            initialize: function() {
                var deferred = Q.defer();
                page.set('onError', function(error) {
                    console.log(error);
                    this.logError(error);
                }.bind(this));
                page.open('http://weeklyponzi.com/', function(status) {
                    if (!options.json) {
                        console.log('Opeing weeklyponzi...', status);
                        console.log('waiting ' + renderTime + ' for page to render\n\n-----');
                    }
                    setTimeout(function() {
                        try{
                            this.report = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
                        } catch(e) {
                            console.log('Error reading data', e);
                        }
                        deferred.resolve(this, this.ph, this.page);
                    }.bind(this), renderTime);
                }.bind(this));
                return deferred.promise;
            },
            getTimeLeft: function() {
                return Q.promise(function(resolve) {
                    this.page.evaluate(
                        function() {
                            return document.querySelector('#countdown1').innerHTML;
                        },
                        this._writeResult('TimeLeft', resolve)
                    );
                }.bind(this));
            },
            logError: function(log) {
                this.report.errors.push(log);
            },
            transactionsRetrieved: 0,
            _getTransactionInfo: function(link) {
                var txid = link.replace('http://www.blockchain.info/tx/', '');

                link = link.replace('tx', 'tx-index') + '?format=json';
                return Q.promise(function(resolve) {
                    process.stdout.write('\r' + this.transactionsRetrieved+++'/' + this.transactionCount);
                    if (this.report.transactionsIndex[txid]) {
                        resolve();
                    } else {
                        request.get(link, function(error, response, body) {
                            this.report.transactions.push(JSON.parse(body));
                            this.report.transactionsIndex[txid] = true;
                            resolve();
                        }.bind(this));
                    }
                }.bind(this));
            },
            _downloadUrls: function(transactions, done) {
                return transactions.reduce(function(soFar, s) {
                    return soFar.then(function() {
                        return this._getTransactionInfo(s);
                    }.bind(this));
                }.bind(this), new Q()).then(done);
            },
            getTransactions: function() {
                console.log('start transactions');
                var deferred = Q.defer();
                this.page.evaluate(
                    function() {
                        var links = document.querySelectorAll('table:nth-child(3) tr td:nth-child(4) > a');
                        var urls = [];
                        for (var i = links.length - 1; i >= 0; i--) {
                            urls.push(links[i].getAttribute('href'));
                        }
                        return urls;
                    },
                    function(transactions) {
                        // for debugging
                        // transactions = transactions.slice(0, 20);
                        this.transactionCount = transactions.length;
                        this._writeResult('TransactionCount')(transactions.length);

                        this._downloadUrls(transactions, deferred.resolve);
                    }.bind(this)
                );
                return deferred.promise;
            },
            _writeResult: function(preText, after) {
                return function(result) {
                    if (_.isArray(this.report.pretext)) {
                        this.report.preText.push(result);
                    } else {
                        this.report[preText] = result;
                    }

                    if (!options.json) {
                        console.log(preText, ':\t', result);
                    }
                    if (after) {
                        return after();
                    }
                }.bind(this);
            },

            report: {
                errors: [],
                transactions: [],
                transactionsIndex: {

                }
            }
        };
    };
    phantom.create(function(ph) {
        ph.createPage(function(page) {
            var analyzer = new Analyzer(ph, page, renderTime);
            analyzer.initialize()
                .then(function() {
                    return analyzer.getTimeLeft();
                })
                .then(function() {
                    return analyzer.getTransactions();
                })
                .then(function() {
                    fs.writeFile('./data.json', JSON.stringify(analyzer.report, null, 5), 'utf-8');
                    console.log(JSON.stringify(analyzer.report, null, 3));
                })
                .then(ph.exit);

        }.bind(this));
    }.bind(this));
};