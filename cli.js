#!/usr/bin/env node
'use strict';
var meow = require('meow');
var Weeklyponzianalyzer = require('./');

var cli = meow({
  help: [
    'Usage',
    '  weeklyponzianalyzer --updateTime=(minutes)',
    '',
    'Example',
    '  weeklyponzianalyzer --update=1 # update every minute'
  ].join('\n')
});
var running = true;
new Weeklyponzianalyzer(cli.flags).run().then(function(){
    running = false;
});

if(cli.flags.update){
    setInterval(function(){
        if(!running){
            running = true;
            new Weeklyponzianalyzer(cli.flags).run().then(function(){
                running = false;
            });
        }
    }, cli.flags.update * 1000 * 60);
}
