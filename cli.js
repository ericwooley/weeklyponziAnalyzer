#!/usr/bin/env node
'use strict';
var meow = require('meow');
var weeklyponzianalyzer = require('./');

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
weeklyponzianalyzer(cli.flags, function(){
    running = false;
});

if(cli.flags.update){
    setInterval(function(){
        if(!running){
            running = true;
            weeklyponzianalyzer(cli.flags, function(){
                running = false;
            });    
        }
    }, cli.flags.update * 1000 * 60);
}
