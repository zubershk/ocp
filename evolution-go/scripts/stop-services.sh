#!/bin/bash
echo 'Stopping Orange Cheese Pizza Bot...'
systemctl --user stop orange-cheese-pizza-bot.service
echo 'Stopping Evolution GO...'
systemctl --user stop evolution-go.service
echo 'Services stopped.'
