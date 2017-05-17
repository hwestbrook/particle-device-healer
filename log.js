// log.js

var bunyan = require('bunyan');
var log = bunyan.createLogger({name: "rpi_wm"});

module.exports = log;