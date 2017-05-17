var Particle = require('particle-api-js');
var particle = new Particle();
var authParticle = require('./secrets/particle');
var token;

var EventSource = require('eventsource');

var log = require('./log.js');

particle.login({username: authParticle.user_name, password: authParticle.password}).then(
  function(data) {
    token = data.body.access_token;
    log.info("Logged in to Particle, setting up device event stream");

    // using event source instead of Particle api, as it doesn't seem to
    // be reliable for subscribing to events... seems weird
    var es = new EventSource('https://api.particle.io/v1/devices/events?access_token=' + token);
    es.addEventListener('spark/status', parseEvents);
    es.addEventListener('spark/device/app-hash', parseEvents);
    es.addEventListener('spark/status/safe-mode', parseEvents);
    es.addEventListener('spark/flash/status', parseEvents);
    es.addEventListener('open', function(e) {
      log.info("Connection to Particle events is open");
    }, false);
    es.addEventListener('error', function(e) {
      if (e.readyState == EventSource.CLOSED) {
        log.error("Connection was closed");
      }
    }, false);
  },
  function (err) {
    log.info('Could not log in to Particle.', err);
  }
);

var parseEvents = function(event) {
  var data = JSON.parse(event.data);
  switch(event.type) {
    case 'spark/status': 
      log.info('Device ' + data.coreid + ' status: ' + data.data);
      break;
    case 'spark/flash/status': 
      log.info('Device ' + data.coreid + ' flash status: ' + data.data);
      break;
    case 'spark/device/app-hash':
      log.info('Device ' + data.coreid + ' has new firmware: ' + data.data);
      break;
    case 'spark/status/safe-mode': 
      parseSafeMode(data);
      break;
  }
}

var parseSafeMode = function(event) {
  log.info('Device ' + event.coreid + ' is in safe mode');
  var safeModeData = JSON.parse(event.data);
  var obj = {
    address: event.coreid,
    publishedAt: event.published_at,
    name: event.name,
    platformId: safeModeData.p,
    platform: platformIdToName(safeModeData.p),
    imei: safeModeData.imei,
    iccid: safeModeData.iccid,
    modules: [],
  };
  var modules = safeModeData.m;
  for (var i = 0; i < modules.length; i++) {
    var module = modules[i];
    var moduleObj = {
      function: module.f,
      name: module.n,
      version: module.v,
      versionName: moduleVersion(module.v, module.f),
      dependencies: [],
    };
    obj.modules.push(moduleObj);
    if (module.d.length) {
      for (var j = 0; j < module.d.length; j++) {
        var dependencyObj = {
          function: moduleFunction(module.d[j].f),
          name: module.d[j].n,
          version: module.d[j].v),
        };
        obj.modules.moduleObj[i].dependencies.push(dependencyObj);
      }
    }
  }

  // find the key modules
  obj.userPart = modules.find(findUserPart);
  obj.systemPart1 = modules.find(findSystemPart1);
  obj.systemPart2 = modules.find(findSystemPart2);
  obj.systemPart3 = modules.find(findSystemPart3);

  log.info(obj);

  if (obj.platformId !== 10) {
    log.error('Cancelling update... This library is not working for anything other than the Electron');
    return;
  }

  // check if the system has the right modules
  var userPartRequires = obj.userPart.d[0].v;

  if (parseInt(obj.systemPart1.v, 10) < 21 || parseInt(obj.systemPart2.v, 10) < 21) {
    log.warn('All devices should be running 0.5.3, especially if you want to get to 0.6.X versions');
    if (parseInt(obj.systemPart1.v, 10) < 21) {
      flashSystem(21, 1, obj.address);
    } else if (parseInt(obj.systemPart2.v, 10) < 21) {
      flashSystem(21, 2, obj.address);
    }
  }

  if (obj.systemPart3 == null && parseInt(userPartRequires, 10) > parseInt(obj.systemPart1.v, 10)) {
    flashSystem(userPartRequires, 1, obj.address);
  } else if (parseInt(userPartRequires, 10) > parseInt(obj.systemPart3.v, 10)) {
    log.info('The application requires system ' + userPartRequires + ' system part 1 (3) version is ' + obj.systemPart3.v);
    flashSystem(userPartRequires, 1, obj.address);
  } else if(parseInt(userPartRequires, 10) > parseInt(obj.systemPart1.v, 10)) {
    log.info('The application requires system ' + userPartRequires + ' system part 2 (1) version is ' + obj.systemPart1.v);
    flashSystem(userPartRequires, 2, obj.address);
  } else if(parseInt(userPartRequires, 10) > parseInt(obj.systemPart2.v, 10)) {
    log.info('The application requires system ' + userPartRequires + ' system part 3 (2) version is ' + obj.systemPart2.v);
    flashSystem(userPartRequires, 3, obj.address);
  } else {
    log.info('The application version requirement, ' + userPartRequires + ' is less than or equal to the system versions for part 1 (3), ' + obj.systemPart3.v + ', part 2 (1), ' + obj.systemPart1.v + ', and part 3 (2), ' + obj.systemPart2.v);
  }
}

function platformIdToName(p) {
  var platformName = 'N/A';
  switch(p) {
    case 0:
      platformName = 'Core';
      break;
    case 6:
      platformName = 'Photon';
      break;
    case 10:
      platformName = 'Electron';
      break;
    default: 
      platformName = 'N/A';
  }
  return platformName;
}

function moduleStoreLocation(l) {
  var location = 'N/A';
  switch(l) {
    case 'm':
      location = 'MODULE_STORE_MAIN';
      break;
    case 'b':
      location = 'MODULE_STORE_BACKUP';
      break;
    case 'f':
      location = 'MODULE_STORE_FACTORY';
      break;
    case 't':
      location = 'MODULE_STORE_SCRATCHPAD';
      break;
    default: 
      location = 'N/A';
  }
  return location;
}

function moduleFunction(l) {
  var modFunc = 'N/A';
  switch(l) {
    case 'n':
      modFunc = 'MODULE_FUNCTION_NONE';
      break;
    case 'r':
      modFunc = 'MODULE_FUNCTION_RESOURCE';
      break;
    case 'b':
      modFunc = 'MODULE_FUNCTION_BOOTLOADER';
      break;
    case 'm':
      modFunc = 'MODULE_FUNCTION_MONO_FIRMWARE';
      break;
    case 's':
      modFunc = 'MODULE_FUNCTION_SYSTEM_PART';
      break;
    case 'u':
      modFunc = 'MODULE_FUNCTION_USER_PART';
      break;
    default: 
      modFunc = 'N/A';
  }
  return modFunc;
}

function moduleVersion(v, f) {
  if (f === 's') {
    // this is a system module, so we should be able to tell what system version we have or need
    var name = 'N/A';
    switch(v) {
      case 108:
        // this is 0.6.2
        name = '0.6.2';
        break;
      case 105:
        // this is 0.6.1
        name = '0.6.1';
        break;
      case 102:
        // this is 0.6.0
        name = '0.6.0';
        break;
      case 21:
        // this is 0.5.3
        name = '0.5.3';
        break;
      case 17:
        // this is 0.5.2
        name = '0.5.2';
        break;
      case 15:
        // this is 0.5.1
        name = '0.5.1';
        break;
    }
    return name;
  } else {
    return v;
  }
}

function findUserPart(module) {
  return module.f === 'u';
}
function findSystemPart1(module) {
  return findSystemPart(module, '1');
}
function findSystemPart2(module) {
  return findSystemPart(module, '2');
}
function findSystemPart3(module) {
  return findSystemPart(module, '3');
}
function findSystemPart(module, number) {
  return module.f === 's' && module.n === number; 
}

var firmwareSystemVersion = {
  '108': ['./firmwareSystem/system-part1-0.6.2-electron.bin', './firmwareSystem/system-part2-0.6.2-electron.bin', './firmwareSystem/system-part3-0.6.2-electron.bin'],
  '105': ['./firmwareSystem/system-part1-0.6.1-electron.bin', './firmwareSystem/system-part2-0.6.1-electron.bin', './firmwareSystem/system-part3-0.6.1-electron.bin'],
  '102': ['./firmwareSystem/system-part1-0.6.0-electron.bin', './firmwareSystem/system-part2-0.6.0-electron.bin', './firmwareSystem/system-part3-0.6.0-electron.bin'],
  '21': ['./firmwareSystem/system-part1-0.5.3-electron.bin', './firmwareSystem/system-part2-0.5.3-electron.bin'],
  // '17': ['./firmwareSystem/system-part1-0.5.2-electron.bin', './firmwareSystem/system-part2-0.5.2-electron.bin'],
  // '15': ['./firmwareSystem/system-part1-0.5.1-electron.bin', './firmwareSystem/system-part2-0.5.1-electron.bin'],
}

function flashSystem(version, part, address) {

  var info = 'Flashing firmware: ' + firmwareSystemVersion[version.toString()][part - 1] + ' to device ' + address;
  var publishEventPr = particle.publishEvent({ name: 'device_management/safe-mode-updater', data: info, auth: token, isPrivate: true });

  publishEventPr.then(
    function(data) {
      if (data.body.ok) { log.info("Event published succesfully") }
    },
    function(err) {
      log.info("Failed to publish event: " + err)
    }
  );

  log.info(info);
  particle.flashDevice({ deviceId: address, files: { file1: firmwareSystemVersion[version.toString()][part - 1] }, auth: token }).then(function(data) {
    log.info('Flashing part ' + part + ' of ' + version + ':', data);
  }, function(err) {
    log.info('An error occurred while flashing the device:', err);
  });
}