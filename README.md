# particle-device-healer

This is a node script to:
- Login to Particle's platform
- Monitor for devices in Safe Mode
- Update any Electrons in safe mode to the firmware the user part of their firmware requires
- Log all of this to your terminal

In order to get this up and running, you need to create a directory named 'secrets', then place a file named 'particle.js' with the following contents in that directoy:

```
const particle = {
  user_name: 'your_user_name',
  password: 'your_password'
};

module.exports = particle;
``` 

Then install npm packages with `npm install` and run with `node index.js`

## Notes

This script ignores Photons and Cores, as they are already updated by default by Particle's system.

All devices that go into safe mode with a firmware less than 0.5.3 will be updated to 0.5.3. I could have written this another way, but in my experience, all devices should be updated to at least 0.5.3 and making this call makes this script less complicated with the two part / three part system firmware transition.

## Future

I'd like to make this into a plugin, as opposed to a script, as it seems like it would work well as part of a larger application.