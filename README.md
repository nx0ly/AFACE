# AFACE
## Annoying As Fuck Colombian Extension
Chrome extension that makes going to sites as annoying as possible

## Features
- Locking pages
- Minigames
    - Tejos
    - Roulette
- Punishments
    - Cleaning capybaras mud
    - Closing all the moving ads
    - Eps queue

## How to install

### Chrome
1. Get the [latest release](https://github.com/some-du6e/macondo-boringizer/releases/latest) chrome file
2. Unzip the file
3. Go to `chrome://extensions/` and turn on developer mode
4. Click `Load unpacked` and select the unzipped file
### Firefox
1. Go to the [latest release](https://github.com/some-du6e/macondo-boringizer/releases/latest)
2. Click on the file ending with xpi
3. A popup like this will show up, click continue to installation and continue normally
![trust popup](imgs/firefox%20popup.png)


## Contributing
Requirements: 
- bun 1.2.0
- nodejs 22.12+ (just in case)
1. Install packages
```bash
bun i
```
### running it in dev
```bash
bun run dev
```

### building for chrome/firefox/edge
```bash
bun run build:chrome/firefox/edge
```
