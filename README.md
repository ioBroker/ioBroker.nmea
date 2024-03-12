# ioBroker.nmea

## How to use it on raspberry PI with Pican-M

Edit file `/boot/config.txt` (with `sudo nano /boot/config.txt`) and add the following lines to the end of the file:
```
enable_uart=1
dtparam=i2c_arm=on
dtparam=spi=on
dtoverlay=mcp2515-can0,oscillator=16000000,interrupt=25 
```

Disable outputs on UART console: 
- start in CLI `sudo raspi-config`
- go to `3 Interface Options`
- go ot `I5 Serial Port`
- Disable `shell accessible over serial` and `serial port hardware enabled`
- Exit from raspi-config and reboot

Install can-utils
```
sudo apt-get install can-utils
```

## Todo
- Encode code
- AIS
- find out why sent data from address 100
