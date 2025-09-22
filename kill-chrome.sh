#!/bin/bash
echo "Killing existing Chrome processes..."
pkill -f chrome
pkill -f chromium
sleep 2
echo "Chrome processes killed. You can now run the test."
