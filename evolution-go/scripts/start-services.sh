#!/bin/bash
echo 'Starting Orange Cheese Pizza WhatsApp services...'
echo 'Starting Evolution GO...'
systemctl --user start evolution-go.service
echo 'Starting Orange Cheese Pizza Bot...'
systemctl --user start orange-cheese-pizza-bot.service
echo 'Waiting for services to start...'
sleep 3
echo ''
./status-services.sh
