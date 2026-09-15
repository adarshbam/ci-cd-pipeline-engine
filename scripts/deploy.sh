#!/bin/bash
echo "Deploying..."

sleep 3

echo "Deployed Succesfully"

if [ ! -d "health" ]; then
    mkdir health
fi

cd ./health

echo "true" > health.txt 

cd ../
