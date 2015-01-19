'use strict';
var phantom = require('phantom');
var Q = require('q');
var _ = require('lodash-node');
var request = require('request');
var fs = require('fs');
var Analyzer = function(options) {
  options = options || {};
  var renderTime = 10000;
  return {
    options: options,
    log: function() {
      if (this.options.verbose) {
        console.log.apply(this, arguments);
      }
    },
    run: function() {
      return Q.promise(function(resolve) {
        phantom.create(function(ph) {
          ph.createPage(function(page) {
            this.page = page;
            this.ph = ph;
            try {
              this.report = JSON.parse(fs.readFileSync(
                './data.json', 'utf8'));
              this.log('read report', this.report.transactions.length);
            } catch (e) {
              console.log('Error reading data', e);
            }
            this.initialize().then(function() {
              return this.getTimeLeft();
            }.bind(this)).then(function() {
              return this.getPayoutAddress();
            }.bind(this)).then(function() {
              return this.getTransactions();
            }.bind(this)).then(function() {
              this.log('\r complete \n');
              try {
                fs.writeFile('./data.json', JSON.stringify(
                  this.report, null, 5), 'utf-8');
              } catch (e) {
                console.error(e);
              }
            }.bind(this)).then(function() {
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
        this.log('waiting ' + renderTime +
          ' for page to render\n\n-----');
        setTimeout(function() {
          deferred.resolve();
        }.bind(this), renderTime);
      }.bind(this));
      return deferred.promise;
    },
    getTimeLeft: function() {
      return Q.promise(function(resolve) {
        this.page.evaluate(
          /* global document */
          function() {
            return document.querySelector('#countdown1').innerHTML;
          }, this._writeResult('TimeLeft', resolve));
      }.bind(this));
    },
    logError: function(log) {
      this.report.errors.push(log);
    },
    transactionsRetrieved: 0,
    _getTransactionInfo: function(link, status) {
      var txid = link.replace('http://www.blockchain.info/tx/', '');
      link = link.replace('tx', 'tx-index') + '?format=json';
      return Q.promise(function(resolve) {
        if (this.report.transactionsIndex[txid]) {
          resolve();
        } else {
          request.get(link, function(error, response, body) {
            this.transactionsRetrieved++;
            if (this.options.verbose) {
              process.stdout.write('\r Updating transactions: ' +
                this.report.transactions.length + '/' + this.transactionCount
              );
            }
            var tx = JSON.parse(body);
            this._trimTransaction(tx);
            this.report.transactions.push(tx);
            this.report.transactionsIndex[txid] = status;
            if (this.transactionsRetrieved % 10 === 0) {
              this.save();
            }
            resolve();
          }.bind(this));
        }
      }.bind(this));
    },
    _trimTransaction: function(tx) {
      delete tx.double_spend;
      delete tx.ver;
      delete tx.inputs;
      delete tx.lock_time;
      delete tx.relayed_by;
      delete tx.size;
      delete tx.vin_sz;
      delete tx.vout_sz;
      for (var i = 0; i < tx.out.length; i++) {
        var obj = tx.out[0];
        delete obj.n;
        delete obj.spent;
        delete obj.script;
      }
    },
    save: function() {
      try {
        fs.writeFile('./data.json', JSON.stringify(this.report, null, 5),
          'utf-8');
        this.log('saving');
      } catch (e) {
        console.log(e);
      }
    },
    _downloadUrls: function(transactions, done) {
      return transactions.reduce(function(soFar, s) {
        return soFar.then(function() {
          return this._getTransactionInfo(s.link, s.status);
        }.bind(this));
      }.bind(this), new Q()).then(done);
    },
    getPayoutAddress: function() {
      var deferred = Q.defer();
      this.page.evaluate(function() {
        return document.querySelector(
          'body > div > div.jumbotron.text-center > div > a > strong'
        ).innerText;
      }, function(address) {
        this._writeResult('payinAddress', deferred.resolve)(address);
      }.bind(this));
      return deferred.promise;
    },
    getTransactions: function() {
      var deferred = Q.defer();
      this.page.evaluate(function() {
        var rows = document.querySelectorAll('table:nth-child(3) tr');
        var data = [];
        for (var i = rows.length - 1; i >= 0; i--) {
          var row = rows[i];
          var link = row.querySelector('td:nth-child(4) > a');
          if(link) {
            var url = link.getAttribute('href');
            var status = row.querySelector('td:nth-child(5)').innerHTML;
            data.push({
              status: status,
              link: url
            });
          }
        }
        return data;
      }, function(transactions) {
        if (this.options.debug) {
          transactions = transactions.slice(0, 25);
        }
        this.transactionCount = transactions.length;
        this._writeResult('TransactionCount')(transactions.length);
        this._downloadUrls(transactions, deferred.resolve);
      }.bind(this));
      return deferred.promise;
    },
    _writeResult: function(preText, after) {
      return function(result) {
        this.report.lastUpdated = new Date();
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
module.exports = Analyzer;
