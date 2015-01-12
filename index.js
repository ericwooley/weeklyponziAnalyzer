'use strict';
var phantom = require('phantom');
var Q = require('q');
var _ = require('lodash-node');
var request = require('request');
var fs = require('fs');

var Analyzer = function(options) {
    options = options || {};
    var renderTime = 1000;
    return {
        options: options,
        log: function() {
            if (options.verbose) {
                console.log.apply(this, arguments);
            }
        },
        run: function() {
            return Q.promise(function(resolve) {
                if(this.running === true){
                    resolve(this.report);
                }
                this.running = true;
                phantom.create(function(ph) {
                    ph.createPage(function(page) {
                        this.page = page;
                        this.ph = ph;
                        this.initialize()
                            .then(function() {
                                return this.getTimeLeft();
                            }.bind(this))
                            .then(function() {
                                return this.getPayoutAddress();
                            }.bind(this))
                            .then(function() {
                                return this.getTransactions();
                            }.bind(this))
                            .then(function() {
                                this.log('\r complete \n');
                                try {
                                    fs.writeFile('./data.json', JSON.stringify(this.report, null, 5), 'utf-8');
                                } catch (e) {
                                    console.log(e);
                                }
                            }.bind(this))
                            .then(function() {
                                this.running = false;
                                ph.exit();
                                resolve(this.report);
                            }.bind(this));
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        },
        initialize: function() {
            var deferred = Q.defer();
            this.page.set('onError', function(error) {
                this.log(error);
                this.logError(error);
            }.bind(this));
            this.page.open('http://weeklyponzi.com/', function(status) {
                this.log('Opeing weeklyponzi...', status);
                this.log('waiting ' + renderTime + ' for page to render\n\n-----');
                setTimeout(function() {
                    try {
                        this.report = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
                    } catch (e) {
                        this.log('Error reading data', e);
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
                if (!options.silent) {

                }
                if (this.report.transactionsIndex[txid]) {
                    resolve();
                } else {
                    request.get(link, function(error, response, body) {
                        this.transactionsRetrieved++;
                        process.stdout.write('\r Updating transactions: ' + this.transactionsRetrieved + '/' + this.transactionCount);
                        this.report.transactions.push(JSON.parse(body));
                        this.report.transactionsIndex[txid] = true;
                        if(this.downdloadsSinceSave % 10 === 0){
                            this.save();
                        }
                        resolve();
                    }.bind(this));
                }
            }.bind(this));
        },
        save: function(){
            try {
                fs.writeFile('./data.json', JSON.stringify(this.report, null, 5), 'utf-8');
            } catch (e) {
                console.log(e);
            }
        },
        _downloadUrls: function(transactions, done) {
            return transactions.reduce(function(soFar, s) {
                return soFar.then(function() {
                    return this._getTransactionInfo(s);
                }.bind(this));
            }.bind(this), new Q()).then(done);
        },
        getPayoutAddress: function() {
            var deferred = Q.defer();
            this.page.evaluate(
                function() {
                    return document.querySelector('body > div > div.jumbotron.text-center > div > a > strong').innerText;
                },
                function(address) {
                    this._writeResult('payinAddress', deferred.resolve)(address);
                }.bind(this)
            );
            return deferred.promise;
        },
        getTransactions: function() {
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
                    // transactions = transactions.slice(0, 25);
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
                if (after) {
                    return after();
                }
            }.bind(this);
        },

        report: {
            errors: [],
            transactions: [],
            transactionsIndex: {}
        }
    };
};
var analyzer = new Analyzer();
module.exports = function(){
    return analyzer;
};