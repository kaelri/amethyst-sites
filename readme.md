I wrote this script for my own use. I’m in the habit of running a number of locally-hosted websites, both personal and professional—mostly WordPress and other PHP applications. Whenever I create a new local site, I need to:

1. Add the domain to my system `hosts` file.
2. Add an entry to Apache’s virtual hosts (`vhosts`) file.
3. Generate a self-signed SSL certificate in order to make HTTPS work.
4. Add the SSL certificate to my system keychain and remove the old one.
5. Restart the Apache service.

This script (almost) fully automates that process. It needs to be run with `sudo` in order to save changes to `hosts`, and the keychain update requires another password or biometric authentication. I also typically need to restart my browser afterward. Nonetheless, this is now saving me a lot of time! Creating a new, locally-served, HTTPS-enabled web domain is now as simple as adding a few lines to a config file:

```yaml
  - domain:  newsite.local
    alias:   www.newsite.local
    path:    /Users/kaelri/Sites/newsite
    server:  apache
```
