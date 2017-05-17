var Particle = require('particle-api-js');
var particle = new Particle();
var authParticle = require('./secrets/particle');
var es;
var token;

var testEvents = require('./secrets/testEvents');

particle.login({username: authParticle.user_name, password: authParticle.password}).then(
  function(data) {
    token = data.body.access_token;
    console.log("Logged in to Particle, setting up device event stream");
    particle.getEventStream({ deviceId: 'mine', auth: token }).then(function(stream) {
      stream.on('event', parseEvents);
    });

    // setTimeout(function() {
    //   parseSafeMode(testEvents.basic);  
    // }, 1000);
  },
  function (err) {
    console.log('Could not log in.', err);
  }
);

var parseEvents = function(event) {
  switch(event.name) {
    case 'spark/status': 
      console.log('Device ' + event.coreid + ' status: ' + event.data);
      break;
    case 'spark/device/app-hash':
      console.log('Device ' + event.coreid + ' has new firmware: ' + event.data);
      break;
    case 'spark/status/safe-mode': 
      parseSafeMode(event);
      break;
  }
}

var parseSafeMode = function(event) {
  console.log('Device ' + event.coreid + ' is in safe mode');
  var safeModeData = JSON.parse(event.data);
  console.log('Device info:');
  console.log('     Platform: ' + safeModeData.p + ' - Name: ' + platformIdToName(safeModeData.p));
  console.log('     IMEI: ' + safeModeData.imei + ' - ICCID: ' + safeModeData.iccid);
  var modules = safeModeData.m;
  console.log('     Modules: ');
  for (var i = 0; i < modules.length; i++) {
    var module = modules[i];
    console.log('          Function: ' + moduleFunction(module.f) + ' - Num: ' + module.n + ' - Version: ' + module.v + ' - Dependencies: ' + (module.d.length ? 'Yes' : 'No'));
    if (module.d.length) {
      for (var j = 0; j < module.d.length; j++) {
        console.log('               Dependency: Function: ' + moduleFunction(module.d[j].f) + ' - Num: ' + module.d[j].n + ' - Version: ' + module.d[j].v);
      }
    }
  }

  // find the key modules
  var userPart = modules.find(findUserPart);
  var systemPart1 = modules.find(findSystemPart1);
  var systemPart2 = modules.find(findSystemPart2);
  var systemPart3 = modules.find(findSystemPart3);

  console.log({
    userPart: userPart,
    systemPart1: systemPart1,
    systemPart2: systemPart2,
    systemPart3: systemPart3,
  })

  // check if the system has the right modules
  var userPartRequires = userPart.d[0].v;

  if (parseInt(systemPart1.v, 10) < 21 || parseInt(systemPart2.v, 10) < 21) {
    console.log('All devices should be running 0.5.3, especially if you want to get to 0.6.X versions');
    if (parseInt(systemPart1.v, 10) < 21) {
      flashSystem(21, 1, event.coreid);
    } else if (parseInt(systemPart2.v, 10) < 21) {
      flashSystem(21, 2, event.coreid);
    }
  }

  if (parseInt(userPartRequires, 10) > parseInt(systemPart3.v, 10)) {
    console.log('The application requires system ' + userPartRequires + ' system part 1 (3) version is ' + systemPart3.v);
    flashSystem(userPartRequires, 1, event.coreid);
  } else if(parseInt(userPartRequires, 10) > parseInt(systemPart1.v, 10)) {
    console.log('The application requires system ' + userPartRequires + ' system part 2 (1) version is ' + systemPart1.v);
    flashSystem(userPartRequires, 2, event.coreid);
  } else if(parseInt(userPartRequires, 10) > parseInt(systemPart2.v, 10)) {
    console.log('The application requires system ' + userPartRequires + ' system part 3 (2) version is ' + systemPart2.v);
    flashSystem(userPartRequires, 3, event.coreid);
  } else {
    console.log('The application version requirement, ' + userPartRequires + ' is less than or equal to the system versions for part 1 (3), ' + systemPart3.v + ', part 2 (1), ' + systemPart1.v + ', and part 3 (2), ' + systemPart2.v);
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
    switch(v) {
      case 108:
        // this is 0.6.2
        break;
      case 105:
        // this is 0.6.1
        break;
      case 102:
        // this is 0.6.0
        break;
      case 21:
        // this is 0.5.3
        break;
      case 17:
        // this is 0.5.2
        break;
      case 15:
        // this is 0.5.1
        break;
    }
    return v;
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
      if (data.body.ok) { console.log("Event published succesfully") }
    },
    function(err) {
      console.log("Failed to publish event: " + err)
    }
  );

  console.log(info);
  particle.flashDevice({ deviceId: address, files: { file1: firmwareSystemVersion[version.toString()][part - 1] }, auth: token }).then(function(data) {
    console.log('Flashing part ' + part + ' of ' + version + ':', data);
  }, function(err) {
    console.log('An error occurred while flashing the device:', err);
  });
}