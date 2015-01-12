#!/usr/bin/env node
'use strict';
var meow = require('meow');
var weeklyponzianalyzer = require('./');

var cli = meow({
  help: [
    'Usage',
    '  weeklyponzianalyzer <input>',
    '',
    'Example',
    '  weeklyponzianalyzer Unicorn'
  ].join('\n')
});

weeklyponzianalyzer(cli.flags);
