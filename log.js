// log.js

var bunyan = require('bunyan');
var log = bunyan.createLogger({name: "electron-healer"});

module.exports = log;